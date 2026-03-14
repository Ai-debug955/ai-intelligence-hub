import { Router } from 'express';
import db from '../db.js';
import { requireAuth } from '../auth.js';
import dotenv from 'dotenv';
dotenv.config();

const router = Router();

const GROQ_MODEL = 'llama-3.3-70b-versatile';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

async function groqChat(messages, temperature = 0.2) {
  const key = process.env.GROQ_API_KEY;
  if (!key) return { content: null, tokens: 0 };

  const response = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: GROQ_MODEL, temperature, messages }),
  });

  if (!response.ok) return { content: null, tokens: 0 };

  const data = await response.json();
  return {
    content: data.choices?.[0]?.message?.content || null,
    tokens: (data.usage?.prompt_tokens || 0) + (data.usage?.completion_tokens || 0),
  };
}

// POST /api/ai/summarize — generate insight summary for admin review
router.post('/summarize', requireAuth, async (req, res) => {
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

export default router;
