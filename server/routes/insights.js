import { Router } from 'express';
import db from '../db.js';
import { requireAuth, requireAdmin } from '../auth.js';
import { getFullContent } from '../scraper.js';
import { groqChat } from '../groq.js';

const router = Router();

const truncateText = (text, maxLen) => text && text.length > maxLen ? text.slice(0, maxLen) + '... [truncated]' : text;

const VALID_CATEGORIES = ['Model', 'Tool', 'Paper', 'Use Case', 'News', 'Other'];
const normalizeCategory = (raw) => {
  if (!raw) return 'Other';
  const s = raw.trim();
  // Exact match first
  const exact = VALID_CATEGORIES.find(c => c.toLowerCase() === s.toLowerCase());
  if (exact) return exact;
  // Starts-with match (handles "Model(new AI model...)" → "Model")
  const prefix = VALID_CATEGORIES.find(c => s.toLowerCase().startsWith(c.toLowerCase()));
  return prefix || 'Other';
};

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
router.post('/', requireAuth, async (req, res) => {
  const { id, title, urls, category, impact, tags, description, entry_type, autoReview = true } = req.body;
  const insightId = id || Math.random().toString(36).substring(2, 11);

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

  // ── Auto-review (optional, default ON) ─────────────────────────────
  let autoReviewed = false;

  if (autoReview && urls && urls.length > 0) {
    try {
      const extracted = await getFullContent(urls[0]);
      const hasContent = extracted.extractionSuccess && extracted.mainContent?.length > 50;

      const articleTitle = title || urls[0];
      const contentBlock = hasContent
        ? `Content:\n${truncateText(extracted.mainContent, 4000)}\n\nLinked content:\n${truncateText(extracted.linkedContent, 500) || 'none'}`
        : `Headline: ${articleTitle}\n\nNote: Full article text is unavailable. Infer category and write a brief summary based on the headline and URL domain.`;

      const systemMsg = 'You are an AI analyst that categorizes and summarizes AI news. Always return valid JSON with no markdown fences.';
      const userMsg = `Analyze this AI/tech news item and return JSON.

URL: ${urls[0]}
Platform: ${extracted.platform}
${contentBlock}

Return this exact JSON structure (fill every field, do not skip):
{"summary":"3-5 sentence summary of what this is about","key_points":["point 1","point 2","point 3"],"suggested_title":"concise title","suggested_category":"Model|Tool|Paper|Use Case|News|Other","suggested_impact":"High or Other","confidence":0.9}

For headline-only items set confidence to 0.6. Only return the JSON object.`;

      const { content: aiText, tokens } = await groqChat(
        [{ role: 'system', content: systemMsg }, { role: 'user', content: userMsg }],
        0.3
      );

      console.log('[auto-review] hasContent:', hasContent, '| aiText:', aiText?.slice(0, 150));

      if (aiText) {
        let parsed;
        try {
          const match = aiText.match(/\{[\s\S]*\}/);
          parsed = match ? JSON.parse(match[0]) : null;
        } catch (e) {
          console.error('[auto-review] JSON parse error:', e.message, '| raw:', aiText?.slice(0, 200));
          parsed = null;
        }

        console.log('[auto-review] parsed.summary:', parsed?.summary?.slice(0, 80));

        // Accept any valid parsed response — user explicitly requested auto-review
        if (parsed && parsed.summary) {
          const useTitle = (!title || title === urls[0]) ? (parsed.suggested_title || title || urls[0]) : title;
          const useCategory = (category === 'Other' || !category) ? (normalizeCategory(parsed.suggested_category?.split('|')[0])) : category;
          const useImpact = (impact === 'Other' || !impact) ? (parsed.suggested_impact?.trim().startsWith('High') ? 'High' : 'Other') : impact;

          const kpString = Array.isArray(parsed.key_points) ? parsed.key_points.join(';') : (parsed.key_points || '');

          db.prepare(`
            UPDATE insights SET
              title = ?,
              summary = ?,
              key_points = ?,
              category = ?,
              impact = ?,
              needs_review = 0,
              reviewed_by = 'AI Auto-Review',
              reviewer_notes = ?
            WHERE id = ?
          `).run(
            useTitle,
            parsed.summary || '',
            kpString,
            useCategory,
            useImpact,
            hasContent ? 'Auto-reviewed from extracted content' : 'Auto-reviewed from title only (page not accessible)',
            insightId
          );

          autoReviewed = true;

          db.prepare(`
            INSERT INTO reviews (insight_id, reviewer, summary, key_points)
            VALUES (?, ?, ?, ?)
          `).run(insightId, 'AI Auto-Review', parsed.summary || '', kpString);
        }

        if (tokens > 0) {
          db.prepare('INSERT INTO ai_logs (type, tokens, actor) VALUES (?, ?, ?)').run('summary', tokens, req.user.name);
        }
      }
    } catch (err) {
      // Auto-review failure is non-fatal — insight stays in manual queue
      console.error('Auto-review error:', err);
    }
  }
  // ── End auto-review ─────────────────────────────────────────────────

  const insight = db.prepare('SELECT * FROM insights WHERE id = ?').get(insightId);
  res.status(201).json({
    insight: {
      ...insight,
      urls: JSON.parse(insight.sources || '[]'),
      needs_review: !!insight.needs_review
    },
    autoReviewed
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

// POST /api/insights/:id/auto-review — run auto-review pipeline on an existing pending insight
router.post('/:id/auto-review', requireAuth, async (req, res) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM insights WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Insight not found' });
  if (!existing.needs_review) return res.status(400).json({ error: 'Insight is already reviewed' });

  const urls = JSON.parse(existing.sources || '[]');
  if (!urls || urls.length === 0) return res.status(400).json({ error: 'No URL to extract content from' });

  try {
    const extracted = await getFullContent(urls[0]);
    if (!extracted.extractionSuccess) {
      return res.status(422).json({ error: 'Could not extract enough content from the URL' });
    }

    const systemMsg = 'You are an AI analyst. Return only valid JSON, no markdown.';
    const userMsg = `Platform: ${extracted.platform}. Author: ${extracted.author || 'Unknown'}.
URL: ${urls[0]}

Content: ${truncateText(extracted.mainContent, 4000)}

Linked: ${truncateText(extracted.linkedContent, 500) || 'none'}

Notes: ${existing.description || 'none'}

Return JSON:
{"summary":"5-6 sentence summary","key_points":["pt1","pt2","pt3"],"suggested_title":"title","suggested_category":"Model(new AI model/weights/architecture/benchmark result)|Tool(library/API/product/app/framework)|Paper(research paper/preprint/study/dataset)|Use Case(real-world deployment/integration/application of AI)|News(company news/funding/acquisition/policy/regulation)|Other","suggested_impact":"High(only if major breakthrough, paradigm shift, or critical industry event — otherwise leave blank)","confidence":0.0}`;

    const { content: aiText, tokens } = await groqChat(
      [{ role: 'system', content: systemMsg }, { role: 'user', content: userMsg }],
      0.3
    );

    if (!aiText) return res.status(500).json({ error: 'AI returned no response. Check GROQ_API_KEY.' });

    let parsed;
    try {
      const match = aiText.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(match[0]);
    } catch {
      return res.status(500).json({ error: 'Failed to parse AI response' });
    }

    if (typeof parsed.confidence !== 'number' || parsed.confidence < 0.5) {
      return res.status(422).json({ error: `AI confidence too low (${parsed.confidence ?? 'unknown'}) — use manual review instead` });
    }

    const currentTitle = existing.title;
    const currentCategory = existing.category;
    const currentImpact = existing.impact;

    const useTitle = (!currentTitle || currentTitle === urls[0]) ? (parsed.suggested_title || currentTitle) : currentTitle;
    const useCategory = (currentCategory === 'Other' || !currentCategory) ? (normalizeCategory(parsed.suggested_category?.split('|')[0])) : currentCategory;
    const useImpact = (currentImpact === 'Other' || !currentImpact) ? (parsed.suggested_impact?.trim().startsWith('High') ? 'High' : 'Other') : currentImpact;
    const kpString = Array.isArray(parsed.key_points) ? parsed.key_points.join(';') : (parsed.key_points || '');

    db.prepare(`
      UPDATE insights SET
        title = ?,
        summary = ?,
        key_points = ?,
        category = ?,
        impact = ?,
        needs_review = 0,
        reviewed_by = 'AI Auto-Review',
        reviewer_notes = 'Auto-reviewed from extracted content'
      WHERE id = ?
    `).run(useTitle, parsed.summary || '', kpString, useCategory, useImpact, id);

    db.prepare(`
      INSERT INTO reviews (insight_id, reviewer, summary, key_points)
      VALUES (?, ?, ?, ?)
    `).run(id, 'AI Auto-Review', parsed.summary || '', kpString);

    if (tokens > 0) {
      db.prepare('INSERT INTO ai_logs (type, tokens, actor) VALUES (?, ?, ?)').run('summary', tokens, req.user.name);
    }

    const updated = db.prepare('SELECT * FROM insights WHERE id = ?').get(id);
    res.json({
      insight: {
        ...updated,
        urls: JSON.parse(updated.sources || '[]'),
        needs_review: !!updated.needs_review
      }
    });
  } catch (err) {
    console.error('Auto-review error:', err);
    res.status(500).json({ error: 'Auto-review failed' });
  }
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
