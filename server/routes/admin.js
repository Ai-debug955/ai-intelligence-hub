import { Router } from 'express';
import db from '../db.js';
import { requireAuth, requireAdmin } from '../auth.js';

const router = Router();

// ─── USERS ──────────────────────────────────────────────────────────

// GET /api/admin/users
router.get('/users', requireAuth, requireAdmin, (req, res) => {
  const users = db.prepare('SELECT id, name, email, role, active, created_at FROM users ORDER BY created_at DESC').all();
  res.json({ users });
});

// PATCH /api/admin/users/:id/role
router.patch('/users/:id/role', requireAuth, requireAdmin, (req, res) => {
  const { role } = req.body;
  if (!['admin', 'user'].includes(role)) return res.status(400).json({ error: 'role must be admin or user' });
  if (parseInt(req.params.id) === req.user.id && role !== 'admin')
    return res.status(400).json({ error: 'Cannot demote yourself' });
  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, req.params.id);
  const user = db.prepare('SELECT id, name, email, role, active, created_at FROM users WHERE id = ?').get(req.params.id);
  res.json({ user });
});

// PATCH /api/admin/users/:id/active
router.patch('/users/:id/active', requireAuth, requireAdmin, (req, res) => {
  const { active } = req.body;
  if (typeof active !== 'boolean') return res.status(400).json({ error: 'active must be boolean' });
  if (parseInt(req.params.id) === req.user.id && !active)
    return res.status(400).json({ error: 'Cannot deactivate yourself' });
  db.prepare('UPDATE users SET active = ? WHERE id = ?').run(active ? 1 : 0, req.params.id);
  const user = db.prepare('SELECT id, name, email, role, active, created_at FROM users WHERE id = ?').get(req.params.id);
  res.json({ user });
});

