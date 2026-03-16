// test-auto-review.js — Bulk test the auto-review pipeline
// Run: node test-auto-review.js
// Make sure server is running on localhost:3001 first

const API = 'http://localhost:3001/api';

// Login first to get token
async function getToken() {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'ruturaj@company.com', password: 'admin123' })
  });
  const data = await res.json();
  return data.token;
}

// Submit one URL with auto-review
async function testUrl(token, url, label) {
  const start = Date.now();
  try {
    const res = await fetch(`${API}/insights`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({
        title: '',
        urls: [url],
        category: 'Other',
        impact: 'Other',
        tags: 'bulk-test',
        description: '',
        entry_type: 'intelligence',
        autoReview: true
      })
    });
    const data = await res.json();
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    const status = data.autoReviewed ? '✅ AUTO' : '⏳ MANUAL';
    const title = data.insight?.title?.slice(0, 60) || 'No title';
    console.log(`${status} [${elapsed}s] ${label} → ${title}`);
    return { label, url, autoReviewed: data.autoReviewed, elapsed, title, error: null };
  } catch (e) {
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`❌ ERROR [${elapsed}s] ${label} → ${e.message}`);
    return { label, url, autoReviewed: false, elapsed, title: null, error: e.message };
  }
}

// Test URLs across all categories
const TEST_URLS = [
  // LinkedIn posts
  { url: 'https://www.linkedin.com/posts/abglobal_abinsights-activity-7439328458629001216-aiHD', label: 'LinkedIn - AB Global' },
  { url: 'https://www.linkedin.com/posts/anthroplogoic_claude-ai-activity-7430000000000000000-xxxx', label: 'LinkedIn - Random' },

  // YouTube
  { url: 'https://www.youtube.com/watch?v=aircAruvnKk', label: 'YouTube - 3Blue1Brown Neural Networks' },
  { url: 'https://www.youtube.com/watch?v=zjkBMFhNj_g', label: 'YouTube - Andrej Karpathy GPT' },

  // arXiv
  { url: 'https://arxiv.org/abs/2401.02385', label: 'arXiv - Mixtral of Experts' },
  { url: 'https://arxiv.org/abs/2307.09288', label: 'arXiv - Llama 2 paper' },
  { url: 'https://arxiv.org/abs/2405.04434', label: 'arXiv - Recent paper' },

  // GitHub
  { url: 'https://github.com/langchain-ai/langchain', label: 'GitHub - LangChain' },
  { url: 'https://github.com/ollama/ollama', label: 'GitHub - Ollama' },
  { url: 'https://github.com/huggingface/transformers', label: 'GitHub - HF Transformers' },

  // Company blogs
  { url: 'https://www.anthropic.com/news/the-anthropic-institute', label: 'Anthropic Blog' },
  { url: 'https://openai.com/index/openai-o3-mini/', label: 'OpenAI Blog' },
  { url: 'https://deepmind.google/discover/blog/', label: 'DeepMind Blog' },

  // Tech news
  { url: 'https://techcrunch.com/category/artificial-intelligence/', label: 'TechCrunch AI' },
  { url: 'https://arstechnica.com/ai/', label: 'Ars Technica AI' },
  { url: 'https://www.theverge.com/ai-artificial-intelligence', label: 'The Verge AI' },

  // Finance + AI news
  { url: 'https://www.reuters.com/technology/artificial-intelligence/', label: 'Reuters AI' },
  { url: 'https://www.mckinsey.com/capabilities/quantumblack/our-insights', label: 'McKinsey AI' },
  { url: 'https://www.finextra.com/latest', label: 'Finextra' },

  // Medium / Substack
  { url: 'https://towardsdatascience.com/', label: 'Towards Data Science' },

  // HuggingFace
  { url: 'https://huggingface.co/blog', label: 'HuggingFace Blog' },
  { url: 'https://huggingface.co/meta-llama/Llama-3.3-70B-Instruct', label: 'HuggingFace Model Card' },

  // Government / Regulatory
  { url: 'https://www.sebi.gov.in/legal/circulars.html', label: 'SEBI Circulars' },
  { url: 'https://home.treasury.gov/news/press-releases', label: 'US Treasury' },

  // Twitter / X (likely to fail — testing fallback)
  { url: 'https://x.com/AnthropicAI', label: 'Twitter/X - Anthropic' },

  // Wikipedia
  { url: 'https://en.wikipedia.org/wiki/Large_language_model', label: 'Wikipedia - LLM' },

  // News sites
  { url: 'https://www.wired.com/tag/artificial-intelligence/', label: 'Wired AI' },
  { url: 'https://venturebeat.com/category/ai/', label: 'VentureBeat AI' },

  // Edge cases
  { url: 'https://example.com', label: 'Edge - minimal page' },
  { url: 'https://httpstat.us/404', label: 'Edge - 404 page' },
];

async function main() {
  console.log('🔑 Logging in...\n');
  const token = await getToken();

  console.log(`🧪 Testing ${TEST_URLS.length} URLs...\n`);
  console.log('─'.repeat(80));

  const results = [];
  for (const { url, label } of TEST_URLS) {
    const result = await testUrl(token, url, label);
    results.push(result);
    // Small delay to avoid Groq rate limits
    await new Promise(r => setTimeout(r, 3000));
  }

  console.log('\n' + '─'.repeat(80));
  console.log('\n📊 SUMMARY\n');

  const auto = results.filter(r => r.autoReviewed);
  const manual = results.filter(r => !r.autoReviewed && !r.error);
  const errors = results.filter(r => r.error);

  console.log(`✅ Auto-reviewed: ${auto.length}/${results.length}`);
  console.log(`⏳ Manual queue:  ${manual.length}/${results.length}`);
  console.log(`❌ Errors:        ${errors.length}/${results.length}`);
  console.log(`\n📈 Auto-review rate: ${((auto.length / results.length) * 100).toFixed(0)}%`);

  const avgTime = (results.reduce((s, r) => s + parseFloat(r.elapsed), 0) / results.length).toFixed(1);
  console.log(`⏱️  Average time: ${avgTime}s per URL`);

  if (errors.length > 0) {
    console.log('\n❌ Failed URLs:');
    errors.forEach(r => console.log(`   ${r.label}: ${r.error}`));
  }

  if (manual.length > 0) {
    console.log('\n⏳ Sent to manual queue:');
    manual.forEach(r => console.log(`   ${r.label}`));
  }
}

main().catch(console.error);
