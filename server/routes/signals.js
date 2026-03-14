import { Router } from 'express';
import db from '../db.js';
import { requireAuth } from '../auth.js';

const router = Router();

// GET /api/signals?panel=ai_signal|financial_ai
router.get('/', requireAuth, (req, res) => {
  const { panel } = req.query;
  const rows = panel
    ? db.prepare('SELECT * FROM panel_signals WHERE panel = ? ORDER BY created_at DESC').all(panel)
    : db.prepare('SELECT * FROM panel_signals ORDER BY created_at DESC').all();
  res.json({ signals: rows });
});

// POST /api/signals
router.post('/', requireAuth, (req, res) => {
  const { title, url, panel } = req.body;
  if (!title || !url || !panel) return res.status(400).json({ error: 'title, url and panel required' });
  if (!['ai_signal', 'financial_ai'].includes(panel)) return res.status(400).json({ error: 'Invalid panel' });

  const result = db.prepare(
    'INSERT INTO panel_signals (title, url, panel, added_by) VALUES (?, ?, ?, ?)'
  ).run(title.trim(), url.trim(), panel, req.user.name);

  const signal = db.prepare('SELECT * FROM panel_signals WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ signal });
});

// POST /api/signals/bulk — import up to 15 signals at once
router.post('/bulk', requireAuth, (req, res) => {
  const { items, panel } = req.body;
  if (!Array.isArray(items) || !panel) return res.status(400).json({ error: 'items array and panel required' });
  if (!['ai_signal', 'financial_ai'].includes(panel)) return res.status(400).json({ error: 'Invalid panel' });

  const insert = db.prepare('INSERT INTO panel_signals (title, url, panel, added_by) VALUES (?, ?, ?, ?)');
  const insertMany = db.transaction((rows) => {
    for (const row of rows.slice(0, 15)) {
      if (!row.title || !row.url) continue;
      insert.run(row.title.trim(), row.url.trim(), panel, req.user.name);
    }
  });
  insertMany(items);

  const signals = db.prepare('SELECT * FROM panel_signals WHERE panel = ? ORDER BY created_at DESC').all(panel);
  res.status(201).json({ signals });
});

// DELETE /api/signals — bulk delete
router.delete('/', requireAuth, (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids array required' });
  const del = db.transaction(() => {
    for (const id of ids) db.prepare('DELETE FROM panel_signals WHERE id = ?').run(id);
  });
  del();
  res.json({ success: true, deleted: ids.length });
});

// DELETE /api/signals/:id
router.delete('/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM panel_signals WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

export default router;