// DELETE /api/admin/users/:id
router.delete('/users/:id', requireAuth, requireAdmin, (req, res) => {
  if (parseInt(req.params.id) === req.user.id) return res.status(400).json({ error: 'Cannot delete yourself' });
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ─── STATS ──────────────────────────────────────────────────────────

// GET /api/admin/stats
router.get('/stats', requireAuth, requireAdmin, (req, res) => {
  const todayISO = new Date().toISOString().slice(0, 10) + 'T00:00:00';

  const totalUsers     = db.prepare('SELECT COUNT(*) as n FROM users').get().n;
  const totalInsights  = db.prepare('SELECT COUNT(*) as n FROM insights').get().n;
  const pendingReview  = db.prepare('SELECT COUNT(*) as n FROM insights WHERE needs_review = 1').get().n;
  const totalReports   = db.prepare('SELECT COUNT(*) as n FROM reports').get().n;
  const highImpact     = db.prepare("SELECT COUNT(*) as n FROM insights WHERE impact = 'High'").get().n;
  const submittedToday = db.prepare("SELECT COUNT(*) as n FROM insights WHERE created_at >= ?").get(todayISO).n;
  const reviewedToday  = db.prepare("SELECT COUNT(*) as n FROM reviews WHERE review_date >= ?").get(todayISO).n;

  const submittersTodayRows = db.prepare("SELECT DISTINCT submitted_by FROM insights WHERE created_at >= ?").all(todayISO);
  const reviewersTodayRows  = db.prepare("SELECT DISTINCT reviewer FROM reviews WHERE review_date >= ?").all(todayISO);
  const activeToday = new Set([
    ...submittersTodayRows.map(r => r.submitted_by),
    ...reviewersTodayRows.map(r => r.reviewer)
  ]).size;

  const topSubmitters = db.prepare(`
    SELECT submitted_by, COUNT(*) as count
    FROM insights GROUP BY submitted_by ORDER BY count DESC LIMIT 10
  `).all();

  const categoryBreakdown = db.prepare(`
    SELECT category, COUNT(*) as count
    FROM insights GROUP BY category ORDER BY count DESC
  `).all();

  res.json({ stats: {
    totalUsers, totalInsights, pendingReview, totalReports,
    highImpact, submittedToday, reviewedToday, activeToday,
    topSubmitters, categoryBreakdown
  }});
});

// ─── ACTIVITY FEED ───────────────────────────────────────────────────

// GET /api/admin/activity
router.get('/activity', requireAuth, requireAdmin, (req, res) => {
  const submissions = db.prepare(`
    SELECT 'submitted' as type, id as ref_id, title, submitted_by as actor, created_at as ts
    FROM insights ORDER BY created_at DESC LIMIT 20
  `).all();

  const reviews = db.prepare(`
    SELECT 'reviewed' as type, r.insight_id as ref_id, i.title, r.reviewer as actor, r.review_date as ts
    FROM reviews r LEFT JOIN insights i ON r.insight_id = i.id
    ORDER BY r.review_date DESC LIMIT 20
  `).all();

  const reports = db.prepare(`
    SELECT 'report' as type, CAST(id as TEXT) as ref_id, 'Monthly Report' as title,
           generated_by as actor, generated_at as ts
    FROM reports ORDER BY generated_at DESC LIMIT 10
  `).all();

  const feed = [...submissions, ...reviews, ...reports]
    .sort((a, b) => new Date(b.ts) - new Date(a.ts))
    .slice(0, 30);

  res.json({ activity: feed });
});

// ─── BULK ACTIONS ────────────────────────────────────────────────────

// POST /api/admin/insights/bulk-publish
router.post('/insights/bulk-publish', requireAuth, requireAdmin, (req, res) => {
  const { ids } = req.body;
  const now = new Date().toISOString();

  const publish = db.transaction(() => {
    if (Array.isArray(ids) && ids.length > 0) {
      for (const id of ids) {
        db.prepare(`UPDATE insights SET needs_review = 0, reviewed_by = ?, reviewed_at = ?
          WHERE id = ? AND needs_review = 1`).run(req.user.name, now, id);
      }
      return ids.length;
    } else {
      const result = db.prepare(`UPDATE insights SET needs_review = 0, reviewed_by = ?, reviewed_at = ?
        WHERE needs_review = 1`).run(req.user.name, now);
      return result.changes;
    }
  });

  const count = publish();
  res.json({ success: true, published: count });
});

// POST /api/admin/insights/bulk-upload
router.post('/insights/bulk-upload', requireAuth, requireAdmin, (req, res) => {
  const { entries } = req.body;
  if (!Array.isArray(entries) || entries.length === 0)
    return res.status(400).json({ error: 'entries array required' });
  if (entries.length > 100)
    return res.status(400).json({ error: 'Max 100 entries per upload' });

  const insert = db.prepare(`
    INSERT INTO insights
      (id, title, summary, description, category, impact, tags, sources,
       key_points, submitted_by, reviewed_by, created_at, needs_review, entry_type, reviewed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'intelligence', ?)
  `);

  const now = new Date().toISOString();
  const insertAll = db.transaction((rows) => {
    let count = 0;
    for (const e of rows) {
      if (!e.title) continue;
      const id = Math.random().toString(36).substr(2, 9);
      const published = e.needs_review === false;
      insert.run(
        id, e.title, e.summary || '', e.description || '',
        e.category || 'Other', e.impact || 'Other', e.tags || '',
        JSON.stringify(Array.isArray(e.urls) ? e.urls : (e.url ? [e.url] : [])),
        e.key_points || '', req.user.name,
        published ? req.user.name : '',
        now, published ? 0 : 1, published ? now : null
      );
      count++;
    }
    return count;
  });

  const count = insertAll(entries);
  res.json({ success: true, inserted: count });
});

// GET /api/admin/export
router.get('/export', requireAuth, requireAdmin, (_req, res) => {
  const users         = db.prepare('SELECT id, name, email, role, active, created_at FROM users').all();
  const insights      = db.prepare('SELECT * FROM insights').all();
  const reviews       = db.prepare('SELECT * FROM reviews').all();
  const reports       = db.prepare('SELECT * FROM reports').all();
  const panel_signals = db.prepare('SELECT * FROM panel_signals').all();
  const ai_logs       = db.prepare('SELECT * FROM ai_logs').all();
  res.json({ users, insights, reviews, reports, panel_signals, ai_logs });
});

export default router;
