import { Router } from 'express';
import db from '../db.js';
import { requireAuth, requireAdmin, checkAiLimit } from '../auth.js';
import { groqChat } from '../groq.js';

const router = Router();

// ─── STAGE ROUTES ────────────────────────────────────────────────────

// GET /api/learn/stages — list all stages ordered by position, with resource_count
router.get('/stages', requireAuth, (req, res) => {
  const stages = db.prepare(`
    SELECT s.*, COUNT(r.id) AS resource_count
    FROM learn_stages s
    LEFT JOIN learn_resources r ON r.stage_id = s.id
    GROUP BY s.id
    ORDER BY s.position ASC
  `).all();
  res.json(stages);
});

// POST /api/learn/stages — create stage (admin only)
router.post('/stages', requireAuth, requireAdmin, (req, res) => {
  const { title, description, difficulty_start, difficulty_end } = req.body;
  if (!title) return res.status(400).json({ error: 'Title is required' });

  const maxPos = db.prepare('SELECT COALESCE(MAX(position), -1) AS maxp FROM learn_stages').get().maxp;
  const result = db.prepare(`
    INSERT INTO learn_stages (title, description, position, difficulty_start, difficulty_end)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    title,
    description || '',
    maxPos + 1,
    difficulty_start || 'Beginner',
    difficulty_end || 'Beginner'
  );

  const stage = db.prepare('SELECT * FROM learn_stages WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(stage);
});

// PUT /api/learn/stages/:id — update stage (admin only)
router.put('/stages/:id', requireAuth, requireAdmin, (req, res) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM learn_stages WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Stage not found' });

  const { title, description, difficulty_start, difficulty_end, position } = req.body;

  db.prepare(`
    UPDATE learn_stages SET
      title = COALESCE(?, title),
      description = COALESCE(?, description),
      difficulty_start = COALESCE(?, difficulty_start),
      difficulty_end = COALESCE(?, difficulty_end),
      position = COALESCE(?, position)
    WHERE id = ?
  `).run(
    title ?? null,
    description ?? null,
    difficulty_start ?? null,
    difficulty_end ?? null,
    position !== undefined ? position : null,
    id
  );

  const stage = db.prepare('SELECT * FROM learn_stages WHERE id = ?').get(id);
  res.json(stage);
});

// DELETE /api/learn/stages/:id — delete stage (admin only), nullify resources' stage_id
router.delete('/stages/:id', requireAuth, requireAdmin, (req, res) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT id FROM learn_stages WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Stage not found' });

  db.prepare('UPDATE learn_resources SET stage_id = NULL WHERE stage_id = ?').run(id);
  db.prepare('DELETE FROM learn_stages WHERE id = ?').run(id);
  res.json({ success: true });
});

// PATCH /api/learn/stages/reorder — reorder stages by orderedIds
router.patch('/stages/reorder', requireAuth, requireAdmin, (req, res) => {
  const { orderedIds } = req.body;
  if (!Array.isArray(orderedIds)) return res.status(400).json({ error: 'orderedIds array required' });

  const update = db.prepare('UPDATE learn_stages SET position = ? WHERE id = ?');
  const reorderAll = db.transaction(() => {
    orderedIds.forEach((id, idx) => update.run(idx, id));
  });
  reorderAll();
  res.json({ success: true });
});

// ─── WEEK ROUTES ─────────────────────────────────────────────────────

// GET /api/learn/weeks — list all weeks, optionally filtered by month_id
router.get('/weeks', requireAuth, (req, res) => {
  const { month_id } = req.query;
  let query = 'SELECT * FROM learn_weeks';
  const params = [];
  if (month_id) { query += ' WHERE month_id = ?'; params.push(month_id); }
  query += ' ORDER BY position ASC, week_number ASC';
  const weeks = db.prepare(query).all(...params);
  res.json({ weeks });
});

// POST /api/learn/weeks — create week (admin only)
router.post('/weeks', requireAuth, requireAdmin, (req, res) => {
  const { month_id, title, description, week_number, position } = req.body;
  if (!title) return res.status(400).json({ error: 'Title required' });
  const maxPos = (db.prepare('SELECT COALESCE(MAX(position),-1) AS m FROM learn_weeks WHERE month_id = ?').get(month_id || null)?.m ?? -1);
  const result = db.prepare(`INSERT INTO learn_weeks (month_id, title, description, week_number, position) VALUES (?,?,?,?,?)`
  ).run(month_id || null, title, description || '', week_number || 0, position !== undefined ? position : maxPos + 1);
  const week = db.prepare('SELECT * FROM learn_weeks WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ week });
});

// PUT /api/learn/weeks/:id — edit week (admin only)
router.put('/weeks/:id', requireAuth, requireAdmin, (req, res) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM learn_weeks WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Week not found' });
  const { month_id, title, description, week_number, position } = req.body;
  db.prepare(`UPDATE learn_weeks SET month_id=COALESCE(?,month_id), title=COALESCE(?,title), description=COALESCE(?,description), week_number=COALESCE(?,week_number), position=COALESCE(?,position) WHERE id=?`
  ).run(month_id !== undefined ? (month_id || null) : null, title ?? null, description ?? null, week_number !== undefined ? week_number : null, position !== undefined ? position : null, id);
  const week = db.prepare('SELECT * FROM learn_weeks WHERE id = ?').get(id);
  res.json({ week });
});

// DELETE /api/learn/weeks/:id — delete week (admin only)
router.delete('/weeks/:id', requireAuth, requireAdmin, (req, res) => {
  const { id } = req.params;
  if (!db.prepare('SELECT id FROM learn_weeks WHERE id = ?').get(id)) return res.status(404).json({ error: 'Week not found' });
  db.prepare('UPDATE learn_resources SET week_id = NULL WHERE week_id = ?').run(id);
  db.prepare('DELETE FROM learn_weeks WHERE id = ?').run(id);
  res.json({ success: true });
});

// PATCH /api/learn/weeks/reorder — reorder weeks
router.patch('/weeks/reorder', requireAuth, requireAdmin, (req, res) => {
  const { orderedIds } = req.body;
  if (!Array.isArray(orderedIds)) return res.status(400).json({ error: 'orderedIds array required' });
  const upd = db.prepare('UPDATE learn_weeks SET position = ? WHERE id = ?');
  db.transaction(() => { orderedIds.forEach((id, idx) => upd.run(idx, id)); })();
  res.json({ success: true });
});

// ─── RESOURCE ROUTES ─────────────────────────────────────────────────

// GET /api/learn/resources — list with optional filters (all authenticated users)
router.get('/resources', requireAuth, (req, res) => {
  const { category, difficulty, resource_type, search, stage_id, week_id } = req.query;

  let query = 'SELECT * FROM learn_resources WHERE 1=1';
  const params = [];

  if (category && category !== 'All') {
    query += ' AND category = ?';
    params.push(category);
  }
  if (difficulty && difficulty !== 'All') {
    query += ' AND difficulty = ?';
    params.push(difficulty);
  }
  if (resource_type && resource_type !== 'All') {
    query += ' AND resource_type = ?';
    params.push(resource_type);
  }
  if (stage_id) {
    query += ' AND stage_id = ?';
    params.push(stage_id);
  }
  if (week_id) {
    query += ' AND week_id = ?';
    params.push(week_id);
  }
  if (search) {
    query += ' AND (title LIKE ? OR description LIKE ?)';
    const s = `%${search}%`;
    params.push(s, s);
  }

  query += ' ORDER BY stage_id ASC, position ASC, created_at DESC';
  const resources = db.prepare(query).all(...params);
  res.json({ resources });
});

// POST /api/learn/resources — add resource (admin only)
router.post('/resources', requireAuth, requireAdmin, (req, res) => {
  const { title, description, url, category, resource_type, difficulty, is_free, stage_id, week_id, position } = req.body;
  if (!title || !url) return res.status(400).json({ error: 'Title and URL required' });

  const result = db.prepare(`
    INSERT INTO learn_resources (title, description, url, category, resource_type, difficulty, is_free, added_by, stage_id, week_id, position)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    title,
    description || '',
    url,
    category || 'AI Basics',
    resource_type || 'website',
    difficulty || 'Beginner',
    is_free !== false ? 1 : 0,
    req.user.name,
    stage_id || null,
    week_id || null,
    position !== undefined ? position : 0
  );

  const resource = db.prepare('SELECT * FROM learn_resources WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ resource });
});

// PUT /api/learn/resources/:id — edit resource (admin only)
router.put('/resources/:id', requireAuth, requireAdmin, (req, res) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM learn_resources WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Resource not found' });

  const { title, description, url, category, resource_type, difficulty, is_free, stage_id, week_id, position } = req.body;

  db.prepare(`
    UPDATE learn_resources SET
      title = COALESCE(?, title),
      description = COALESCE(?, description),
      url = COALESCE(?, url),
      category = COALESCE(?, category),
      resource_type = COALESCE(?, resource_type),
      difficulty = COALESCE(?, difficulty),
      is_free = COALESCE(?, is_free),
      stage_id = ?,
      week_id = ?,
      position = COALESCE(?, position)
    WHERE id = ?
  `).run(
    title ?? null,
    description ?? null,
    url ?? null,
    category ?? null,
    resource_type ?? null,
    difficulty ?? null,
    is_free !== undefined ? (is_free ? 1 : 0) : null,
    stage_id !== undefined ? (stage_id || null) : existing.stage_id,
    week_id !== undefined ? (week_id || null) : existing.week_id,
    position !== undefined ? position : null,
    id
  );

  const resource = db.prepare('SELECT * FROM learn_resources WHERE id = ?').get(id);
  res.json({ resource });
});

