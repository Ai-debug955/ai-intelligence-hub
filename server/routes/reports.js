import { Router } from 'express';
import db from '../db.js';
import { requireAuth, checkAiLimit } from '../auth.js';
import { groqChat } from '../groq.js';

const router = Router();

// POST /api/reports/generate — generate AI report
router.post('/generate', requireAuth, checkAiLimit, async (req, res) => {
  try {
    const days = parseInt(req.body.days) || 30;
    const categories = Array.isArray(req.body.categories) && req.body.categories.length > 0
      ? req.body.categories
      : null; // null = all categories

    const since = new Date(Date.now() - days * 86400000).toISOString();

    let query = 'SELECT * FROM insights WHERE needs_review = 0 AND created_at >= ?';
    const params = [since];
    if (categories) {
      query += ` AND category IN (${categories.map(() => '?').join(',')})`;
      params.push(...categories);
    }
    query += ' ORDER BY created_at DESC LIMIT 60';

    const insights = db.prepare(query).all(...params);

    if (insights.length === 0) {
      return res.status(400).json({ error: `No reviewed insights found for the selected period${categories ? ' and categories' : ''}.` });
    }

    const periodLabel = days === 1 ? 'last 24 hours' : `last ${days} days`;
    const categoryLabel = categories ? categories.join(', ') : 'all categories';

    const insightSummaries = insights.map(i =>
      `- [${i.category}] ${i.title}: ${i.summary || 'No summary'} (Impact: ${i.impact})`
    ).join('\n');

    const prompt = `You are an AI research intelligence analyst. Generate a concise intelligence brief for the ${periodLabel}, covering ${categoryLabel}, based on these AI developments:\n\n${insightSummaries}\n\nFormat the report with:\n1. Executive Summary (2-3 sentences)\n2. Key Themes (3-5 bullet points)\n3. Notable Developments (top 5, with brief analysis)\n4. Impact Assessment\n5. Recommendations\n\nUse markdown formatting.`;

    const { content: report, tokens } = await groqChat([
      { role: 'system', content: 'You are an expert AI research analyst.' },
      { role: 'user', content: prompt }
    ]);

    if (!report) {
      return res.status(500).json({ error: 'Failed to generate report. Check GROQ_API_KEY.' });
    }

    // Save report to DB
    const result = db.prepare('INSERT INTO reports (report_content, generated_by) VALUES (?, ?)').run(
      report, req.user.name
    );

    // Log AI usage
    db.prepare('INSERT INTO ai_logs (type, tokens, actor) VALUES (?, ?, ?)').run('report', tokens, req.user.name);

    res.json({
      report,
      id: result.lastInsertRowid
    });
  } catch (err) {
    console.error('Report generation error:', err);
    res.status(500).json({ error: 'Report generation failed' });
  }
});

// GET /api/reports — list past reports
router.get('/', requireAuth, (req, res) => {
  const reports = db.prepare('SELECT * FROM reports ORDER BY generated_at DESC LIMIT 20').all();
  res.json({ reports });
});

export default router;
