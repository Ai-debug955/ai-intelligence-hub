import { Router } from 'express';
import db from '../db.js';
import { requireAuth, requireAdmin } from '../auth.js';

const router = Router();

// GET /api/insights — list all insights (with optional filters)
router.get('/', requireAuth, (req, res) => {
  const { category, impact, status, entry_type, search } = req.query;

  let query = 'SELECT * FROM insights WHERE 1=1';
  const params = [];

  if (category && category !== 'All') {
    query += ' AND category = ?';
    params.push(category);
  }
  if (impact && impact !== 'All') {
    query += ' AND impact = ?';
    params.push(impact);
  }
  if (status === 'Needs Review') {
    query += ' AND needs_review = 1';
  } else if (status === 'Reviewed') {
    query += ' AND needs_review = 0';
  }
  if (entry_type && entry_type !== 'All') {
    query += ' AND entry_type = ?';
    params.push(entry_type);
  }
  if (search) {
    query += ' AND (title LIKE ? OR tags LIKE ? OR sources LIKE ?)';
    const s = `%${search}%`;
    params.push(s, s, s);
  }

  query += ' ORDER BY created_at DESC';

  const insights = db.prepare(query).all(...params);

  // Parse sources JSON for each insight
  const parsed = insights.map(i => ({
    ...i,
    urls: JSON.parse(i.sources || '[]'),
    needs_review: !!i.needs_review
  }));

  res.json({ insights: parsed });
});

// POST /api/insights — submit new insight
router.post('/', requireAuth, (req, res) => {
  const { id, title, urls, category, impact, tags, description, entry_type } = req.body;
  const insightId = id || Math.random().toString(36).substr(2, 9);

  if (!title && (!urls || urls.length === 0)) {
    return res.status(400).json({ error: 'Title or at least one URL required' });
  }

  db.prepare(`
    INSERT INTO insights (id, title, summary, description, category, impact, tags, sources, key_points, submitted_by, reviewed_by, created_at, needs_review, entry_type)
    VALUES (?, ?, '', ?, ?, ?, ?, ?, '', ?, '', ?, 1, ?)
  `).run(
    insightId,
    title || urls?.[0] || 'Untitled',
    description || '',
    category || 'Other',
    impact || 'Other',
    tags || '',
    JSON.stringify(urls || []),
    req.user.name,
    new Date().toISOString(),
    entry_type || 'intelligence'
  );

  const insight = db.prepare('SELECT * FROM insights WHERE id = ?').get(insightId);
  res.status(201).json({
    insight: {
      ...insight,
      urls: JSON.parse(insight.sources || '[]'),
      needs_review: !!insight.needs_review
    }
  });
});

// PUT /api/insights/:id — update insight (review, edit)
router.put('/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM insights WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Insight not found' });

  const {
    title, summary, description, category, impact, tags,
    urls, key_points, needs_review, reviewed_by, entry_type, reviewer_notes
  } = req.body;

  db.prepare(`
    UPDATE insights SET
      title = COALESCE(?, title),
      summary = COALESCE(?, summary),
      description = COALESCE(?, description),
      category = COALESCE(?, category),
      impact = COALESCE(?, impact),
      tags = COALESCE(?, tags),
      sources = COALESCE(?, sources),
      key_points = COALESCE(?, key_points),
      needs_review = COALESCE(?, needs_review),
      reviewed_by = COALESCE(?, reviewed_by),
      entry_type = COALESCE(?, entry_type),
      reviewer_notes = COALESCE(?, reviewer_notes)
    WHERE id = ?
  `).run(
    title ?? null,
    summary ?? null,
    description ?? null,
    category ?? null,
    impact ?? null,
    tags ?? null,
    urls ? JSON.stringify(urls) : null,
    key_points ?? null,
    needs_review !== undefined ? (needs_review ? 1 : 0) : null,
    reviewed_by ?? null,
    entry_type ?? null,
    reviewer_notes ?? null,
    id
  );

  // If reviewing, also create a review record
  if (needs_review === false && (summary || key_points)) {
    db.prepare(`
      INSERT INTO reviews (insight_id, reviewer, summary, key_points)
      VALUES (?, ?, ?, ?)
    `).run(id, req.user.name, summary || '', key_points || '');
  }

  const updated = db.prepare('SELECT * FROM insights WHERE id = ?').get(id);
  res.json({
    insight: {
      ...updated,
      urls: JSON.parse(updated.sources || '[]'),
      needs_review: !!updated.needs_review
    }
  });
});

// DELETE /api/insights — bulk delete (admin only)
router.delete('/', requireAuth, requireAdmin, (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids array required' });
  const del = db.transaction(() => {
    for (const id of ids) db.prepare('DELETE FROM insights WHERE id = ?').run(id);
  });
  del();
  res.json({ success: true, deleted: ids.length });
});

// DELETE /api/insights/:id — admin only
router.delete('/:id', requireAuth, requireAdmin, (req, res) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT id FROM insights WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Insight not found' });
  db.prepare('DELETE FROM insights WHERE id = ?').run(id);
  res.json({ success: true });
});

export default router;
