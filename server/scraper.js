import { YoutubeTranscript } from 'youtube-transcript/dist/youtube-transcript.esm.js';

const JINA_BASE = 'https://r.jina.ai/';
const FETCH_TIMEOUT = 15000;

// ─── fetchWithJina ──────────────────────────────────────────────────
// Fetches a URL via Jina reader (returns plain text rendition of the page)
export async function fetchWithJina(url) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
    const response = await fetch(`${JINA_BASE}${url}`, { signal: controller.signal });
    clearTimeout(timer);
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

// ─── directFetch ────────────────────────────────────────────────────
// Fallback: fetches the URL directly (raw HTML) when Jina fails
export async function directFetch(url) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AIIntelHub/1.0)' },
    });
    clearTimeout(timer);
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

// ─── detectPlatform ─────────────────────────────────────────────────
function detectPlatform(url) {
  try {
    const u = url.toLowerCase();
    if (u.includes('linkedin.com')) return 'LinkedIn';
    if (u.includes('twitter.com') || u.includes('x.com')) return 'Twitter';
    if (u.includes('youtube.com') || u.includes('youtu.be')) return 'YouTube';
    if (u.includes('arxiv.org')) return 'arXiv';
    if (u.includes('github.com')) return 'GitHub';
    return 'Web';
  } catch {
    return 'Web';
  }
}

// ─── URL noise patterns ─────────────────────────────────────────────
const URL_NOISE_PATTERNS = [
  /twitter\.com\/(intent|share)/i,
  /facebook\.com\/(share|sharer)/i,
  /linkedin\.com\/shareArticle/i,
  /accounts\.google\.com/i,
  /\/(login|signin|signup|register)(\/|$|\?)/i,
  /\.(jpg|jpeg|png|gif|svg|webp|ico|pdf|zip|tar|gz)(\?|$)/i,
  /#/,
  /javascript:/i,
  /mailto:/i,
];

