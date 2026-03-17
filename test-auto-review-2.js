// test-auto-review-2.js — Batch 2: Different sources
// Run: node test-auto-review-2.js
// Make sure server is running on localhost:3001 first

const API = 'http://localhost:3001/api';

async function getToken() {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'ruturaj@company.com', password: 'admin123' })
  });
  const data = await res.json();
  return data.token;
}

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
        tags: 'bulk-test-2',
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

const TEST_URLS = [
  // LinkedIn - specific posts (real articles, not profiles)
  { url: 'https://www.linkedin.com/posts/yaborozhenko_ai-machinelearning-deeplearning-activity-7438500000000000000-xxxx', label: 'LinkedIn - AI post' },
  { url: 'https://www.linkedin.com/pulse/from-vision-reality-four-pillars-robust-ai-strategy-abglobal-hctse', label: 'LinkedIn Article - AB AI Strategy' },

  // YouTube - specific AI videos
  { url: 'https://www.youtube.com/watch?v=kCc8FmEb1nY', label: 'YouTube - Karpathy GPT from scratch' },
  { url: 'https://www.youtube.com/watch?v=VMj-3S1tku0', label: 'YouTube - 3B1B Transformers' },
  { url: 'https://youtu.be/_Ux13UEqIYo', label: 'YouTube - Anthropic Axis video' },

  // arXiv - specific papers
  { url: 'https://arxiv.org/abs/2312.11805', label: 'arXiv - Gemini paper' },
  { url: 'https://arxiv.org/abs/2403.05530', label: 'arXiv - Claude 3 paper' },
  { url: 'https://arxiv.org/abs/2305.10601', label: 'arXiv - Tree of Thoughts' },

  // Specific news articles
  { url: 'https://www.bbc.com/news/articles/cx2k7r7nrnpo', label: 'BBC - AI news article' },
  { url: 'https://www.cnbc.com/2025/12/20/openai-announces-o3-its-next-model.html', label: 'CNBC - OpenAI article' },
  { url: 'https://www.nytimes.com/2024/12/05/technology/ai-agents-technology.html', label: 'NYT - AI Agents' },

  // Specific blog posts
  { url: 'https://lilianweng.github.io/posts/2023-06-23-agent/', label: 'Lilian Weng - AI Agents blog' },
  { url: 'https://simonwillison.net/2024/Mar/22/claude-and-chatgpt-case-study/', label: 'Simon Willison blog' },
  { url: 'https://jaykmody.com/blog/gpt-from-scratch/', label: 'GPT from scratch blog' },

  // HuggingFace specific pages
  { url: 'https://huggingface.co/papers/2312.11805', label: 'HF Paper - Gemini' },
  { url: 'https://huggingface.co/mistralai/Mistral-7B-v0.1', label: 'HF Model - Mistral 7B' },

  // GitHub specific repos
  { url: 'https://github.com/anthropics/anthropic-cookbook', label: 'GitHub - Anthropic Cookbook' },
  { url: 'https://github.com/microsoft/autogen', label: 'GitHub - AutoGen' },
  { url: 'https://github.com/run-llama/llama_index', label: 'GitHub - LlamaIndex' },

  // Substack specific posts
  { url: 'https://www.oneusefulthing.org/p/what-just-happened-with-ai-jan-2025', label: 'Substack - One Useful Thing' },
  { url: 'https://www.interconnects.ai/', label: 'Substack - Interconnects' },

  // Finance specific articles
  { url: 'https://www.jpmorgan.com/technology/artificial-intelligence', label: 'JPMorgan AI page' },
  { url: 'https://newsroom.bankofamerica.com/content/newsroom/press-releases/2026/03/bofa-ai-and-digital-innovations-fuel-30-billion-client-interactions.html', label: 'BofA AI Press Release' },
  { url: 'https://www.bis.org/publ/work1194.htm', label: 'BIS - Central Bank AI paper' },

  // Twitter/X specific posts
  { url: 'https://x.com/kaborozhenko/status/1800000000000000000', label: 'X - random AI post' },
  { url: 'https://x.com/ylecun/status/1750000000000000000', label: 'X - Yann LeCun' },

  // Medium specific articles
  { url: 'https://medium.com/@karpathy/yes-you-should-understand-backprop-e2f06eab496b', label: 'Medium - Karpathy Backprop' },

  // Government / Research
  { url: 'https://www.whitehouse.gov/ostp/ai-bill-of-rights/', label: 'White House AI Bill of Rights' },
  { url: 'https://hai.stanford.edu/research/ai-index-report', label: 'Stanford HAI - AI Index' },

  // Edge cases
  { url: 'https://news.ycombinator.com/', label: 'Hacker News homepage (index page)' },
];

async function main() {
  console.log('🔑 Logging in...\n');
  const token = await getToken();

  console.log(`🧪 Testing ${TEST_URLS.length} URLs (Batch 2)...\n`);
  console.log('─'.repeat(80));

  const results = [];
  for (const { url, label } of TEST_URLS) {
    const result = await testUrl(token, url, label);
    results.push(result);
    await new Promise(r => setTimeout(r, 3000));
  }

  console.log('\n' + '─'.repeat(80));
  console.log('\n📊 SUMMARY (Batch 2)\n');

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
