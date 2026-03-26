import { Router } from 'express';
import db from '../db.js';
import { requireAuth, checkAiLimit } from '../auth.js';
import { groqChat } from '../groq.js';

const router = Router();

// POST /api/ai/summarize — generate insight summary for admin review
router.post('/summarize', requireAuth, checkAiLimit, async (req, res) => {
  const { title, reviewerNotes, category, urls, submitterNotes } = req.body;
  if (!title || !reviewerNotes) return res.status(400).json({ error: 'title and reviewerNotes required' });

  const urlInfo = (urls || []).filter(Boolean).map(u => `URL: ${u}`).join('\n');
  const submitterSection = submitterNotes ? `\nSubmitter's original notes:\n${submitterNotes}` : '';

  const { content: text, tokens } = await groqChat([{
    role: 'user',
    content: `You are a senior AI intelligence analyst writing a detailed briefing for a technical research team.\n\nReturn ONLY a JSON object. No explanations. No markdown. No code blocks.\n\n{\n  "summary": "Write a thorough 5-6 sentence summary covering: what it is, why it matters, the key technical details or findings, the broader implications for the AI field, and any notable context. Draw from both the reviewer's analysis and the submitter's original observations.",\n  "key_points": ["specific point 1","specific point 2","specific point 3","specific point 4","specific point 5"],\n  "suggested_title": "concise professional title",\n  "suggested_category": "Model/Tool/Paper/Use Case/News/Other",\n  "suggested_impact": "High/Medium/Low"\n}\n\nTitle: ${title}\nCategory: ${category || 'Other'}\n${urlInfo}${submitterSection}\nReviewer's analysis:\n${reviewerNotes}`,
  }], 0.3);

  if (!text) return res.status(500).json({ error: 'Summarization failed. Check GROQ_API_KEY.' });

  let parsed;
  try {
    const match = text.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(match[0]);
  } catch {
    return res.status(500).json({ error: 'Failed to parse AI response' });
  }

  // Log token usage (only if valid)
  if (tokens > 0) {
    db.prepare('INSERT INTO ai_logs (type, tokens, actor) VALUES (?, ?, ?)').run('summary', tokens, req.user.name);
  }

  res.json({ result: parsed });
});

// POST /api/ai/agent — answer a natural language query using Groq
router.post('/agent', requireAuth, checkAiLimit, async (req, res) => {
  const { query } = req.body;
  if (!query || !query.trim()) return res.status(400).json({ error: 'query required' });

  const systemMsg = `You are a knowledgeable AI research assistant embedded in an AI Intelligence Hub used by research and data teams. Answer the user's query accurately and clearly. For AI/tech topics, be technically precise and mention relevant recent developments. For general topics or news, give a balanced and informative overview. Format your response with clear paragraphs — avoid walls of text. Be thorough but concise. Do not start responses with "Certainly!" or similar filler phrases. Do not add disclaimers about knowledge cutoffs unless directly relevant.`;

  try {
    const { content, tokens } = await groqChat([
      { role: 'system', content: systemMsg },
      { role: 'user', content: query.trim() },
    ], 0.6);

    if (!content) return res.status(500).json({ error: 'AI response unavailable. Check GROQ_API_KEY.' });

    if (tokens > 0) {
      db.prepare('INSERT INTO ai_logs (type, tokens, actor) VALUES (?, ?, ?)').run('agent', tokens, req.user.name);
    }

    res.json({ answer: content });
  } catch (err) {
    console.error('Agent error:', err);
    res.status(500).json({ error: 'AI agent error: ' + (err.message || 'unknown') });
  }
});

export default router;
