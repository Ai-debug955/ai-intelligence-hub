import dotenv from 'dotenv';
dotenv.config();

const GROQ_MODEL = 'llama-3.3-70b-versatile';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

export async function groqChat(messages, temperature = 0.2) {
  const key = process.env.GROQ_API_KEY;
  if (!key) {
    console.error('❌ GROQ_API_KEY not set in .env');
    return { content: null, tokens: 0 };
  }

  const response = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({ model: GROQ_MODEL, temperature, messages }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    console.error(`❌ Groq API error (${response.status}):`, errBody);
    return { content: null, tokens: 0 };
  }

  const data = await response.json();
  return {
    content: data.choices?.[0]?.message?.content || null,
    tokens: (data.usage?.prompt_tokens || 0) + (data.usage?.completion_tokens || 0),
  };
}
