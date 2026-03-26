import { Router } from 'express';
import db from '../db.js';
import { requireAuth, requireAdmin } from '../auth.js';

const router = Router();

// POST /api/ai-usage/log — log a completed AI call (only if tokens > 0)
router.post('/log', requireAuth, (req, res) => {
  const { type, tokens } = req.body;
  if (!['report', 'summary', 'agent', 'learn'].includes(type)) return res.status(400).json({ error: 'Invalid type' });
  const t = parseInt(tokens) || 0;
  if (t > 0) {
    db.prepare('INSERT INTO ai_logs (type, tokens, actor) VALUES (?, ?, ?)').run(type, t, req.user.name);
  }
  res.json({ success: true });
});

// GET /api/ai-usage/my-usage — current user's daily usage vs limit
router.get('/my-usage', requireAuth, (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const user = db.prepare('SELECT daily_token_limit, ai_blocked FROM users WHERE id = ?').get(req.user.id);
  const { total } = db.prepare(
    "SELECT COALESCE(SUM(tokens), 0) as total FROM ai_logs WHERE actor = ? AND created_at >= ?"
  ).get(req.user.name, today);
  const limit = user?.daily_token_limit || 100000;
  res.json({
    tokensUsed: total,
    limit,
    remaining: Math.max(0, limit - total),
    blocked: user?.ai_blocked === 1,
    pct: Math.min(100, Math.round((total / limit) * 100)),
  });
});

// GET /api/ai-usage/all-users — admin: all users' usage with cost
router.get('/all-users', requireAuth, requireAdmin, (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const COST_PER_TOKEN = 0.0000007; // ~$0.70 per million tokens (blended Groq rate)
  const users = db.prepare(
    'SELECT id, name, email, role, daily_token_limit, ai_blocked FROM users ORDER BY name ASC'
  ).all();
  const result = users.map(u => {
    const { total: todayTokens } = db.prepare(
      "SELECT COALESCE(SUM(tokens), 0) as total FROM ai_logs WHERE actor = ? AND created_at >= ?"
    ).get(u.name, today);
    const { total: allTimeTokens } = db.prepare(
      "SELECT COALESCE(SUM(tokens), 0) as total FROM ai_logs WHERE actor = ?"
    ).get(u.name);
    const limit = u.daily_token_limit || 100000;
    return {
      id: u.id, name: u.name, email: u.email, role: u.role,
      tokensToday: todayTokens, tokensAllTime: allTimeTokens,
      limit, remaining: Math.max(0, limit - todayTokens),
      pct: Math.min(100, Math.round((todayTokens / limit) * 100)),
      costToday: +(todayTokens * COST_PER_TOKEN).toFixed(6),
      costAllTime: +(allTimeTokens * COST_PER_TOKEN).toFixed(6),
      blocked: u.ai_blocked === 1,
    };
  });
  res.json({ users: result });
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

  const agentToday = db.prepare(
    "SELECT COUNT(*) as n FROM ai_logs WHERE type = 'agent' AND created_at >= ?"
  ).get(todayUTC).n;

  const learnToday = db.prepare(
    "SELECT COUNT(*) as n FROM ai_logs WHERE type = 'learn' AND created_at >= ?"
  ).get(todayUTC).n;

  res.json({ stats: { requestsToday, tokensToday, summariesToday, reportsToday, agentToday, learnToday } });
});

export default router;