// DELETE /api/learn/resources/:id — delete resource (admin only)
router.delete('/resources/:id', requireAuth, requireAdmin, (req, res) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT id FROM learn_resources WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Resource not found' });
  db.prepare('DELETE FROM learn_resources WHERE id = ?').run(id);
  res.json({ success: true });
});

// POST /api/learn/chat — AI tutor (all authenticated users)
router.post('/chat', requireAuth, checkAiLimit, async (req, res) => {
  const { messages, difficulty } = req.body;
  if (!messages || !Array.isArray(messages)) return res.status(400).json({ error: 'messages array required' });

  const levelInstructions = {
    'Kid-friendly': 'Use very simple words like you are explaining to a 7-year-old child. Use fun analogies, short sentences, and avoid all jargon. Make it exciting and easy to understand.',
    'Beginner': 'Use plain language and simple analogies. Avoid technical jargon. Assume no prior knowledge of AI, programming, or math.',
    'Intermediate': 'Use standard technical terms but explain them clearly. Assume basic familiarity with programming and math concepts.',
    'Advanced': 'Use precise technical terminology. Assume strong programming, math, and ML background. Go deep into implementation details and theory.',
  };

  const level = levelInstructions[difficulty] || levelInstructions['Beginner'];
  const systemMsg = `You are a friendly, knowledgeable AI tutor specializing in artificial intelligence and machine learning. ${level} Answer clearly and in a structured way. If asked questions unrelated to AI/ML/tech, politely redirect the conversation back to AI topics.`;

  try {
    const { content, tokens } = await groqChat(
      [{ role: 'system', content: systemMsg }, ...messages],
      0.5
    );

    if (!content) return res.status(500).json({ error: 'AI tutor unavailable. Check GROQ_API_KEY.' });

    if (tokens > 0) {
      db.prepare('INSERT INTO ai_logs (type, tokens, actor) VALUES (?, ?, ?)').run('learn', tokens, req.user.name);
    }

    res.json({ reply: content });
  } catch (err) {
    console.error('Learn chat error:', err);
    res.status(500).json({ error: 'AI tutor error: ' + (err.message || 'unknown error') });
  }
});

export default router;