// ─── extractContent ─────────────────────────────────────────────────
// Takes raw Jina output and returns structured content object
export function extractContent(rawJinaText, sourceUrl) {
  if (!rawJinaText) return null;

  const platform = detectPlatform(sourceUrl);
  let content = rawJinaText;

  // Strip common boilerplate patterns
  const boilerplatePatterns = [
    /(?:Accept|Reject)\s+(?:all\s+)?[Cc]ookies?[^\n]*/g,
    /Cookie (?:Policy|Notice|Settings?)[^\n]*/g,
    /(?:Privacy Policy|Terms of Service|Terms of Use)[^\n]*/g,
    /\[Skip to (?:main |page )?content\][^\n]*/gi,
    /Sign in to (?:view|continue|access)[^\n]*/gi,
    /(?:Join|Register) (?:now|today|for free)[^\n]*/gi,
    /Language\s*\n(?:[A-Za-z\s]+\n){1,10}/g,
  ];
  for (const pattern of boilerplatePatterns) {
    content = content.replace(pattern, '');
  }

  // Extract URLs from the text
  const urlRegex = /https?:\/\/[^\s\)\]"'<>\\]+/g;
  const foundUrls = [...new Set(content.match(urlRegex) || [])];

  let sourceDomain = '';
  try { sourceDomain = new URL(sourceUrl).hostname; } catch { /* ignore */ }

  const linkedUrls = foundUrls.filter(u => {
    try {
      const parsed = new URL(u);
      if (URL_NOISE_PATTERNS.some(p => p.test(u))) return false;
      if (parsed.hostname === sourceDomain) return false;
      return true;
    } catch {
      return false;
    }
  }).slice(0, 10);

  // Extract title — look for markdown headings or "Title:" labels
  let title = null;
  const titleMatch = content.match(/^#+\s+(.+)$/m) || content.match(/(?:^|\n)Title:\s*(.+)/i);
  if (titleMatch) title = titleMatch[1].trim().replace(/\*+/g, '');

  // Extract author
  let author = null;
  const authorMatch = content.match(/(?:Author|By|Written by|Posted by)[:\s]+([^\n|•\-–]+)/i);
  if (authorMatch) author = authorMatch[1].trim().replace(/\*+/g, '');

  // Extract published date
  let publishedDate = null;
  const dateMatch =
    content.match(/(?:Published|Posted|Date|Updated)[:\s]+([^\n]+)/i) ||
    content.match(/\b(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4})\b/i) ||
    content.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (dateMatch) publishedDate = dateMatch[1].trim();

  // Platform-specific content trimming
  if (platform === 'LinkedIn') {
    // LinkedIn post content sits between the author header and the reaction bar
    const postEndIdx = content.search(/\n(?:Like|Comment|Share|Repost|Send)\s*\n/i);
    if (postEndIdx > 200) {
      content = content.substring(0, postEndIdx);
    }
    // Remove the navigation header (first ~20 lines often contain nav)
    const lines = content.split('\n');
    const startLine = lines.findIndex(l => l.trim().length > 80);
    if (startLine > 0 && startLine < 25) {
      content = lines.slice(startLine).join('\n');
    }
  } else if (platform === 'arXiv') {
    // arXiv: keep abstract section
    const abstractStart = content.search(/\bAbstract\b/i);
    const afterAbstract = abstractStart >= 0 ? abstractStart : 0;
    const subjectsEnd = content.search(/\b(?:Subjects|Comments|Submitted|MSC-class)\b/i);
    const end = subjectsEnd > afterAbstract ? subjectsEnd : afterAbstract + 3000;
    content = content.substring(afterAbstract, end).trim();
  } else if (platform === 'Twitter') {
    // Twitter: strip trending sidebar and navigation
    const tweetEnd = content.search(/\n(?:Trending|What's happening|Who to follow)\s*\n/i);
    if (tweetEnd > 100) content = content.substring(0, tweetEnd);
  }

  // Final clean-up: collapse multiple blank lines
  content = content.replace(/\n{3,}/g, '\n\n').trim();

  // ─── Index page detection ──────────────────────────────────────────
  // Platforms with known short-path structures that are NOT index pages
  const EXEMPT_PLATFORMS = ['GitHub', 'arXiv', 'YouTube', 'Twitter', 'LinkedIn'];
  let isIndexPage = false;
  try {
    const parsedUrl = new URL(sourceUrl);
    const path = parsedUrl.pathname.replace(/\/$/, '') || '/';
    const segments = path.split('/').filter(Boolean);

    // Explicit listing/feed/category URL patterns
    if (/\/(category|categories|tag|tags|topics?)(\/|$)/i.test(path)) isIndexPage = true;
    if (/\/(latest|feed)(\/|$)/i.test(path)) isIndexPage = true;
    if (/\/legal\/circulars/i.test(path)) isIndexPage = true;

    // Single-segment paths on generic web pages are usually section listings
    // (e.g. /ai, /blog, /news) — exempt platforms with meaningful short paths
    if (!isIndexPage && !EXEMPT_PLATFORMS.includes(platform) && segments.length < 2) {
      isIndexPage = true;
    }
  } catch { /* ignore */ }

  // Content-based: more than 8 subheadings strongly suggests a feed/listing
  if (!isIndexPage) {
    const subheadings = content.match(/^#{2,3}\s+/gm) || [];
    if (subheadings.length > 8) isIndexPage = true;
  }

  return { platform, author, title, content, linkedUrls, publishedDate, isIndexPage };
}

// ─── fetchYouTubeTranscript ─────────────────────────────────────────
// Fetches transcript for a YouTube video and returns { title, transcript }
export async function fetchYouTubeTranscript(videoUrl) {
  try {
    let videoId = null;
    const watchMatch = videoUrl.match(/[?&]v=([^&]+)/);
    const shortMatch = videoUrl.match(/youtu\.be\/([^?&/]+)/);
    if (watchMatch) videoId = watchMatch[1];
    else if (shortMatch) videoId = shortMatch[1];
    if (!videoId) return null;

    const items = await YoutubeTranscript.fetchTranscript(videoId);
    const transcript = items.map(i => i.text).join(' ');
    return { title: null, transcript };
  } catch {
    return null;
  }
}

// ─── fetchLinkedContent ─────────────────────────────────────────────
// Fetches the text content of up to maxLinks external URLs
export async function fetchLinkedContent(urls, maxLinks = 3) {
  const noisePatterns = [
    /(?:twitter|facebook|instagram|tiktok|linkedin|youtube)\.com/i,
    /(?:accounts\.google|login\.|signin\.)/i,
    /\.(jpg|jpeg|png|gif|svg|webp|ico|pdf|zip|tar|gz)(\?|$)/i,
  ];

  const filtered = urls.filter(u => {
    try {
      new URL(u);
      return !noisePatterns.some(p => p.test(u));
    } catch {
      return false;
    }
  }).slice(0, maxLinks);

  const results = [];
  for (const url of filtered) {
    const text = await fetchWithJina(url);
    if (text && text.length > 100) {
      // Cap each linked article at 3000 chars to keep the AI prompt reasonable
      results.push({ url, content: text.substring(0, 3000) });
    }
  }
  return results;
}

// ─── getFullContent ─────────────────────────────────────────────────
// Main orchestrator: fetches and structures all content for a URL
export async function getFullContent(url) {
  const platform = detectPlatform(url);
  let mainContent = '';
  let linkedContent = '';
  let title = null;
  let author = null;
  let linkedUrls = [];

  if (platform === 'YouTube') {
    // Parallel: fetch transcript + Jina page metadata
    const [transcriptResult, rawJina] = await Promise.all([
      fetchYouTubeTranscript(url),
      fetchWithJina(url),
    ]);

    const jinaData = rawJina ? extractContent(rawJina, url) : null;
    title = jinaData?.title || null;
    author = jinaData?.author || null;
    linkedUrls = jinaData?.linkedUrls || [];

    if (transcriptResult?.transcript) {
      mainContent = `[Video Transcript]\n${transcriptResult.transcript}`;
    } else if (jinaData?.content) {
      mainContent = jinaData.content;
    }
  } else {
    const rawJina = await fetchWithJina(url);
    const raw = rawJina || await directFetch(url);
    if (!raw) {
      return { platform, author: null, title: null, mainContent: '', linkedContent: '', fullText: '', extractionSuccess: false };
    }

    const extracted = extractContent(raw, url);
    if (!extracted) {
      return { platform, author: null, title: null, mainContent: '', linkedContent: '', fullText: '', extractionSuccess: false };
    }

    if (extracted.isIndexPage) {
      return { platform, author: null, title: null, mainContent: '', linkedContent: '', fullText: '', extractionSuccess: false };
    }

    title = extracted.title;
    author = extracted.author;
    mainContent = extracted.content;
    linkedUrls = extracted.linkedUrls || [];
  }

  // Fetch content from linked URLs found inside the post
  if (linkedUrls.length > 0) {
    const linked = await fetchLinkedContent(linkedUrls, 3);
    linkedContent = linked
      .map(({ url: lu, content: lc }) => `--- Linked Article: ${lu} ---\n${lc}`)
      .join('\n\n');
  }

  const fullText = [mainContent, linkedContent].filter(Boolean).join('\n\n');

  return {
    platform,
    author,
    title,
    mainContent,
    linkedContent,
    fullText,
    extractionSuccess: mainContent.length > 50,
  };
}
