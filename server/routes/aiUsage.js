import { Router } from 'express';
import db from '../db.js';
import { requireAuth, requireAdmin } from '../auth.js';

const router = Router();

// POST /api/ai-usage/log — log a completed AI call (only if tokens > 0)
router.post('/log', requireAuth, (req, res) => {
  const { type, tokens } = req.body;
  if (!['report', 'summary'].includes(type)) return res.status(400).json({ error: 'Invalid type' });
  const t = parseInt(tokens) || 0;
  if (t > 0) {
    db.prepare('INSERT INTO ai_logs (type, tokens, actor) VALUES (?, ?, ?)').run(type, t, req.user.name);
  }
  res.json({ success: true });
});

// GET /api/ai-usage/stats — admin: today's AI usage metrics
router.get('/stats', requireAuth, requireAdmin, (req, res) => {
  const todayUTC = new Date().toISOString().slice(0, 10);

  const requestsToday = db.prepare(
    "SELECT COUNT(*) as n FROM ai_logs WHERE created_at >= ?"
  ).get(todayUTC).n;

  const tokensToday = db.prepare(
    "SELECT COALESCE(SUM(tokens), 0) as n FROM ai_logs WHERE created_at >= ?"
  ).get(todayUTC).n;

  const summariesToday = db.prepare(
    "SELECT COUNT(*) as n FROM ai_logs WHERE type = 'summary' AND created_at >= ?"
  ).get(todayUTC).n;

  const reportsToday = db.prepare(
    "SELECT COUNT(*) as n FROM ai_logs WHERE type = 'report' AND created_at >= ?"
  ).get(todayUTC).n;

  res.json({ stats: { requestsToday, tokensToday, summariesToday, reportsToday } });
});

export default router;
