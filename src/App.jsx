import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import * as api from "./api.js";

const CATEGORIES = ["Model", "Tool", "Paper", "Use Case", "News", "Other"];
const IMPACTS = ["High", "Medium", "Low", "Other"];
const ENTRY_TYPES = [
  { id: "intelligence", label: "Intelligence", icon: "◈", desc: "Regular intelligence feed", color: "var(--accent-cyan)" },
  { id: "ai_signal", label: "Core AI", icon: "◆", desc: "Core AI panel signals", color: "var(--accent-blue)" },
  { id: "financial_ai", label: "Fin AI", icon: "$", desc: "Fin AI panel signals", color: "var(--accent-green)" }
];
const CATEGORY_ICONS = { Model: "◆", Tool: "⚙", Paper: "◎", "Use Case": "△", News: "▣", Other: "◇" };

const generateId = () => Math.random().toString(36).substr(2, 9);
const formatDate = (d) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();
const truncate = (s, len = 120) => s && s.length > len ? s.substring(0, len).trim() + "…" : s;

// localStorage storage utility removed — now using API calls


const SOURCE_PATTERNS = [
  { pattern: /linkedin\.com/i, name: "LinkedIn", icon: "in", color: "#0a66c2", scrapeable: false },
  { pattern: /instagram\.com|instagr\.am/i, name: "Instagram", icon: "◉", color: "#e1306c", scrapeable: false },
  { pattern: /youtube\.com|youtu\.be/i, name: "YouTube", icon: "▶", color: "#ff0000", scrapeable: false },
  { pattern: /twitter\.com|x\.com/i, name: "X / Twitter", icon: "𝕏", color: "#1da1f2", scrapeable: false },
  { pattern: /github\.com/i, name: "GitHub", icon: "⬡", color: "#8b949e", scrapeable: true },
  { pattern: /arxiv\.org/i, name: "arXiv", icon: "⊗", color: "#b31b1b", scrapeable: true },
  { pattern: /medium\.com/i, name: "Medium", icon: "M", color: "#00ab6c", scrapeable: true },
  { pattern: /substack\.com/i, name: "Substack", icon: "◈", color: "#ff6719", scrapeable: true },
  { pattern: /huggingface\.co/i, name: "HuggingFace", icon: "🤗", color: "#ffbd45", scrapeable: true },
  { pattern: /reddit\.com/i, name: "Reddit", icon: "◉", color: "#ff4500", scrapeable: false },
  { pattern: /tiktok\.com/i, name: "TikTok", icon: "♪", color: "#00f2ea", scrapeable: false },
  { pattern: /techcrunch\.com/i, name: "TechCrunch", icon: "TC", color: "#0a9e01", scrapeable: true },
  { pattern: /theverge\.com/i, name: "The Verge", icon: "▽", color: "#e5127d", scrapeable: true },
  { pattern: /reuters\.com/i, name: "Reuters", icon: "R", color: "#ff8000", scrapeable: true },
  { pattern: /anthropic\.com/i, name: "Anthropic", icon: "A", color: "#d4a574", scrapeable: true },
  { pattern: /openai\.com/i, name: "OpenAI", icon: "◎", color: "#10a37f", scrapeable: true },
  { pattern: /blog\./i, name: "Blog", icon: "✎", color: "#8b5cf6", scrapeable: true },
];
function detectSource(url) {
  if (!url) return { name: "No URL", icon: "—", color: "#7a82a0", scrapeable: true };
  for (const s of SOURCE_PATTERNS) if (s.pattern.test(url)) return s;
  return { name: "Web", icon: "◇", color: "#3b82f6", scrapeable: true };
}

// SEED data removed — now stored in SQLite database via server/seed.js

// ─── SIGNAL STREAM DATA ─────────────────────────────────────────────
const AI_SIGNALS = [];
const FIN_AI_SIGNALS = [];

// Groq config removed — report generation now handled server-side via /api/reports/generate

// ─── LLM FUNCTIONS ──────────────────────────────────────────────────
// Summarization is handled server-side via POST /api/ai/summarize
async function summarizeForAdmin(title, reviewerNotes, category, urls, submitterNotes) {
  try {
    return await api.summarizeInsight({ title, reviewerNotes, category, urls, submitterNotes });
  } catch (e) {
    console.error("❌ summarizeForAdmin error:", e);
    return null;
  }
}

// ─── PIE CHART ──────────────────────────────────────────────────────
const PIE_COLORS = ["#3b82f6","#06d6e0","#8b5cf6","#ec4899","#f0a030","#7a82a0"];
function PieChart({ data, onClickSegment }) {
  const [hover, setHover] = useState(-1);
  const total = data.reduce((s, d) => s + d.count, 0);
  const filtered = data.filter(d => d.count > 0);
  const segments = useMemo(() => {
    let angle = -Math.PI / 2;
    return filtered.map((d) => {
      const sweep = (d.count / total) * Math.PI * 2;
      const seg = { ...d, start: angle, end: angle + sweep, color: PIE_COLORS[CATEGORIES.indexOf(d.name)] ?? PIE_COLORS[5] };
      angle += sweep;
      return seg;
    });
  }, [filtered, total]);

  if (total === 0) return <div style={{color:"var(--text-muted)",fontSize:13}}>No data yet</div>;

  return (
    <div style={{display:"flex",alignItems:"center",gap:24,flexWrap:"wrap"}}>
      <svg width="220" height="220" viewBox="0 0 220 220" style={{flexShrink:0}}>
        <defs><filter id="pie-glow"><feGaussianBlur stdDeviation="3" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
        {segments.map((seg, i) => {
          const r = hover === i ? 88 : 84, ir = hover === i ? 50 : 52, cx = 110, cy = 110;
          const x1 = cx+r*Math.cos(seg.start), y1 = cy+r*Math.sin(seg.start);
          const x2 = cx+r*Math.cos(seg.end), y2 = cy+r*Math.sin(seg.end);
          const ix1 = cx+ir*Math.cos(seg.end), iy1 = cy+ir*Math.sin(seg.end);
          const ix2 = cx+ir*Math.cos(seg.start), iy2 = cy+ir*Math.sin(seg.start);
          const large = seg.end - seg.start > Math.PI ? 1 : 0;
          return <path key={i} d={`M${x1},${y1} A${r},${r} 0 ${large} 1 ${x2},${y2} L${ix1},${iy1} A${ir},${ir} 0 ${large} 0 ${ix2},${iy2} Z`}
            fill={seg.color} opacity={hover===-1||hover===i?1:0.35}
            style={{transition:"all 0.25s",cursor:"pointer",filter:hover===i?"url(#pie-glow)":"none"}}
            onMouseEnter={()=>setHover(i)} onMouseLeave={()=>setHover(-1)}
            onClick={()=>onClickSegment&&onClickSegment(seg.name)} />;
        })}
        <circle cx="110" cy="110" r="44" fill="#07080d"/>
        <text x="110" y="104" textAnchor="middle" fill="#e8ecf4" fontSize="24" fontWeight="800" fontFamily="'JetBrains Mono',monospace">{total}</text>
        <text x="110" y="122" textAnchor="middle" fill="#4a5070" fontSize="10" fontWeight="600" fontFamily="'Outfit',sans-serif" letterSpacing="1">TOTAL</text>
      </svg>
      <div style={{display:"flex",flexDirection:"column",gap:6,minWidth:120}}>
        {segments.map((seg, i) => (
          <div key={i} style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",padding:"4px 8px",borderRadius:6,background:hover===i?"rgba(255,255,255,0.04)":"transparent",transition:"all 0.2s"}}
            onMouseEnter={()=>setHover(i)} onMouseLeave={()=>setHover(-1)}
            onClick={()=>onClickSegment&&onClickSegment(seg.name)}>
            <div style={{width:10,height:10,borderRadius:3,background:seg.color,flexShrink:0,boxShadow:hover===i?`0 0 8px ${seg.color}60`:"none",transition:"all 0.2s"}}/>
            <span style={{fontSize:12,color:hover===i?"#e8ecf4":"#7a82a0",transition:"color 0.2s",fontFamily:"'JetBrains Mono',monospace",flex:1}}>{seg.name}</span>
            <span style={{fontSize:12,color:hover===i?"#e8ecf4":"#4a5070",fontWeight:700,fontFamily:"'JetBrains Mono',monospace"}}>{seg.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── STYLES ─────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700&family=Outfit:wght@300;400;500;600;700;800&display=swap');
:root{--bg-primary:#07080d;--bg-secondary:#0d0f17;--bg-card:#111420;--bg-card-hover:#161a28;--bg-input:#0f1219;--border:#1e2235;--border-glow:#2a3050;--text-primary:#e8ecf4;--text-secondary:#7a82a0;--text-muted:#4a5070;--accent-blue:#3b82f6;--accent-cyan:#06d6e0;--accent-purple:#8b5cf6;--accent-pink:#ec4899;--accent-green:#10b981;--accent-orange:#f59e0b;--accent-red:#ef4444;--glow-blue:rgba(59,130,246,0.15);--glow-cyan:rgba(6,214,224,0.1)}
*{margin:0;padding:0;box-sizing:border-box}html,body,#root{text-align:left;width:100%}body{background:var(--bg-primary);color:var(--text-primary);font-family:'Outfit',sans-serif}#root{display:flex;min-height:100vh}
.app{display:flex;min-height:100vh;background:var(--bg-primary);width:100%;text-align:left}
.sidebar{width:260px;min-height:100vh;background:var(--bg-secondary);border-right:1px solid var(--border);display:flex;flex-direction:column;position:fixed;left:0;top:0;bottom:0;z-index:100}
.sidebar-logo{padding:24px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:12px}
.logo-icon{width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,var(--accent-blue),var(--accent-cyan));display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;color:#fff;box-shadow:0 0 20px var(--glow-blue)}
.logo-text{font-size:17px;font-weight:700;letter-spacing:-0.3px}.logo-sub{font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:2px;margin-top:2px}
.sidebar-nav{flex:1;padding:16px 12px;display:flex;flex-direction:column;gap:4px}
.nav-item{display:flex;align-items:center;gap:12px;padding:12px 16px;border-radius:10px;cursor:pointer;transition:all 0.2s;font-size:14px;font-weight:500;color:var(--text-secondary);border:1px solid transparent;position:relative;overflow:hidden}
.nav-item:hover{background:var(--bg-card);color:var(--text-primary)}
.nav-item.active{background:var(--bg-card);color:var(--accent-cyan);border-color:var(--border-glow);box-shadow:0 0 20px var(--glow-cyan),inset 0 0 20px rgba(6,214,224,0.03)}
.nav-item.active::before{content:'';position:absolute;left:0;top:50%;transform:translateY(-50%);width:3px;height:20px;background:var(--accent-cyan);border-radius:0 4px 4px 0}
.nav-icon{font-size:18px;width:24px;text-align:center}
.nav-badge-count{margin-left:auto;background:rgba(239,68,68,0.2);color:var(--accent-red);font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px;font-family:'JetBrains Mono',monospace}
.sidebar-footer{padding:16px 20px;border-top:1px solid var(--border);font-size:11px;color:var(--text-muted)}
.main{margin-left:260px;flex:1;min-height:100vh;width:calc(100vw - 260px);overflow-x:hidden}
.page-header{padding:16px 24px 12px;border-bottom:1px solid var(--border);background:linear-gradient(180deg,var(--bg-secondary) 0%,var(--bg-primary) 100%);text-align:left;display:flex;align-items:center;justify-content:space-between;gap:12px}
.profile-icon-btn{width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,var(--accent-blue),var(--accent-cyan));display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;border:2px solid transparent;transition:all 0.2s;box-shadow:0 0 12px var(--glow-blue)}
.profile-icon-btn:hover{transform:scale(1.08);box-shadow:0 0 20px var(--glow-cyan);border-color:var(--accent-cyan)}
.profile-icon-initials{font-size:13px;font-weight:700;color:#fff;font-family:'JetBrains Mono',monospace;line-height:1;letter-spacing:-0.5px}
.page-title{font-size:20px;font-weight:700;letter-spacing:-0.5px;background:linear-gradient(135deg,var(--text-primary) 0%,var(--accent-cyan) 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.page-subtitle{font-size:11px;color:var(--text-muted);margin-top:2px}
.page-content{padding:20px 24px;width:100%}
.metrics-row{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px;margin-bottom:24px;width:100%}
.metric-card{background:var(--bg-card);border:1px solid var(--border);border-radius:10px;padding:16px 20px;position:relative;overflow:hidden;transition:all 0.3s;cursor:pointer;text-align:left}
.metric-card:hover{border-color:var(--border-glow);transform:translateY(-2px);box-shadow:0 4px 20px rgba(0,0,0,0.3)}
.metric-card::after{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,var(--accent-blue),var(--accent-cyan));opacity:0.6}
.metric-card.alert-card::after{background:linear-gradient(90deg,var(--accent-orange),var(--accent-red))}
.metric-value{font-size:32px;font-weight:800;font-family:'JetBrains Mono',monospace;background:linear-gradient(135deg,var(--text-primary),var(--accent-cyan));-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.metric-value.alert-value{background:linear-gradient(135deg,var(--accent-orange),var(--accent-red));-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.metric-label{font-size:12px;color:var(--text-muted);margin-top:4px;text-transform:uppercase;letter-spacing:1px}
.metric-card-hint{font-size:10px;color:var(--text-muted);margin-top:6px;opacity:0;transition:opacity 0.2s}
.metric-card:hover .metric-card-hint{opacity:1}
.section-title{font-size:12px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:1.5px;margin-bottom:12px;display:flex;align-items:center;gap:8px}
.section-title::before{content:'';width:4px;height:16px;border-radius:2px;background:linear-gradient(180deg,var(--accent-blue),var(--accent-cyan))}
.insight-card{background:var(--bg-card);border:1px solid var(--border);border-radius:10px;padding:14px 18px;margin-bottom:8px;cursor:pointer;transition:all 0.25s;width:100%;text-align:left}
.insight-card:hover{border-color:var(--border-glow);background:var(--bg-card-hover);box-shadow:0 4px 24px rgba(0,0,0,0.3)}
.insight-card-title{font-size:15px;font-weight:600;line-height:1.4}
.insight-card-meta{display:flex;gap:8px;align-items:center;margin-top:10px;flex-wrap:wrap}
.insight-card-desc{font-size:12px;color:var(--text-muted);margin-top:6px;line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.badge{display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:6px;font-size:11px;font-weight:600;font-family:'JetBrains Mono',monospace;letter-spacing:0.3px}
.badge-category{background:rgba(59,130,246,0.12);color:var(--accent-blue);border:1px solid rgba(59,130,246,0.2)}
.badge-impact-High{background:rgba(255,77,106,0.12);color:#ff4d6a;border:1px solid rgba(255,77,106,0.2)}
.badge-impact-Medium{background:rgba(240,160,48,0.12);color:#f0a030;border:1px solid rgba(240,160,48,0.2)}
.badge-impact-Low{background:rgba(78,205,196,0.12);color:#4ecdc4;border:1px solid rgba(78,205,196,0.2)}
.badge-impact-Other{background:rgba(122,130,160,0.12);color:var(--text-secondary);border:1px solid rgba(122,130,160,0.2)}
.badge-tag{background:rgba(139,92,246,0.1);color:var(--accent-purple);border:1px solid rgba(139,92,246,0.15)}
.badge-date{color:var(--text-muted);font-size:11px}
.badge-source{display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:6px;font-size:11px;font-weight:600;font-family:'JetBrains Mono',monospace;border:1px solid}
.badge-review{background:rgba(245,158,11,0.12);color:var(--accent-orange);border:1px solid rgba(245,158,11,0.25);animation:reviewPulse 2s ease infinite}
@keyframes reviewPulse{0%,100%{opacity:1}50%{opacity:0.6}}
.badge-reviewed{background:rgba(16,185,129,0.12);color:var(--accent-green);border:1px solid rgba(16,185,129,0.2)}
.two-col{display:grid;grid-template-columns:1fr 380px;gap:20px;width:100%;align-items:start}
@media(min-width:1400px){.two-col{grid-template-columns:1fr 440px}}
@media(min-width:1800px){.two-col{grid-template-columns:1fr 500px}}
.form-group{margin-bottom:20px}.form-label{display:block;font-size:12px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px}
.form-label .opt{font-weight:400;color:var(--text-muted);text-transform:none;letter-spacing:0;font-size:11px}
.form-label .req{color:var(--accent-red)}
.form-input,.form-select,.form-textarea{width:100%;padding:12px 16px;background:var(--bg-input);border:1px solid var(--border);border-radius:10px;color:var(--text-primary);font-size:14px;font-family:'Outfit',sans-serif;transition:all 0.2s;outline:none}
.form-input:focus,.form-select:focus,.form-textarea:focus{border-color:var(--accent-cyan);box-shadow:0 0 0 3px var(--glow-cyan)}
.form-input.error{border-color:var(--accent-red);box-shadow:0 0 0 3px rgba(239,68,68,0.15)}
.form-textarea{min-height:80px;resize:vertical}
.form-select{cursor:pointer;appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='%237a82a0' viewBox='0 0 16 16'%3E%3Cpath d='M8 11L3 6h10z'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 14px center}
.form-select option{background:var(--bg-card);color:var(--text-primary)}
.form-hint{font-size:11px;color:var(--text-muted);margin-top:6px;line-height:1.4}
.form-error{font-size:11px;color:var(--accent-red);margin-top:6px}
.form-row{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.source-tag{display:inline-flex;align-items:center;gap:6px;padding:6px 12px;background:var(--bg-input);border:1px solid var(--border);border-radius:8px;margin-top:6px;font-size:12px;margin-right:6px}
.source-tag-icon{width:20px;height:20px;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:#fff;flex-shrink:0}
.source-tag-remove{cursor:pointer;color:var(--text-muted);font-size:14px;margin-left:4px;transition:color 0.2s}.source-tag-remove:hover{color:var(--accent-red)}
.source-tag-warn{font-size:10px;color:var(--accent-orange)}
.btn{display:inline-flex;align-items:center;gap:8px;padding:12px 24px;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;border:none;transition:all 0.25s;font-family:'Outfit',sans-serif}
.btn-primary{background:linear-gradient(135deg,var(--accent-blue),var(--accent-cyan));color:#fff;box-shadow:0 4px 16px var(--glow-blue)}
.btn-primary:hover{transform:translateY(-1px);box-shadow:0 6px 24px var(--glow-blue)}
.btn-primary:disabled{opacity:0.5;cursor:not-allowed;transform:none}
.btn-success{background:linear-gradient(135deg,#10b981,#06d6e0);color:#fff}
.btn-success:hover{transform:translateY(-1px)}
.btn-sm{padding:8px 16px;font-size:12px}
.table-wrapper{overflow-x:auto;border:1px solid var(--border);border-radius:10px;background:var(--bg-card);width:100%}
table{width:100%;border-collapse:collapse}
thead th{padding:10px 14px;text-align:left;font-size:10px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid var(--border);background:var(--bg-secondary)}
thead th:first-child{border-radius:10px 0 0 0}thead th:last-child{border-radius:0 10px 0 0}
tbody td{padding:10px 14px;font-size:13px;border-bottom:1px solid var(--border)}
tbody tr{cursor:pointer;transition:background 0.15s}tbody tr:hover{background:var(--bg-card-hover)}tbody tr:last-child td{border-bottom:none}
.filters-bar{display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap;align-items:center}
.filter-input{padding:10px 16px;background:var(--bg-input);border:1px solid var(--border);border-radius:8px;color:var(--text-primary);font-size:13px;outline:none;font-family:'Outfit',sans-serif;min-width:220px;transition:all 0.2s}
.filter-input:focus{border-color:var(--accent-cyan);box-shadow:0 0 0 3px var(--glow-cyan)}
.filter-select{padding:10px 32px 10px 14px;background:var(--bg-input);border:1px solid var(--border);border-radius:8px;color:var(--text-primary);font-size:13px;cursor:pointer;font-family:'Outfit',sans-serif;outline:none;appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='%237a82a0' viewBox='0 0 16 16'%3E%3Cpath d='M8 11L3 6h10z'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 10px center}
.filter-select option{background:var(--bg-card)}
.active-filter-bar{display:flex;gap:8px;align-items:center;margin-bottom:16px;padding:10px 16px;background:rgba(6,214,224,0.04);border:1px solid rgba(6,214,224,0.12);border-radius:8px;font-size:13px;color:var(--text-secondary)}
.active-filter-bar .clear-btn{margin-left:auto;cursor:pointer;color:var(--accent-cyan);font-size:12px;font-weight:600;transition:opacity 0.2s}.active-filter-bar .clear-btn:hover{opacity:0.7}
.detail-back{display:inline-flex;align-items:center;gap:6px;color:var(--text-secondary);cursor:pointer;font-size:13px;margin-bottom:20px;transition:color 0.2s}.detail-back:hover{color:var(--accent-cyan)}
.detail-section{background:var(--bg-card);border:1px solid var(--border);border-radius:10px;padding:20px;margin-bottom:12px}
.detail-section h3{font-size:12px;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:10px}
.detail-section p{font-size:14px;line-height:1.7;color:var(--text-secondary)}
.detail-url{color:var(--accent-blue);text-decoration:none;font-size:13px;word-break:break-all}.detail-url:hover{text-decoration:underline}
.key-point-item{display:flex;gap:10px;align-items:flex-start;margin-bottom:8px;font-size:14px;color:var(--text-secondary);line-height:1.5}
.key-point-bullet{color:var(--accent-cyan);font-size:10px;margin-top:5px;flex-shrink:0}
.review-banner{background:linear-gradient(135deg,rgba(245,158,11,0.08),rgba(239,68,68,0.05));border:1px solid rgba(245,158,11,0.25);border-radius:12px;padding:20px 24px;margin-bottom:16px}
.review-banner-text{font-size:14px;color:var(--accent-orange);font-weight:500}
.review-banner-sub{font-size:12px;color:var(--text-muted);margin-top:4px}
.admin-form{background:var(--bg-card);border:1px solid var(--accent-orange);border-radius:10px;padding:20px;margin-bottom:12px}
.admin-form-title{font-size:14px;font-weight:600;color:var(--accent-orange);margin-bottom:16px}
.report-box{background:var(--bg-card);border:1px solid var(--border);border-radius:10px;padding:24px;line-height:1.7;white-space:pre-wrap;font-size:13px;color:var(--text-secondary)}
.report-box h2{font-size:20px;color:var(--text-primary);margin:24px 0 12px;font-weight:700}.report-box h2:first-child{margin-top:0}
.report-box h3{font-size:16px;color:var(--accent-cyan);margin:16px 0 8px}
@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
.fade-in{animation:fadeIn 0.35s ease forwards}.fade-in-d1{animation-delay:0.05s;opacity:0}.fade-in-d2{animation-delay:0.1s;opacity:0}.fade-in-d3{animation-delay:0.15s;opacity:0}.fade-in-d4{animation-delay:0.2s;opacity:0}.fade-in-d5{animation-delay:0.25s;opacity:0}
.spinner{display:inline-block;width:18px;height:18px;border:2px solid var(--border);border-top-color:var(--accent-cyan);border-radius:50%;animation:spin 0.7s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.toast{position:fixed;bottom:24px;right:24px;padding:14px 24px;background:var(--accent-green);color:#fff;border-radius:10px;font-size:14px;font-weight:600;z-index:1000;animation:slideUp 0.3s ease,fadeOut 0.3s ease 2.5s forwards;box-shadow:0 8px 32px rgba(16,185,129,0.3)}
.badge-entry-type{font-size:10px;padding:3px 8px;border-radius:5px;font-weight:600;font-family:'JetBrains Mono',monospace;letter-spacing:0.3px;display:inline-flex;align-items:center;gap:4px}
.badge-entry-intelligence{background:rgba(6,214,224,0.1);color:var(--accent-cyan);border:1px solid rgba(6,214,224,0.2)}
.badge-entry-ai_signal{background:rgba(59,130,246,0.1);color:var(--accent-blue);border:1px solid rgba(59,130,246,0.2)}
.badge-entry-financial_ai{background:rgba(16,185,129,0.1);color:var(--accent-green);border:1px solid rgba(16,185,129,0.2)}
.entry-type-selector{display:flex;gap:10px;flex-wrap:wrap}
.entry-type-option{display:flex;align-items:center;gap:10px;padding:12px 16px;border-radius:10px;border:2px solid var(--border);background:var(--bg-input);cursor:pointer;transition:all 0.25s;flex:1;min-width:160px}
.entry-type-option:hover{border-color:var(--border-glow);background:var(--bg-card-hover)}
.entry-type-option.selected{border-color:var(--accent-cyan);background:rgba(6,214,224,0.04);box-shadow:0 0 12px var(--glow-cyan)}
.entry-type-option .et-icon{width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:#fff;flex-shrink:0}
.entry-type-option .et-label{font-size:14px;font-weight:600;color:var(--text-primary)}
.entry-type-option .et-desc{font-size:11px;color:var(--text-muted);margin-top:2px}
@keyframes slideUp{from{transform:translateY(20px);opacity:0}}@keyframes fadeOut{to{opacity:0;transform:translateY(-10px)}}
.pulse-dot{width:8px;height:8px;border-radius:50%;background:var(--accent-green);display:inline-block;animation:pulse 2s ease infinite}
@keyframes pulse{0%,100%{box-shadow:0 0 0 0 rgba(16,185,129,0.4)}50%{box-shadow:0 0 0 6px rgba(16,185,129,0)}}
.empty-state{text-align:center;padding:60px 20px;color:var(--text-muted)}.empty-state-icon{font-size:48px;margin-bottom:16px;opacity:0.3}
.toggle-row{display:flex;align-items:center;gap:10px;cursor:pointer;font-size:14px;color:var(--text-secondary)}
.toggle-box{width:18px;height:18px;border-radius:4px;border:2px solid var(--border);display:flex;align-items:center;justify-content:center;transition:all 0.2s;font-size:11px;color:transparent;flex-shrink:0}
.toggle-box.checked{border-color:var(--accent-cyan);background:var(--accent-cyan);color:#fff}
.add-url-btn{display:inline-flex;align-items:center;gap:6px;padding:8px 14px;border-radius:8px;font-size:12px;color:var(--accent-cyan);background:rgba(6,214,224,0.06);border:1px dashed rgba(6,214,224,0.3);cursor:pointer;transition:all 0.2s;margin-top:8px;font-family:'Outfit',sans-serif}
.add-url-btn:hover{background:rgba(6,214,224,0.1);border-color:var(--accent-cyan)}
.collapsible-header{display:flex;align-items:center;gap:8px;cursor:pointer;padding:12px 0;color:var(--text-secondary);font-size:13px;transition:color 0.2s}
.collapsible-header:hover{color:var(--text-primary)}
.collapsible-arrow{transition:transform 0.2s;font-size:10px}
.source-monitor{padding:16px;display:flex;flex-direction:column;gap:10px}
.source-bar-row{display:flex;align-items:center;gap:10px;cursor:pointer;padding:4px 0;transition:opacity 0.2s}
.source-bar-row:hover{opacity:0.85}
.source-bar-icon{width:22px;height:22px;border-radius:5px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#fff;flex-shrink:0}
.source-bar-name{font-size:11px;color:var(--text-secondary);font-family:'JetBrains Mono',monospace;width:80px;flex-shrink:0;text-align:right}
.source-bar-track{flex:1;height:16px;background:rgba(255,255,255,0.03);border-radius:4px;overflow:hidden;position:relative}
.source-bar-fill{height:100%;border-radius:4px;transition:width 0.8s cubic-bezier(0.22,1,0.36,1);position:relative}
.source-bar-fill::after{content:'';position:absolute;top:0;right:0;bottom:0;width:20px;background:linear-gradient(90deg,transparent,rgba(255,255,255,0.15));border-radius:0 4px 4px 0}
.source-bar-count{font-size:11px;font-weight:700;font-family:'JetBrains Mono',monospace;color:var(--text-muted);width:24px;text-align:right;flex-shrink:0}
.heatmap-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:3px;padding:16px}
.heatmap-cell{aspect-ratio:1;border-radius:3px;transition:all 0.2s;position:relative;cursor:pointer;min-height:14px}
.heatmap-cell:hover{transform:scale(1.3);z-index:2}
.heatmap-cell[data-tooltip]:hover::after{content:attr(data-tooltip);position:absolute;bottom:calc(100% + 6px);left:50%;transform:translateX(-50%);background:var(--bg-card);border:1px solid var(--border-glow);padding:4px 8px;border-radius:6px;font-size:10px;font-family:'JetBrains Mono',monospace;color:var(--text-primary);white-space:nowrap;z-index:10;pointer-events:none;box-shadow:0 4px 12px rgba(0,0,0,0.4)}
.heatmap-legend{display:flex;align-items:center;gap:6px;padding:0 16px 12px;font-size:10px;color:var(--text-muted);font-family:'JetBrains Mono',monospace}
.heatmap-legend-cell{width:12px;height:12px;border-radius:2px}
.heatmap-header{display:flex;align-items:center;justify-content:space-between;padding:12px 16px 0}
.heatmap-stat{font-size:18px;font-weight:800;font-family:'JetBrains Mono',monospace;color:var(--accent-cyan)}
@media(max-width:900px){.sidebar{display:none}.main{margin-left:0;width:100%}.two-col{grid-template-columns:1fr}.page-content{padding:14px}.page-header{padding:14px 14px 10px}.form-row{grid-template-columns:1fr}.metrics-row{grid-template-columns:repeat(auto-fill,minmax(150px,1fr))}}
.signal-panel{display:none}
.terminal-layout{display:block}
@media(min-width:1600px){
.page-content{padding:24px 32px}.insight-card-title{font-size:16px}
.terminal-layout{display:grid;grid-template-columns:280px 1fr 280px;gap:0;width:100%}
.signal-panel{display:flex;flex-direction:column;height:calc(100vh - 80px);position:sticky;top:80px;background:var(--bg-secondary);border:1px solid var(--border);overflow:hidden}
.signal-panel-left{border-right:1px solid var(--border);border-left:none;border-top:none;border-bottom:none;border-radius:0}
.signal-panel-right{border-left:1px solid var(--border);border-right:none;border-top:none;border-bottom:none;border-radius:0}
}
@media(min-width:1900px){.terminal-layout{grid-template-columns:320px 1fr 320px}}
.signal-panel-header{display:flex;align-items:center;gap:8px;padding:14px 16px;border-bottom:1px solid var(--border);background:var(--bg-primary);flex-shrink:0}
.signal-panel-dot{width:8px;height:8px;border-radius:50%;animation:pulse 2s ease infinite;flex-shrink:0}
.signal-panel-title{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:var(--text-secondary);font-family:'JetBrains Mono',monospace}
.signal-panel-live{margin-left:auto;display:flex;align-items:center;gap:5px;font-size:9px;font-weight:700;color:var(--accent-green);font-family:'JetBrains Mono',monospace;letter-spacing:1px;padding:2px 6px;background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.2);border-radius:4px}
.live-dot{width:5px;height:5px;border-radius:50%;background:var(--accent-green);animation:pulse 1.5s ease infinite;flex-shrink:0}
.signal-panel-scroll-wrapper{flex:1;overflow:hidden;position:relative}
.signal-panel-scroll-wrapper::after{content:'';position:absolute;bottom:0;left:0;right:0;height:40px;background:linear-gradient(transparent,var(--bg-secondary));pointer-events:none;z-index:2}
.signal-panel-scroll{animation:scrollSignals 60s linear infinite}
@keyframes scrollSignals{0%{transform:translateY(0)}100%{transform:translateY(-50%)}}
.signal-panel-scroll:hover{animation-play-state:paused}
.signal-edge-zone{position:absolute;left:0;right:0;height:60px;z-index:3;cursor:pointer}
.signal-edge-zone-top{top:0;background:linear-gradient(180deg,rgba(6,214,224,0.08) 0%,transparent 100%);opacity:0;transition:opacity 0.2s}
.signal-edge-zone-bottom{bottom:0;background:linear-gradient(0deg,rgba(6,214,224,0.08) 0%,transparent 100%);opacity:0;transition:opacity 0.2s}
.signal-edge-zone:hover{opacity:1}
.signal-edge-zone-top::after,.signal-edge-zone-bottom::after{content:'';position:absolute;left:50%;transform:translateX(-50%);width:24px;height:24px;border-radius:50%;background:rgba(6,214,224,0.12);display:flex;align-items:center;justify-content:center}
.signal-edge-zone-top::after{top:8px;border:1px solid rgba(6,214,224,0.25)}
.signal-edge-zone-bottom::after{bottom:8px;border:1px solid rgba(6,214,224,0.25)}
.signal-edge-arrow{position:absolute;left:50%;transform:translateX(-50%);font-size:10px;color:var(--accent-cyan);pointer-events:none;font-family:'JetBrains Mono',monospace}
.signal-edge-zone-top .signal-edge-arrow{top:13px}
.signal-edge-zone-bottom .signal-edge-arrow{bottom:13px}
.signal-panel-toggle{position:fixed;bottom:24px;z-index:200;display:none;align-items:center;gap:8px;padding:10px 18px;border-radius:12px;background:var(--bg-card);border:1px solid var(--border-glow);color:var(--text-primary);font-size:12px;font-weight:600;font-family:'JetBrains Mono',monospace;cursor:pointer;transition:all 0.25s;box-shadow:0 4px 24px rgba(0,0,0,0.4),0 0 12px var(--glow-cyan)}
.signal-panel-toggle:hover{transform:translateY(-2px);box-shadow:0 6px 32px rgba(0,0,0,0.5),0 0 16px var(--glow-cyan)}
.signal-panel-toggle-left{left:280px}
.signal-panel-toggle-right{right:20px}
@media(max-width:900px){.signal-panel-toggle-left{left:20px}}
@media(min-width:901px) and (max-width:1599px){.signal-panel-toggle{display:flex}}
.signal-panel-laptop-overlay{display:none !important}
.signal-panel-laptop-overlay.visible{display:flex !important;position:fixed;top:0;bottom:0;width:50vw;max-width:600px;min-width:340px;z-index:150;background:var(--bg-primary);border:1px solid var(--border-glow);box-shadow:0 0 60px rgba(0,0,0,0.8),0 0 20px var(--glow-cyan);animation:slidePanel 0.3s ease}
.signal-panel-laptop-overlay.visible.signal-panel-left{left:260px}
.signal-panel-laptop-overlay.visible.signal-panel-right{right:0}
@media(max-width:900px){.signal-panel-laptop-overlay.visible.signal-panel-left{left:0;width:80vw}}
@keyframes slidePanel{from{opacity:0;transform:translateX(-20px)}to{opacity:1;transform:translateX(0)}}
.signal-panel-laptop-overlay.visible.signal-panel-right{animation-name:slidePanelRight}
@keyframes slidePanelRight{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}}
.signal-panel-overlay-close{position:absolute;top:12px;right:12px;width:28px;height:28px;border-radius:6px;background:rgba(255,255,255,0.06);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--text-muted);font-size:14px;z-index:10;transition:all 0.2s}
.signal-panel-overlay-close:hover{background:rgba(239,68,68,0.15);color:var(--accent-red);border-color:rgba(239,68,68,0.3)}
.signal-panel-backdrop{display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);backdrop-filter:blur(4px);z-index:140;animation:fadeInBackdrop 0.2s ease}
.signal-panel-backdrop.visible{display:block}
@keyframes fadeInBackdrop{from{opacity:0}to{opacity:1}}
@media(min-width:1600px){.signal-panel-laptop-overlay{display:none !important}.signal-panel-backdrop{display:none !important}}
.signal-item{display:flex;gap:10px;padding:10px 14px;border-bottom:1px solid rgba(30,34,53,0.5);cursor:pointer;transition:all 0.2s;text-decoration:none;color:inherit}
.signal-item:hover{background:rgba(6,214,224,0.04);box-shadow:inset 3px 0 0 var(--panel-accent,var(--accent-cyan))}
.signal-item-icon{width:24px;height:24px;border-radius:5px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#fff;flex-shrink:0;margin-top:1px}
.signal-item-body{flex:1;min-width:0}
.signal-item-title{font-size:11px;font-weight:500;color:var(--text-primary);line-height:1.4;font-family:'JetBrains Mono',monospace;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.signal-item-meta{display:flex;align-items:center;gap:8px;margin-top:4px;font-size:9px;font-family:'JetBrains Mono',monospace}
.signal-item-time{color:var(--text-muted)}
.signal-add-btn{margin-left:6px;background:none;border:none;cursor:pointer;font-size:16px;line-height:1;padding:0 2px;opacity:0.7;transition:opacity 0.2s}.signal-add-btn:hover{opacity:1}
.signal-add-form{padding:10px 12px;border-bottom:1px solid var(--border);background:var(--bg-primary);display:flex;flex-direction:column;gap:6px;flex-shrink:0}
.signal-add-tabs{display:flex;gap:0;border-bottom:1px solid var(--border);margin-bottom:6px}
.signal-add-tab{background:none;border:none;border-bottom:2px solid transparent;padding:4px 12px;font-size:10px;font-weight:600;font-family:'JetBrains Mono',monospace;color:var(--text-muted);cursor:pointer;transition:all 0.15s;text-transform:uppercase;letter-spacing:0.5px}.signal-add-tab.active{color:var(--text-primary)}.signal-add-tab:hover{color:var(--text-primary)}
.signal-add-input{background:var(--bg-input);border:1px solid var(--border);border-radius:6px;padding:6px 10px;font-size:11px;color:var(--text-primary);font-family:'JetBrains Mono',monospace;outline:none;width:100%}
.signal-add-input:focus{border-color:var(--border-glow)}
.signal-add-submit{align-self:flex-end;background:none;border:1px solid;border-radius:6px;padding:4px 14px;font-size:11px;font-weight:600;font-family:'JetBrains Mono',monospace;cursor:pointer;transition:opacity 0.2s}.signal-add-submit:hover:not(:disabled){opacity:0.75}.signal-add-submit:disabled{opacity:0.4;cursor:default}
.signal-delete-btn{align-self:center;background:none;border:none;cursor:pointer;font-size:16px;color:var(--text-muted);padding:0 2px;line-height:1;flex-shrink:0;opacity:0;transition:opacity 0.2s}.signal-item:hover .signal-delete-btn{opacity:1}.signal-delete-btn:hover{color:var(--accent-red)}
.signal-select-bar{display:flex;align-items:center;gap:8px;padding:7px 12px;background:rgba(239,68,68,0.05);border-bottom:1px solid rgba(239,68,68,0.15);flex-shrink:0}
.signal-select-all-btn{background:none;border:1px solid var(--border);border-radius:4px;padding:2px 8px;font-size:10px;font-weight:600;font-family:'JetBrains Mono',monospace;cursor:pointer;transition:opacity 0.2s}.signal-select-all-btn:hover{opacity:0.75}
.signal-item-selectable{display:flex;gap:10px;padding:10px 14px;border-bottom:1px solid rgba(30,34,53,0.5);cursor:pointer;transition:all 0.15s;align-items:flex-start}
.signal-item-selectable:hover{background:rgba(239,68,68,0.04)}
.signal-item-selected{background:rgba(239,68,68,0.06)!important}
.bulk-action-bar{display:flex;align-items:center;gap:10px;padding:10px 16px;background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.15);border-radius:8px;margin-bottom:12px}
.bulk-delete-btn{background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.25);border-radius:6px;padding:5px 14px;font-size:12px;font-weight:600;font-family:'JetBrains Mono',monospace;color:var(--accent-red);cursor:pointer;transition:all 0.2s}.bulk-delete-btn:hover:not(:disabled){background:rgba(239,68,68,0.2)}.bulk-delete-btn:disabled{opacity:0.5;cursor:default}
.bulk-cancel-btn{background:none;border:1px solid var(--border);border-radius:6px;padding:5px 12px;font-size:12px;font-weight:600;font-family:'JetBrains Mono',monospace;color:var(--text-muted);cursor:pointer;transition:opacity 0.2s}.bulk-cancel-btn:hover{opacity:0.75}
.bulk-checkbox{width:14px;height:14px;accent-color:var(--accent-cyan);cursor:pointer;flex-shrink:0}
.row-selected{background:rgba(6,214,224,0.04)!important}
.submitter-note-box{background:rgba(139,92,246,0.05);border:1px solid rgba(139,92,246,0.15);border-radius:8px;padding:14px 16px}
.submitter-note-meta{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
.submitter-note-author{font-size:11px;font-weight:600;color:var(--accent-purple);font-family:'JetBrains Mono',monospace;text-transform:uppercase;letter-spacing:0.5px}
.submitter-note-date{font-size:11px;color:var(--text-muted);font-family:'JetBrains Mono',monospace}
.submitter-note-text{font-size:13px;color:var(--text-secondary);line-height:1.7;font-style:italic;white-space:pre-wrap;word-break:break-word}
.view-more-link{display:inline-block;margin-top:10px;font-size:12px;font-weight:600;color:var(--accent-cyan);cursor:pointer;font-family:'JetBrains Mono',monospace;transition:opacity 0.2s}
.view-more-link:hover{opacity:0.75}
.profile-header-card{display:flex;align-items:center;gap:20px;background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:24px 28px;margin-bottom:20px;position:relative;overflow:hidden}
.profile-header-card::after{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,var(--accent-blue),var(--accent-cyan),var(--accent-purple));opacity:0.7}
.profile-avatar{width:60px;height:60px;border-radius:14px;background:linear-gradient(135deg,var(--accent-blue),var(--accent-cyan));display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:700;color:#fff;font-family:'JetBrains Mono',monospace;flex-shrink:0;box-shadow:0 0 24px var(--glow-blue)}
.profile-header-info{flex:1;min-width:0}
.profile-name{font-size:22px;font-weight:700;letter-spacing:-0.5px;color:var(--text-primary);margin:0 0 6px}
.profile-meta{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:6px}
.profile-email{font-size:13px;color:var(--text-secondary);font-family:'JetBrains Mono',monospace}
.profile-join{font-size:12px;color:var(--text-muted)}
.profile-header-right{display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0}
.profile-badge-count{display:flex;flex-direction:column;align-items:center;background:rgba(139,92,246,0.08);border:1px solid rgba(139,92,246,0.2);border-radius:10px;padding:10px 18px}
.profile-badge-number{font-size:28px;font-weight:800;font-family:'JetBrains Mono',monospace;color:var(--accent-purple);line-height:1}
.profile-badge-label{font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px;margin-top:2px}
.profile-stats-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px}
@media(max-width:900px){.profile-stats-grid{grid-template-columns:repeat(2,1fr)}}
.profile-stat-card{background:var(--bg-card);border:1px solid var(--border);border-radius:10px;padding:16px 20px;text-align:center;transition:all 0.2s}
.profile-stat-card:hover{border-color:var(--border-glow);transform:translateY(-2px)}
.profile-stat-value{font-size:30px;font-weight:800;font-family:'JetBrains Mono',monospace;line-height:1;margin-bottom:4px}
.profile-stat-label{font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px}
.profile-two-col{display:grid;grid-template-columns:1fr 360px;gap:20px;align-items:start}
@media(max-width:1100px){.profile-two-col{grid-template-columns:1fr}}
.profile-timeline{display:flex;flex-direction:column;gap:0}
.profile-timeline-item{display:flex;gap:14px;padding:10px 0;border-bottom:1px solid rgba(30,34,53,0.6);position:relative}
.profile-timeline-item:last-child{border-bottom:none}
.profile-timeline-dot{width:10px;height:10px;border-radius:50%;flex-shrink:0;margin-top:4px}
.dot-submitted{background:var(--accent-cyan);box-shadow:0 0 8px rgba(6,214,224,0.5)}
.dot-reviewed{background:var(--accent-green);box-shadow:0 0 8px rgba(16,185,129,0.5)}
.profile-timeline-content{flex:1;min-width:0}
.profile-timeline-action{display:flex;align-items:baseline;gap:6px;flex-wrap:wrap;margin-bottom:4px}
.profile-timeline-type{font-size:11px;font-weight:700;font-family:'JetBrains Mono',monospace;text-transform:uppercase;letter-spacing:0.5px;flex-shrink:0}
.profile-timeline-type.submitted{color:var(--accent-cyan)}
.profile-timeline-type.reviewed{color:var(--accent-green)}
.profile-timeline-title{font-size:13px;color:var(--text-primary);line-height:1.4;font-weight:500}
.profile-timeline-meta{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.profile-expertise{display:flex;flex-wrap:wrap;gap:8px}
.profile-expertise-tag{display:inline-flex;align-items:center;gap:6px;padding:5px 12px;background:rgba(139,92,246,0.08);border:1px solid rgba(139,92,246,0.18);border-radius:20px;transition:all 0.2s;cursor:default}
.profile-expertise-tag:hover{background:rgba(139,92,246,0.14);border-color:rgba(139,92,246,0.3)}
.profile-expertise-name{font-size:12px;font-weight:600;color:var(--accent-purple);font-family:'JetBrains Mono',monospace}
.profile-expertise-count{font-size:10px;color:var(--text-muted);font-family:'JetBrains Mono',monospace;background:rgba(139,92,246,0.12);padding:1px 5px;border-radius:4px}
.profile-badges{display:flex;flex-direction:column;gap:10px}
.profile-badge{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:10px;border:1px solid var(--border);transition:all 0.2s}
.profile-badge.earned{background:rgba(255,255,255,0.02);border-color:rgba(6,214,224,0.15)}
.profile-badge.earned:hover{border-color:rgba(6,214,224,0.3);background:rgba(6,214,224,0.03)}
.profile-badge.upcoming{background:rgba(0,0,0,0.1);border-color:var(--border);opacity:0.7}
.profile-badge-icon{font-size:22px;flex-shrink:0;width:32px;text-align:center}
.profile-badge-name{font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:2px}
.profile-badge-desc{font-size:11px;color:var(--text-muted)}
.profile-badge-divider{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:var(--text-muted);margin:12px 0 8px;padding-bottom:6px;border-bottom:1px solid var(--border)}
.profile-badge-progress{display:flex;align-items:center;gap:8px;margin-top:6px}
.profile-badge-bar{flex:1;height:4px;background:rgba(255,255,255,0.06);border-radius:2px;overflow:hidden}
.profile-badge-fill{height:100%;background:linear-gradient(90deg,var(--accent-blue),var(--accent-cyan));border-radius:2px;transition:width 0.6s cubic-bezier(0.22,1,0.36,1)}
.profile-badge-fraction{font-size:10px;color:var(--text-muted);font-family:'JetBrains Mono',monospace;flex-shrink:0}
.admin-tabs{display:flex;gap:0;border-bottom:1px solid var(--border);margin-bottom:24px;flex-shrink:0}
.admin-tab{background:none;border:none;border-bottom:2px solid transparent;padding:10px 22px;font-size:13px;font-weight:600;color:var(--text-muted);cursor:pointer;transition:all 0.2s;font-family:'Outfit',sans-serif;letter-spacing:0.2px}
.admin-tab.active{color:var(--accent-cyan);border-bottom-color:var(--accent-cyan)}
.admin-tab:hover:not(.active){color:var(--text-primary)}
.admin-cmd-header{display:flex;align-items:center;gap:10px;margin-bottom:20px}
.admin-cmd-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:var(--text-muted);font-family:'JetBrains Mono',monospace}
.cmd-dot{width:8px;height:8px;border-radius:50%;background:var(--accent-cyan);animation:pulse 2s ease infinite;flex-shrink:0}
.admin-metrics-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;margin-bottom:24px}
.admin-metric{background:var(--bg-card);border:1px solid var(--border);border-radius:10px;padding:16px 18px;position:relative;overflow:hidden;transition:all 0.2s}
.admin-metric:hover{border-color:var(--border-glow);transform:translateY(-1px)}
.admin-metric::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:var(--m-color,var(--accent-cyan));opacity:0.7}
.admin-metric-val{font-size:28px;font-weight:800;font-family:'JetBrains Mono',monospace;color:var(--m-color,var(--accent-cyan))}
.admin-metric-label{font-size:11px;color:var(--text-muted);margin-top:4px;text-transform:uppercase;letter-spacing:0.8px}
.admin-metric-sub{font-size:10px;color:var(--text-muted);margin-top:2px;opacity:0.7}
.admin-two-col{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:24px}
@media(max-width:1100px){.admin-two-col{grid-template-columns:1fr}}
.admin-card{background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:20px}
.admin-card-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:var(--text-secondary);margin-bottom:14px;display:flex;align-items:center;gap:8px}
.admin-card-title::before{content:'';width:3px;height:14px;border-radius:2px;background:var(--accent-cyan)}
.sample-banner{display:flex;align-items:center;gap:10px;padding:8px 14px;background:rgba(245,158,11,0.06);border:1px solid rgba(245,158,11,0.2);border-radius:8px;margin-bottom:14px;font-size:11px;color:var(--accent-orange);font-family:'JetBrains Mono',monospace}
.sample-badge{background:rgba(245,158,11,0.15);padding:2px 7px;border-radius:4px;font-size:10px;font-weight:700;letter-spacing:0.5px;flex-shrink:0}
.sample-remove-btn{margin-left:auto;background:none;border:1px solid rgba(245,158,11,0.3);border-radius:5px;padding:3px 10px;font-size:10px;color:var(--accent-orange);cursor:pointer;transition:opacity 0.2s;font-family:'JetBrains Mono',monospace}.sample-remove-btn:hover{opacity:0.7}
.ai-usage-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.ai-usage-card{background:var(--bg-secondary);border:1px solid var(--border);border-radius:8px;padding:14px 16px;position:relative;overflow:hidden}.ai-usage-card::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:var(--u-color,var(--accent-cyan));opacity:0.7}
.ai-usage-val{font-size:26px;font-weight:800;font-family:'JetBrains Mono',monospace;color:var(--u-color,var(--accent-cyan))}
.ai-usage-lbl{font-size:11px;color:var(--text-muted);margin-top:4px;text-transform:uppercase;letter-spacing:0.6px}
.traffic-lbl{font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.8px;margin-top:3px}
.cat-bar-row{display:flex;align-items:center;gap:10px;margin-bottom:8px}
.cat-bar-name{font-size:12px;color:var(--text-secondary);width:80px;flex-shrink:0;font-family:'JetBrains Mono',monospace}
.cat-bar-track{flex:1;height:6px;background:rgba(255,255,255,0.05);border-radius:3px;overflow:hidden}
.cat-bar-fill{height:100%;border-radius:3px;background:linear-gradient(90deg,var(--accent-blue),var(--accent-cyan));transition:width 0.6s cubic-bezier(0.22,1,0.36,1)}
.cat-bar-count{font-size:11px;color:var(--text-muted);font-family:'JetBrains Mono',monospace;width:28px;text-align:right;flex-shrink:0}
.activity-feed{display:flex;flex-direction:column}
.activity-item{display:flex;gap:12px;padding:10px 0;border-bottom:1px solid rgba(30,34,53,0.6);align-items:flex-start}
.activity-item:last-child{border-bottom:none}
.activity-dot-wrap{display:flex;flex-direction:column;align-items:center;gap:0;flex-shrink:0}
.activity-dot{width:8px;height:8px;border-radius:50%;margin-top:5px;flex-shrink:0}
.activity-type-badge{font-size:9px;font-weight:700;font-family:'JetBrains Mono',monospace;padding:2px 6px;border-radius:4px;flex-shrink:0;text-transform:uppercase;letter-spacing:0.3px}
.activity-badge-submitted{background:rgba(6,214,224,0.12);color:var(--accent-cyan)}
.activity-badge-reviewed{background:rgba(16,185,129,0.12);color:var(--accent-green)}
.activity-badge-report{background:rgba(139,92,246,0.12);color:var(--accent-purple)}
.activity-badge-sample{background:rgba(245,158,11,0.12);color:var(--accent-orange)}
.activity-title{font-size:12px;font-weight:500;color:var(--text-primary);line-height:1.4;margin-bottom:2px}
.activity-meta{font-size:11px;color:var(--text-muted);font-family:'JetBrains Mono',monospace}
.pending-table-wrap{max-height:340px;overflow-y:auto}
.upload-format-hint{background:var(--bg-secondary);border:1px solid var(--border);border-radius:8px;padding:12px 14px;font-size:11px;color:var(--text-muted);font-family:'JetBrains Mono',monospace;line-height:1.7;margin-bottom:10px;white-space:pre-wrap}
.user-action-btn{background:none;border:1px solid var(--border);border-radius:5px;padding:3px 10px;font-size:11px;color:var(--text-secondary);cursor:pointer;transition:all 0.15s;font-family:'JetBrains Mono',monospace}.user-action-btn:hover{border-color:var(--border-glow);color:var(--text-primary)}
.user-action-btn.danger:hover{border-color:rgba(239,68,68,0.4);color:var(--accent-red);background:rgba(239,68,68,0.05)}
.user-action-btn.promote:hover{border-color:rgba(6,214,224,0.4);color:var(--accent-cyan);background:rgba(6,214,224,0.05)}
.user-inactive{opacity:0.45}
.publish-bar{display:flex;align-items:center;gap:12px;padding:12px 16px;background:rgba(16,185,129,0.05);border:1px solid rgba(16,185,129,0.15);border-radius:8px;margin-bottom:14px}
`;

function SourceBadge({ url, small }) {
  const s = detectSource(url); if (!url) return null;
  return <span className="badge-source" style={{background:`${s.color}15`,color:s.color,borderColor:`${s.color}35`,...(small?{fontSize:10,padding:"2px 7px"}:{})}}><span style={{fontSize:small?9:10}}>{s.icon}</span> {s.name}</span>;
}

// ─── SOURCE ACTIVITY MONITOR ────────────────────────────────────────
function SourceActivityMonitor({ insights, onClickSource }) {
  const sourceData = useMemo(() => {
    const counts = {};
    const sourceInsightIds = {};
    insights.forEach(ins => {
      ins.urls.forEach(u => {
        const src = detectSource(u);
        if (src.name === "No URL" || src.name === "Web") return;
        if (!counts[src.name]) { counts[src.name] = { ...src, count: 0 }; sourceInsightIds[src.name] = new Set(); }
        counts[src.name].count++;
        sourceInsightIds[src.name].add(ins.id);
      });
    });
    return { sources: Object.values(counts).sort((a, b) => b.count - a.count).slice(0, 6), insightIds: sourceInsightIds };
  }, [insights]);
  const { sources } = sourceData;
  const max = Math.max(...sources.map(s => s.count), 1);
  if (sources.length === 0) return null;
  return (
    <div className="source-monitor">
      {sources.map((src, i) => (
        <div key={src.name} className="source-bar-row" onClick={() => onClickSource && onClickSource(src.name)} style={{animationDelay: `${i * 0.05}s`}}>
          <div className="source-bar-icon" style={{background: src.color}}>{src.icon}</div>
          <div className="source-bar-name">{src.name}</div>
          <div className="source-bar-track">
            <div className="source-bar-fill" style={{width: `${(src.count / max) * 100}%`, background: `linear-gradient(90deg, ${src.color}90, ${src.color})`}} />
          </div>
          <div className="source-bar-count" style={{color: src.color}}>{src.count}</div>
        </div>
      ))}
    </div>
  );
}

// ─── ACTIVITY HEATMAP ───────────────────────────────────────────────
function ActivityHeatmap({ insights, onClickDay }) {
  const { cells, totalPeriod } = useMemo(() => {
    const days = 28;
    const now = new Date();
    now.setHours(23, 59, 59, 999);
    const dayCounts = new Array(days).fill(0);
    const dayInsights = new Array(days).fill(null).map(() => []);
    insights.forEach(ins => {
      const d = new Date(ins.created_at);
      const diff = Math.floor((now - d) / 86400000);
      if (diff >= 0 && diff < days) { dayCounts[days - 1 - diff]++; dayInsights[days - 1 - diff].push(ins); }
    });
    const maxCount = Math.max(...dayCounts, 1);
    const cells = dayCounts.map((count, i) => {
      const date = new Date(now);
      date.setDate(date.getDate() - (days - 1 - i));
      const label = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      const intensity = count === 0 ? 0 : Math.max(0.2, count / maxCount);
      return { count, label, intensity, insights: dayInsights[i] };
    });
    return { cells, totalPeriod: dayCounts.reduce((a, b) => a + b, 0) };
  }, [insights]);
  return (
    <div>
      <div className="heatmap-header">
        <div style={{fontSize: 10, color: 'var(--text-muted)', fontFamily: "'JetBrains Mono',monospace", textTransform: 'uppercase', letterSpacing: 1}}>28-Day Activity</div>
        <div className="heatmap-stat">{totalPeriod}</div>
      </div>
      <div className="heatmap-grid">
        {cells.map((cell, i) => (
          <div
            key={i}
            className="heatmap-cell"
            data-tooltip={`${cell.label}: ${cell.count} insight${cell.count !== 1 ? 's' : ''}`}
            onClick={() => cell.count > 0 && onClickDay && onClickDay(cell.insights)}
            style={{
              background: cell.count === 0
                ? 'rgba(255,255,255,0.03)'
                : `rgba(6, 214, 224, ${cell.intensity * 0.7})`,
              boxShadow: cell.count > 0 ? `0 0 ${cell.intensity * 8}px rgba(6, 214, 224, ${cell.intensity * 0.3})` : 'none'
            }}
          />
        ))}
      </div>
      <div className="heatmap-legend">
        <span>Less</span>
        <div className="heatmap-legend-cell" style={{background: 'rgba(255,255,255,0.03)'}} />
        <div className="heatmap-legend-cell" style={{background: 'rgba(6,214,224,0.15)'}} />
        <div className="heatmap-legend-cell" style={{background: 'rgba(6,214,224,0.35)'}} />
        <div className="heatmap-legend-cell" style={{background: 'rgba(6,214,224,0.55)'}} />
        <div className="heatmap-legend-cell" style={{background: 'rgba(6,214,224,0.7)'}} />
        <span>More</span>
      </div>
    </div>
  );
}

// ─── HELPERS ────────────────────────────────────────────────────────
function timeAgo(dateStr) {
  const now = new Date();
  const d = new Date(dateStr);
  const diffMs = now - d;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}


// ─── SIGNAL STREAM PANEL ────────────────────────────────────────────
function SignalStreamPanel({ title, signals, dbSignals, panelId, accentColor, side, isOverlay, onClose, onAddSignal, onDeleteSignal, onBulkAddSignals, onBulkDeleteSignals, isAdmin }) {
  const [showAdd, setShowAdd] = useState(false);
  const [addMode, setAddMode] = useState("single"); // "single" | "bulk"
  const [addTitle, setAddTitle] = useState("");
  const [addUrl, setAddUrl] = useState("");
  const [addLoading, setAddLoading] = useState(false);
  const [bulkJson, setBulkJson] = useState("");
  const [bulkError, setBulkError] = useState("");
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const handleAdd = async () => {
    if (!addTitle.trim() || !addUrl.trim()) return;
    setAddLoading(true);
    try {
      await onAddSignal(addTitle.trim(), addUrl.trim(), panelId);
      setAddTitle(""); setAddUrl(""); setShowAdd(false);
    } catch (e) { console.error(e); }
    setAddLoading(false);
  };

  const handleBulkAdd = async () => {
    setBulkError("");
    let items;
    try {
      items = JSON.parse(bulkJson);
      if (!Array.isArray(items)) throw new Error("Must be a JSON array");
      if (!items.every(i => i.title && i.url)) throw new Error('Each item needs "title" and "url"');
    } catch (e) { setBulkError(e.message); return; }
    setAddLoading(true);
    try {
      await onBulkAddSignals(items, panelId);
      setBulkJson(""); setShowAdd(false);
    } catch (e) { setBulkError(e.message || "Failed"); }
    setAddLoading(false);
  };

  const toggleSelectMode = () => {
    setSelectMode(s => !s);
    setSelectedIds(new Set());
  };
  const toggleSignal = (id) => setSelectedIds(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  const selectAll = () => setSelectedIds(new Set(dbMapped.map(s => s.id)));
  const handleBulkDeleteSignals = async () => {
    if (!selectedIds.size) return;
    setBulkDeleting(true);
    try {
      await onBulkDeleteSignals([...selectedIds], panelId);
      setSelectedIds(new Set());
      setSelectMode(false);
    } catch (e) { console.error(e); }
    setBulkDeleting(false);
  };

  const dbMapped = useMemo(() => (dbSignals || []).map(s => {
    const src = detectSource(s.url);
    return { id: s.id, title: s.title, url: s.url, source: src.name, icon: src.icon, color: src.color, time: formatDate(s.created_at), submitter: s.added_by, fromDb: true };
  }), [dbSignals]);

  const combinedSignals = useMemo(() => {
    const remaining = Math.max(0, 15 - dbMapped.length);
    return [...dbMapped, ...signals.slice(0, remaining)];
  }, [dbMapped, signals]);

  const scrollRef = useRef(null);
  const wrapperRef = useRef(null);
  const edgeScrollRef = useRef(null);

  const startEdgeScroll = useCallback((direction) => {
    const scrollEl = scrollRef.current;
    const wrapperEl = wrapperRef.current;
    if (!scrollEl || !wrapperEl) return;

    // Pause the CSS animation
    scrollEl.style.animationPlayState = "paused";

    // Get current computed transform
    const computedStyle = window.getComputedStyle(scrollEl);
    const matrix = computedStyle.transform;
    let currentY = 0;
    if (matrix && matrix !== "none") {
      const values = matrix.match(/matrix.*\((.+)\)/);
      if (values) {
        const parts = values[1].split(", ");
        currentY = parseFloat(parts[5]) || 0;
      }
    }

    // Set explicit transform so we can modify it
    scrollEl.style.animation = "none";
    scrollEl.style.transform = `translateY(${currentY}px)`;

    const speed = 2; // pixels per frame
    const totalHeight = scrollEl.scrollHeight / 2; // because content is duplicated

    const scroll = () => {
      currentY += direction === "up" ? speed : -speed;
      // Wrap around
      if (currentY > 0) currentY = -totalHeight;
      if (currentY < -totalHeight) currentY = 0;
      scrollEl.style.transform = `translateY(${currentY}px)`;
      edgeScrollRef.current = requestAnimationFrame(scroll);
    };
    edgeScrollRef.current = requestAnimationFrame(scroll);
  }, []);

  const stopEdgeScroll = useCallback(() => {
    if (edgeScrollRef.current) {
      cancelAnimationFrame(edgeScrollRef.current);
      edgeScrollRef.current = null;
    }
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;

    // Get current position and restart CSS animation from there
    const computedStyle = window.getComputedStyle(scrollEl);
    const matrix = computedStyle.transform;
    let currentY = 0;
    if (matrix && matrix !== "none") {
      const values = matrix.match(/matrix.*\((.+)\)/);
      if (values) {
        const parts = values[1].split(", ");
        currentY = parseFloat(parts[5]) || 0;
      }
    }

    const totalHeight = scrollEl.scrollHeight / 2;
    const progress = Math.abs(currentY) / totalHeight;

    // Resume CSS animation from current position
    scrollEl.style.animation = "";
    scrollEl.style.transform = "";
    scrollEl.style.animationPlayState = "running";
    scrollEl.style.animationDelay = `-${progress * 60}s`;
  }, []);

  const panelClass = isOverlay
    ? `signal-panel signal-panel-${side} signal-panel-laptop-overlay ${isOverlay === "visible" ? "visible" : ""}`
    : `signal-panel signal-panel-${side}`;

  return (
    <div className={panelClass} style={{"--panel-accent": accentColor}}>
      {isOverlay && <div className="signal-panel-overlay-close" onClick={onClose}>✕</div>}
      <div className="signal-panel-header">
        <div className="signal-panel-dot" style={{background: accentColor}} />
        <span className="signal-panel-title">{title}</span>
        <span className="signal-panel-live"><span className="live-dot"/>LIVE</span>
        {isAdmin && dbMapped.length > 0 && (
          <button className="signal-add-btn" onClick={toggleSelectMode} title={selectMode?"Cancel select":"Select to delete"} style={{color: selectMode?"var(--accent-red)":accentColor, fontSize:13}}>
            {selectMode ? "✕" : "☑"}
          </button>
        )}
        {onAddSignal && !selectMode && <button className="signal-add-btn" onClick={()=>{setShowAdd(s=>!s);setAddMode("single");setBulkJson("");setBulkError("");}} title="Add signal" style={{color: accentColor}}>＋</button>}
      </div>
      {selectMode && (
        <div className="signal-select-bar">
          <span style={{fontSize:11,color:"var(--text-muted)",fontFamily:"'JetBrains Mono',monospace"}}>{selectedIds.size} of {dbMapped.length} selected</span>
          <button className="signal-select-all-btn" onClick={selectAll} style={{color:accentColor}}>All</button>
          {selectedIds.size > 0 && (
            <button className="bulk-delete-btn" onClick={handleBulkDeleteSignals} disabled={bulkDeleting} style={{marginLeft:"auto"}}>
              {bulkDeleting ? "…" : `⊗ Delete ${selectedIds.size}`}
            </button>
          )}
        </div>
      )}
      {!selectMode && showAdd && (
        <div className="signal-add-form">
          <div className="signal-add-tabs">
            <button className={`signal-add-tab ${addMode==="single"?"active":""}`} onClick={()=>setAddMode("single")} style={addMode==="single"?{color:accentColor,borderBottomColor:accentColor}:{}}>Single</button>
            <button className={`signal-add-tab ${addMode==="bulk"?"active":""}`} onClick={()=>setAddMode("bulk")} style={addMode==="bulk"?{color:accentColor,borderBottomColor:accentColor}:{}}>Bulk JSON</button>
          </div>
          {addMode==="single" ? (
            <>
              <input className="signal-add-input" placeholder="Title..." value={addTitle} onChange={e=>setAddTitle(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleAdd()}/>
              <input className="signal-add-input" placeholder="URL..." value={addUrl} onChange={e=>setAddUrl(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleAdd()}/>
              <button className="signal-add-submit" onClick={handleAdd} disabled={addLoading||!addTitle.trim()||!addUrl.trim()} style={{borderColor:accentColor,color:accentColor}}>{addLoading?"…":"Add"}</button>
            </>
          ) : (
            <>
              <div style={{fontSize:10,color:"var(--text-muted)",fontFamily:"'JetBrains Mono',monospace",marginBottom:4}}>Paste JSON array — max 15 items:</div>
              <div style={{fontSize:10,color:"var(--text-muted)",fontFamily:"'JetBrains Mono',monospace",marginBottom:6,opacity:0.7}}>[{`{"title":"...","url":"..."}`}, ...]</div>
              <textarea className="signal-add-input" rows={5} placeholder={'[\n  {"title": "Article title", "url": "https://..."}\n]'} value={bulkJson} onChange={e=>setBulkJson(e.target.value)} style={{resize:"vertical",lineHeight:1.5}}/>
              {bulkError && <div style={{fontSize:10,color:"var(--accent-red)",fontFamily:"'JetBrains Mono',monospace"}}>{bulkError}</div>}
              <button className="signal-add-submit" onClick={handleBulkAdd} disabled={addLoading||!bulkJson.trim()} style={{borderColor:accentColor,color:accentColor}}>{addLoading?"…":"Import"}</button>
            </>
          )}
        </div>
      )}
      <div className="signal-panel-scroll-wrapper" ref={wrapperRef}>
        <div className="signal-edge-zone signal-edge-zone-top"
          onMouseEnter={() => startEdgeScroll("up")}
          onMouseLeave={stopEdgeScroll}>
          <span className="signal-edge-arrow">▲</span>
        </div>
        <div className="signal-panel-scroll" ref={scrollRef} style={selectMode?{animationPlayState:"paused"}:{}}>
          {(selectMode ? dbMapped : [...combinedSignals, ...combinedSignals]).map((sig, i) => {
            const isSelected = selectedIds.has(sig.id);
            return selectMode ? (
              <div key={sig.id} className={`signal-item signal-item-selectable ${isSelected?"signal-item-selected":""}`}
                onClick={()=>toggleSignal(sig.id)}
                style={isSelected?{background:`rgba(${accentColor==="#06d6e0"?"6,214,224":"16,185,129"},0.08)`,boxShadow:`inset 3px 0 0 ${accentColor}`}:{}}>
                <input type="checkbox" className="bulk-checkbox" checked={isSelected} onChange={()=>{}} style={{flexShrink:0,marginTop:2}}/>
                <div className="signal-item-icon" style={{background: sig.color}}>{sig.icon}</div>
                <div className="signal-item-body">
                  <div className="signal-item-title">{sig.title}</div>
                  <div className="signal-item-meta"><span style={{color:sig.color}}>{sig.source}</span></div>
                </div>
              </div>
            ) : (
              <div key={i} className="signal-item" onClick={()=>window.open(sig.url,'_blank','noopener,noreferrer')} style={{cursor:"pointer"}}>
                <div className="signal-item-icon" style={{background: sig.color}}>{sig.icon}</div>
                <div className="signal-item-body">
                  <div className="signal-item-title">{sig.title}</div>
                  <div className="signal-item-meta">
                    <span style={{color: sig.color}}>{sig.source}</span>
                    {sig.submitter && <span style={{color: "var(--text-secondary)"}}>⋅ {sig.submitter}</span>}
                    <span className="signal-item-time">{sig.time}</span>
                  </div>
                </div>
                {sig.fromDb && onDeleteSignal && i < combinedSignals.length && (
                  <button className="signal-delete-btn" onClick={e=>{e.stopPropagation();onDeleteSignal(sig.id);}} title="Remove">×</button>
                )}
              </div>
            );
          })}
        </div>
        <div className="signal-edge-zone signal-edge-zone-bottom"
          onMouseEnter={() => startEdgeScroll("down")}
          onMouseLeave={stopEdgeScroll}>
          <span className="signal-edge-arrow">▼</span>
        </div>
      </div>
    </div>
  );
}

// ─── DASHBOARD ──────────────────────────────────────────────────────
function Dashboard({ insights, onSelect, onNavigateFiltered }) {
  const total = insights.length;
  const thisMonth = insights.filter(i => new Date(i.created_at) > new Date(Date.now() - 30*86400000)).length;
  const highImpact = insights.filter(i => i.impact === "High").length;
  const needsReview = insights.filter(i => i.needs_review).length;
  const catCounts = CATEGORIES.map(c => ({name:c,count:insights.filter(i=>i.category===c).length}));
  const recentHigh = insights.filter(i => i.impact==="High"&&!i.needs_review).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).slice(0,4);
  const recent = [...insights].filter(i=>!i.needs_review).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).slice(0,5);

  return (
    <div>
      <div className="metrics-row fade-in">
        <div className="metric-card" onClick={()=>onNavigateFiltered({})}><div className="metric-value">{total}</div><div className="metric-label">Total Insights</div><div className="metric-card-hint">Click to view all →</div></div>
        <div className="metric-card" onClick={()=>onNavigateFiltered({status:"Reviewed"})}><div className="metric-value">{thisMonth}</div><div className="metric-label">This Month</div><div className="metric-card-hint">Click to view reviewed →</div></div>
        <div className="metric-card" onClick={()=>onNavigateFiltered({impact:"High"})}><div className="metric-value">{highImpact}</div><div className="metric-label">High Impact</div><div className="metric-card-hint">Click to filter by High →</div></div>
        {needsReview>0&&<div className="metric-card alert-card" onClick={()=>onNavigateFiltered({status:"Needs Review"})}><div className="metric-value alert-value">{needsReview}</div><div className="metric-label">Needs Review</div><div className="metric-card-hint">Click to view pending →</div></div>}
      </div>
      <div className="two-col">
        <div className="fade-in fade-in-d1">
          <div className="section-title">Recent Intelligence</div>
          {recent.map(ins=>(
            <div key={ins.id} className="insight-card" onClick={()=>onSelect(ins)}>
              <div className="insight-card-title">{ins.title}</div>
              {ins.summary&&<div className="insight-card-desc">{truncate(ins.summary)}</div>}
              <div className="insight-card-meta">
                <span className="badge badge-category">{CATEGORY_ICONS[ins.category]} {ins.category}</span>
                {ins.urls.slice(0,2).map((u,i)=><SourceBadge key={i} url={u} small/>)}
                {ins.urls.length>2&&<span className="badge-date">+{ins.urls.length-2}</span>}
                {ins.impact==="High"&&<span className="badge badge-impact-High">High</span>}
                <span className="badge-date">{formatDate(ins.created_at)}</span>
              </div>
            </div>
          ))}
          <div style={{marginTop:20}}>
            <div className="section-title"><span className="pulse-dot" style={{marginRight:4}}/> High Impact</div>
            {recentHigh.map(ins=>(
              <div key={ins.id} className="insight-card" onClick={()=>onSelect(ins)} style={{borderLeft:"3px solid #ff4d6a"}}>
                <div className="insight-card-title" style={{fontSize:13}}>{ins.title}</div>
                <div className="insight-card-meta"><span className="badge badge-category">{ins.category}</span><SourceBadge url={ins.urls[0]} small/><span className="badge-date">{formatDate(ins.created_at)}</span></div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="fade-in fade-in-d2">
            <div className="section-title">Category Distribution</div>
            <div className="detail-section" style={{marginBottom:20}}><PieChart data={catCounts} onClickSegment={(cat)=>onNavigateFiltered({category:cat})}/></div>
          </div>
          <div className="fade-in fade-in-d3">
            <div className="section-title">Source Activity</div>
            <div className="detail-section" style={{marginBottom:20, padding:0}}>
              <SourceActivityMonitor insights={insights} onClickSource={(srcName) => {
                onNavigateFiltered({ source: srcName });
              }} />
            </div>
          </div>
          <div className="fade-in fade-in-d4">
            <div className="section-title">Intelligence Pulse</div>
            <div className="detail-section" style={{marginBottom:20, padding:0}}>
              <ActivityHeatmap insights={insights} onClickDay={(dayInsights) => {
                if (dayInsights.length > 0) onNavigateFiltered({ dayInsights });
              }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── ADD INSIGHT ────────────────────────────────────────────────────
function AddInsight({ onAdd }) {
  const [urls,setUrls]=useState([""]);const[title,setTitle]=useState("");const[description,setDescription]=useState("");
  const [category,setCategory]=useState("Other");const[isHighImpact,setIsHighImpact]=useState(false);const[tags,setTags]=useState("");
  const [showOpt,setShowOpt]=useState(false);const[toast,setToast]=useState(false);const[toastMsg,setToastMsg]=useState("");
  const [autoReview,setAutoReview]=useState(true);const[isSubmitting,setIsSubmitting]=useState(false);
  const addUrl=()=>setUrls(u=>[...u,""]);const removeUrl=i=>setUrls(u=>u.filter((_,j)=>j!==i));
  const updateUrl=(i,v)=>setUrls(u=>u.map((x,j)=>j===i?v:x));const validUrls=urls.filter(u=>u.trim());
  const handleSubmit=async()=>{
    if(validUrls.length===0&&!title.trim())return;
    if(isSubmitting)return;
    setIsSubmitting(true);
    try {
      const result = await api.submitInsight({
        title:title.trim()||validUrls[0]||"Untitled",
        urls:validUrls,
        category,
        impact:isHighImpact?"High":"Other",
        tags:tags.trim(),
        description:description.trim(),
        entry_type:"intelligence",
        autoReview
      });
      onAdd(result.insight);
      setUrls([""]);setTitle("");setDescription("");setCategory("Other");setIsHighImpact(false);setTags("");setShowOpt(false);
      let msg="✓ Submitted! Will be reviewed and published.";
      if(autoReview&&result.autoReviewed)msg="✓ Auto-reviewed and published by AI!";
      else if(autoReview&&!result.autoReviewed&&validUrls.length>0)msg="✓ Submitted! AI couldn't fully extract content — sent to manual review.";
      setToastMsg(msg);setToast(true);setTimeout(()=>setToast(false),4000);
    } catch (err) { console.error('Submit failed:', err); }
    finally { setIsSubmitting(false); }
  };
  return (
    <div className="fade-in">
      <div className="detail-section">
        <div className="form-group">
          <label className="form-label">URLs</label>
          {urls.map((u,i)=>(<div key={i} style={{marginBottom:8}}>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              <input className="form-input" style={{flex:1}} placeholder={i===0?"Paste any link — blog, video, tweet, paper...":"Another related URL..."} value={u} onChange={e=>updateUrl(i,e.target.value)}/>
              {urls.length>1&&<span className="source-tag-remove" onClick={()=>removeUrl(i)} style={{fontSize:18,padding:"0 4px",cursor:"pointer"}}>×</span>}
            </div>
            {u.trim()&&<div className="source-tag"><div className="source-tag-icon" style={{background:detectSource(u).color}}>{detectSource(u).icon}</div><span style={{color:"var(--text-secondary)"}}>{detectSource(u).name}</span>{!detectSource(u).scrapeable&&<span className="source-tag-warn">⚠ manual review</span>}</div>}
          </div>))}
          <div className="add-url-btn" onClick={addUrl}>＋ Add another URL</div>
        </div>
        <div className="form-group"><label className="form-label">Title <span className="opt">— optional</span></label><input className="form-input" placeholder="Give it a quick name" value={title} onChange={e=>setTitle(e.target.value)}/></div>
        <div className="form-group"><label className="form-label">Your Notes <span className="opt">— optional</span></label><textarea className="form-textarea" placeholder="Why did this catch your eye? Any context..." value={description} onChange={e=>setDescription(e.target.value)}/></div>
        <div className="collapsible-header" onClick={()=>setShowOpt(!showOpt)}><span className="collapsible-arrow" style={{transform:showOpt?"rotate(90deg)":"rotate(0deg)"}}>▶</span><span>Additional details</span><span className="opt" style={{marginLeft:4}}>— category, tags (optional)</span></div>
        {showOpt&&<div style={{paddingTop:8}}>
          <div className="form-group"><label className="form-label">Category <span className="opt">— optional</span></label><select className="form-select" value={category} onChange={e=>setCategory(e.target.value)}>{CATEGORIES.map(c=><option key={c}>{c}</option>)}</select></div>
          <div className="form-group"><label className="form-label">Tags <span className="opt">— comma-separated</span></label><input className="form-input" placeholder="AI, agents, multimodal..." value={tags} onChange={e=>setTags(e.target.value)}/></div>
        </div>}
        <div className="form-group" style={{marginTop:8}}>
          <div className="toggle-row" onClick={()=>setIsHighImpact(!isHighImpact)}>
            <div className={`toggle-box ${isHighImpact?"checked":""}`} style={isHighImpact?{borderColor:"#ff4d6a",background:"#ff4d6a"}:{}}>{isHighImpact?"✓":""}</div>
            <span>🔴 Mark as <strong style={{color:"#ff4d6a"}}>High Impact</strong> <span style={{color:"var(--text-muted)",fontSize:12}}>— only for significant developments</span></span>
          </div>
        </div>
        <div className="form-group" style={{marginTop:8}}>
          <div className="toggle-row" onClick={()=>setAutoReview(!autoReview)}>
            <div className={`toggle-box ${autoReview?"checked":""}`} style={autoReview?{borderColor:"var(--accent-cyan)",background:"var(--accent-cyan)"}:{}}>{autoReview?"✓":""}</div>
            <span>🤖 <strong style={{color:"var(--accent-cyan)"}}>Auto-Review with AI</strong> <span style={{color:"var(--text-muted)",fontSize:12}}>— AI will extract content and generate a review. Turn off for manual review queue.</span></span>
          </div>
        </div>
        <button className="btn btn-primary" onClick={handleSubmit} disabled={isSubmitting||(validUrls.length===0&&!title.trim())}>
          {isSubmitting?<><span className="spinner"/> {autoReview?"Submitting & reviewing...":"Submitting..."}</>:"📋 Submit Intelligence"}
        </button>
      </div>
      {toast&&<div className="toast">{toastMsg}</div>}
    </div>
  );
}

// ─── TABLE ──────────────────────────────────────────────────────────
function InsightsTable({ insights, onSelect, initialFilters, isAdmin, onBulkDelete }) {
  const [search,setSearch]=useState("");const[catF,setCatF]=useState(initialFilters?.category||"All");
  const [impF,setImpF]=useState(initialFilters?.impact||"All");const[statF,setStatF]=useState(initialFilters?.status||"All");
  const [typeF,setTypeF]=useState(initialFilters?.entry_type||"All");
  const [sourceF,setSourceF]=useState(initialFilters?.source||"All");
  const [dayInsightsF,setDayInsightsF]=useState(initialFilters?.dayInsights||null);
  const [selectedIds,setSelectedIds]=useState(new Set());
  const [deleting,setDeleting]=useState(false);
  useEffect(()=>{setCatF(initialFilters?.category||"All");setImpF(initialFilters?.impact||"All");setStatF(initialFilters?.status||"All");setTypeF(initialFilters?.entry_type||"All");setSourceF(initialFilters?.source||"All");setDayInsightsF(initialFilters?.dayInsights||null);setSearch("");setSelectedIds(new Set())},[initialFilters]);
  const hasActiveFilter=catF!=="All"||impF!=="All"||statF!=="All"||typeF!=="All"||sourceF!=="All"||dayInsightsF!==null;
  const clearFilters=()=>{setCatF("All");setImpF("All");setStatF("All");setTypeF("All");setSourceF("All");setDayInsightsF(null);setSearch("")};
  const filtered=useMemo(()=>{
    const dayIds=dayInsightsF?new Set(dayInsightsF.map(d=>d.id)):null;
    return insights.filter(i=>catF==="All"||i.category===catF).filter(i=>impF==="All"||i.impact===impF).filter(i=>statF==="All"||(statF==="Needs Review"?i.needs_review:!i.needs_review)).filter(i=>typeF==="All"||(i.entry_type||"intelligence")===typeF).filter(i=>sourceF==="All"||i.urls.some(u=>detectSource(u).name===sourceF)).filter(i=>!dayIds||dayIds.has(i.id)).filter(i=>!search||i.title.toLowerCase().includes(search.toLowerCase())||(i.tags||"").toLowerCase().includes(search.toLowerCase())||i.urls.some(u=>u.toLowerCase().includes(search.toLowerCase()))).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
  },[insights,search,catF,impF,statF,typeF,sourceF,dayInsightsF]);

  const allFilteredSelected = filtered.length > 0 && filtered.every(i => selectedIds.has(i.id));
  const toggleAll = () => {
    if (allFilteredSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map(i => i.id)));
  };
  const toggleOne = (id, e) => {
    e.stopPropagation();
    setSelectedIds(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  };
  const handleBulkDelete = async () => {
    if (!selectedIds.size) return;
    setDeleting(true);
    try { await onBulkDelete([...selectedIds]); setSelectedIds(new Set()); }
    catch (e) { console.error(e); }
    setDeleting(false);
  };

  return (
    <div className="fade-in">
      {isAdmin && selectedIds.size > 0 && (
        <div className="bulk-action-bar">
          <span style={{color:"var(--text-secondary)",fontFamily:"'JetBrains Mono',monospace",fontSize:12}}>{selectedIds.size} selected</span>
          <button className="bulk-delete-btn" onClick={handleBulkDelete} disabled={deleting}>
            {deleting ? "Deleting…" : `⊗ Delete ${selectedIds.size}`}
          </button>
          <button className="bulk-cancel-btn" onClick={()=>setSelectedIds(new Set())}>✕ Clear</button>
        </div>
      )}
      {hasActiveFilter&&<div className="active-filter-bar"><span>Filtered by:</span>{catF!=="All"&&<span className="badge badge-category">{CATEGORY_ICONS[catF]} {catF}</span>}{impF!=="All"&&<span className={`badge badge-impact-${impF}`}>{impF} Impact</span>}{statF!=="All"&&<span className={statF==="Needs Review"?"badge badge-review":"badge badge-reviewed"}>{statF}</span>}{typeF!=="All"&&<span className={`badge badge-entry-type badge-entry-${typeF}`}>{ENTRY_TYPES.find(e=>e.id===typeF)?.label||typeF}</span>}{sourceF!=="All"&&<span className="badge badge-category" style={{background:"rgba(139,92,246,0.12)",color:"var(--accent-purple)",borderColor:"rgba(139,92,246,0.2)"}}>Source: {sourceF}</span>}{dayInsightsF&&<span className="badge badge-category" style={{background:"rgba(6,214,224,0.1)",color:"var(--accent-cyan)",borderColor:"rgba(6,214,224,0.2)"}}>Day: {dayInsightsF.length} insight{dayInsightsF.length!==1?"s":""}</span>}<span className="clear-btn" onClick={clearFilters}>✕ Clear filters</span></div>}
      <div className="filters-bar">
        <input className="filter-input" placeholder="Search title, tags, URL..." value={search} onChange={e=>setSearch(e.target.value)}/>
        <select className="filter-select" value={catF} onChange={e=>setCatF(e.target.value)}><option value="All">All Categories</option>{CATEGORIES.map(c=><option key={c}>{c}</option>)}</select>
        <select className="filter-select" value={impF} onChange={e=>setImpF(e.target.value)}><option value="All">All Impacts</option><option value="High">High</option></select>
        <select className="filter-select" value={statF} onChange={e=>setStatF(e.target.value)}><option value="All">All Status</option><option>Needs Review</option><option>Reviewed</option></select>
        <select className="filter-select" value={typeF} onChange={e=>setTypeF(e.target.value)}><option value="All">All Types</option>{ENTRY_TYPES.map(et=><option key={et.id} value={et.id}>{et.label}</option>)}</select>
        <span style={{marginLeft:"auto",fontSize:12,color:"var(--text-muted)",fontFamily:"'JetBrains Mono',monospace"}}>{filtered.length} result{filtered.length!==1?"s":""}</span>
      </div>
      {filtered.length===0?<div className="empty-state"><div className="empty-state-icon">◇</div><div className="empty-state-text">No insights match your filters</div></div>:
      <div className="table-wrapper"><table>
        <thead><tr>
          {isAdmin&&<th style={{width:32,padding:"8px 6px"}}><input type="checkbox" className="bulk-checkbox" checked={allFilteredSelected} onChange={toggleAll} onClick={e=>e.stopPropagation()}/></th>}
          <th>Title</th><th>Sources</th><th>Type</th><th>Category</th><th>Impact</th><th>Status</th><th>Date</th><th>By</th>
        </tr></thead>
        <tbody>{filtered.map(ins=>{const et=ENTRY_TYPES.find(e=>e.id===(ins.entry_type||"intelligence"))||ENTRY_TYPES[0];const checked=selectedIds.has(ins.id);return(<tr key={ins.id} onClick={()=>onSelect(ins)} className={checked?"row-selected":""}>
          {isAdmin&&<td style={{padding:"8px 6px"}} onClick={e=>toggleOne(ins.id,e)}><input type="checkbox" className="bulk-checkbox" checked={checked} onChange={()=>{}}/></td>}
          <td style={{fontWeight:500}}>{ins.title}</td>
          <td><div style={{display:"flex",gap:4,flexDirection:"column"}}>{ins.urls.slice(0,2).map((u,i)=><SourceBadge key={i} url={u} small/>)}{ins.urls.length>2&&<span style={{fontSize:10,color:"var(--text-muted)"}}>+{ins.urls.length-2}</span>}</div></td>
          <td><span className={`badge badge-entry-type badge-entry-${et.id}`}>{et.icon} {et.label}</span></td>
          <td><span className="badge badge-category">{CATEGORY_ICONS[ins.category]} {ins.category}</span></td>
          <td><span className={`badge badge-impact-${ins.impact}`}>{ins.impact}</span></td>
          <td>{ins.needs_review?<span className="badge badge-review">⚠ Review</span>:<span className="badge badge-reviewed">✓ Done</span>}</td>
          <td style={{color:"var(--text-muted)",fontSize:12,fontFamily:"'JetBrains Mono',monospace",whiteSpace:"nowrap"}}>{formatDate(ins.created_at)}</td>
          <td style={{color:"var(--text-secondary)",fontSize:12}}>{ins.submitted_by}</td>
        </tr>)})}</tbody>
      </table></div>}
    </div>
  );
}

// ─── DETAIL ─────────────────────────────────────────────────────────
function InsightDetail({ insight, onBack, onUpdate, onDelete, isAdmin }) {
  const [useAI, setUseAI] = useState(true);
  const [adminDesc, setAdminDesc] = useState("");
  const [reviewerName, setReviewerName] = useState("");
  const [reviewerError, setReviewerError] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [editTitle, setEditTitle] = useState(insight.title);
  const [editCat, setEditCat] = useState(insight.category);
  const [editHighImpact, setEditHighImpact] = useState(insight.impact === "High");
  const [editTags, setEditTags] = useState(insight.tags);
  const [descExpanded, setDescExpanded] = useState(false);
  const [reviewerNoteExpanded, setReviewerNoteExpanded] = useState(false);
  const [editDescription, setEditDescription] = useState(insight.description || "");
  const [editReviewerNotes, setEditReviewerNotes] = useState(insight.reviewer_notes || "");
  const [editOpen, setEditOpen] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editToast, setEditToast] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [autoReviewing, setAutoReviewing] = useState(false);
  const [autoReviewError, setAutoReviewError] = useState("");
  const points = (insight.key_points || "").split(";").filter(Boolean);

  useEffect(() => {
    setEditTitle(insight.title); setEditCat(insight.category); setEditHighImpact(insight.impact === "High");
    setEditTags(insight.tags); setReviewerName(""); setAdminDesc(""); setReviewerError(false);
    setDescExpanded(false); setReviewerNoteExpanded(false); setEditDescription(insight.description || ""); setEditReviewerNotes(insight.reviewer_notes || ""); setEditOpen(false);
  }, [insight.id]);

  const handleReview = async () => {
    if (!reviewerName.trim()) { setReviewerError(true); return; }
    if (!adminDesc.trim()) return;
    setReviewerError(false);
    setReviewing(true);

    let finalTitle = editTitle;
    let finalCat = editCat;
    let finalImp = editHighImpact ? "High" : "Other";
    let summary = adminDesc;
    let keyPoints = "Reviewed";

    if (useAI) {
      const r = await summarizeForAdmin(editTitle, adminDesc, editCat, insight.urls, insight.description);
      if (r) {
        summary = r.summary || adminDesc;
        keyPoints = Array.isArray(r.key_points) ? r.key_points.join(";") : "Reviewed";
        if (r.suggested_title && finalTitle === insight.urls[0]) finalTitle = r.suggested_title;
        if (r.suggested_category && finalCat === "Other") finalCat = r.suggested_category;
        if (r.suggested_impact && finalImp === "Other") finalImp = r.suggested_impact;
      } else {
        console.warn("⚠ AI summarization failed, publishing raw text.");
      }
    }

    setEditTitle(finalTitle); setEditCat(finalCat); setEditHighImpact(finalImp === "High");

    onUpdate({
      ...insight, title: finalTitle, category: finalCat, impact: finalImp,
      tags: editTags, needs_review: false, summary, key_points: keyPoints,
      reviewed_by: reviewerName.trim(), reviewer_notes: adminDesc
    });
    setReviewing(false);
    setAdminDesc("");
  };

  const handleSaveEdit = async () => {
    setEditSaving(true);
    await onUpdate({
      ...insight,
      title: editTitle,
      category: editCat,
      impact: editHighImpact ? "High" : "Other",
      tags: editTags,
      description: editDescription,
      reviewer_notes: editReviewerNotes,
    });
    setEditSaving(false);
    setEditToast(true);
    setTimeout(() => setEditToast(false), 2500);
  };

  const handleAutoReview = async () => {
    setAutoReviewing(true);
    setAutoReviewError("");
    try {
      const updated = await api.autoReviewInsight(insight.id);
      onUpdate(updated);
    } catch (err) {
      setAutoReviewError(err.message || "Auto-review failed");
    } finally {
      setAutoReviewing(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await onDelete(insight.id);
    } catch (err) {
      console.error('Delete failed:', err);
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  const DESC_LIMIT = 160;
  const descLong = !!(insight.description && insight.description.length > DESC_LIMIT);
  const rnLong = !!(insight.reviewer_notes && insight.reviewer_notes.length > DESC_LIMIT);

  return (
    <div className="fade-in">
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
        <div className="detail-back" style={{margin:0}} onClick={onBack}>← Back</div>
        {isAdmin && !confirmDelete && (
          <button className="btn btn-sm" style={{background:"rgba(239,68,68,0.1)",color:"var(--accent-red)",border:"1px solid rgba(239,68,68,0.25)"}} onClick={()=>setConfirmDelete(true)}>
            ✕ Delete
          </button>
        )}
        {isAdmin && confirmDelete && (
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:12,color:"var(--text-muted)"}}>Are you sure?</span>
            <button className="btn btn-sm" style={{background:"var(--accent-red)",color:"#fff"}} onClick={handleDelete} disabled={deleting}>
              {deleting ? <><span className="spinner"/> Deleting...</> : "Yes, delete"}
            </button>
            <button className="btn btn-sm" style={{background:"rgba(255,255,255,0.06)",color:"var(--text-secondary)",border:"1px solid var(--border)"}} onClick={()=>setConfirmDelete(false)}>
              Cancel
            </button>
          </div>
        )}
      </div>
      {insight.needs_review && <div className="review-banner"><div className="review-banner-text">⚠ This insight needs review</div><div className="review-banner-sub">Visit the URLs, review the content, then fill out the review panel below.</div></div>}
      <h2 style={{fontSize:22,fontWeight:700,marginBottom:8}}>{insight.title}</h2>
      <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:24}}>
        <span className="badge badge-category">{CATEGORY_ICONS[insight.category]} {insight.category}</span>
        {insight.urls.slice(0,3).map((u,i)=><SourceBadge key={i} url={u}/>)}
        {insight.urls.length>3&&<span className="badge-date">+{insight.urls.length-3}</span>}
        <span className={`badge badge-impact-${insight.impact}`}>{insight.impact}</span>
        {insight.needs_review?<span className="badge badge-review">⚠ Pending</span>:<span className="badge badge-reviewed">✓ Reviewed</span>}
        <span className="badge-date">{formatDate(insight.created_at)} · submitted by {insight.submitted_by}</span>
      </div>

      <div className="detail-section">
        <h3>Sources ({insight.urls.length})</h3>
        {insight.urls.map((u,i)=>(<div key={i} style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",marginBottom:i<insight.urls.length-1?10:0}}>
          <SourceBadge url={u} small/><a href={u} target="_blank" rel="noopener noreferrer" className="detail-url">{u}</a>
        </div>))}
      </div>

      {/* Submitter's Notes — structured with View more */}
      {insight.description && (
        <div className="detail-section">
          <h3>Submitter's Notes</h3>
          <div className="submitter-note-box">
            <div className="submitter-note-meta">
              <span className="submitter-note-author">◎ {insight.submitted_by}</span>
              <span className="submitter-note-date">{formatDate(insight.created_at)}</span>
            </div>
            <p className="submitter-note-text">
              {descExpanded || !descLong ? insight.description : insight.description.slice(0, DESC_LIMIT) + "…"}
            </p>
            {descLong && (
              <span className="view-more-link" onClick={() => setDescExpanded(e => !e)}>
                {descExpanded ? "↑ View less" : "↓ View more"}
              </span>
            )}
          </div>
        </div>
      )}

      {!insight.needs_review && insight.reviewed_by && (
        <div style={{fontSize:12,color:"var(--text-muted)",marginBottom:insight.reviewer_notes?8:16,display:"flex",alignItems:"center",gap:6}}>
          <span className="badge badge-reviewed" style={{fontSize:10}}>✓</span> Reviewed by <strong style={{color:"var(--text-secondary)"}}>{insight.reviewed_by}</strong>
        </div>
      )}

      {/* Reviewer's Note */}
      {!insight.needs_review && insight.reviewer_notes ? (
        <div className="detail-section" style={{marginBottom:16}}>
          <h3>Reviewer's Notes</h3>
          <div className="submitter-note-box" style={{background:"rgba(16,185,129,0.04)",borderColor:"rgba(16,185,129,0.18)"}}>
            <div className="submitter-note-meta">
              <span className="submitter-note-author" style={{color:"var(--accent-green)"}}>✓ {insight.reviewed_by}</span>
              <span className="submitter-note-date">Reviewer's analysis</span>
            </div>
            <p className="submitter-note-text">
              {reviewerNoteExpanded || !rnLong
                ? insight.reviewer_notes
                : insight.reviewer_notes.slice(0, DESC_LIMIT) + "…"}
            </p>
            {rnLong && (
              <span className="view-more-link" onClick={() => setReviewerNoteExpanded(e => !e)}>
                {reviewerNoteExpanded ? "↑ View less" : "↓ View more"}
              </span>
            )}
          </div>
        </div>
      ) : null}

      {/* Review Panel — pending only */}
      {insight.needs_review && (
        <div className="admin-form">
          <div className="admin-form-title">🔍 Review Panel</div>
          <div style={{marginBottom:16,display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
            <button className="btn btn-primary btn-sm" onClick={handleAutoReview} disabled={autoReviewing}>
              {autoReviewing?<><span className="spinner"/> Auto-reviewing...</>:"🤖 Auto-Review with AI"}
            </button>
            <span style={{fontSize:12,color:"var(--text-muted)"}}>— or fill in the form below to review manually</span>
          </div>
          {autoReviewError&&<div style={{fontSize:12,color:"var(--accent-red)",marginBottom:12,padding:"8px 12px",background:"rgba(239,68,68,0.08)",borderRadius:8,border:"1px solid rgba(239,68,68,0.2)"}}>{autoReviewError}</div>}
          {insight.description && (
            <div style={{marginBottom:16,padding:"12px 16px",background:"rgba(139,92,246,0.06)",border:"1px solid rgba(139,92,246,0.15)",borderRadius:8}}>
              <div style={{fontSize:11,color:"var(--accent-purple)",fontWeight:600,marginBottom:4,textTransform:"uppercase",letterSpacing:1}}>Submitter's Notes</div>
              <p style={{fontSize:13,color:"var(--text-secondary)",lineHeight:1.5,fontStyle:"italic"}}>"{insight.description}"</p>
            </div>
          )}
          <div className="form-group">
            <label className="form-label">Your Name <span className="req">*</span></label>
            <input className={`form-input ${reviewerError?"error":""}`} placeholder="Who is reviewing this?" value={reviewerName} onChange={e=>{setReviewerName(e.target.value);setReviewerError(false)}}/>
            {reviewerError&&<div className="form-error">Reviewer name is required</div>}
          </div>
          <div className="form-group"><label className="form-label">Title</label><input className="form-input" value={editTitle} onChange={e=>setEditTitle(e.target.value)}/></div>
          <div className="form-group"><label className="form-label">Category</label><select className="form-select" value={editCat} onChange={e=>setEditCat(e.target.value)}>{CATEGORIES.map(c=><option key={c}>{c}</option>)}</select></div>
          <div className="form-group" style={{marginTop:8}}>
            <div className="toggle-row" onClick={()=>setEditHighImpact(!editHighImpact)}>
              <div className={`toggle-box ${editHighImpact?"checked":""}`} style={editHighImpact?{borderColor:"#ff4d6a",background:"#ff4d6a"}:{}}>{editHighImpact?"✓":""}</div>
              <span>🔴 <strong style={{color:"#ff4d6a"}}>High Impact</strong></span>
            </div>
          </div>
          <div className="form-group"><label className="form-label">Tags <span className="opt">— comma-separated</span></label><input className="form-input" value={editTags} onChange={e=>setEditTags(e.target.value)} placeholder="AI, agents..."/></div>
          <div className="form-group">
            <label className="form-label">Reviewer's Notes <span className="req">*</span></label>
            <textarea className="form-textarea" style={{minHeight:120}} placeholder="Describe the actual content — what the technology does, what was announced, key findings..." value={adminDesc} onChange={e=>setAdminDesc(e.target.value)}/>
            <div className="form-hint">Your notes feed the AI summary. They are stored as the reviewer's analysis, not as the submitter's notes.</div>
          </div>
          <div style={{marginBottom:16}}>
            <div className="toggle-row" onClick={()=>setUseAI(!useAI)}>
              <div className={`toggle-box ${useAI?"checked":""}`}>{useAI?"✓":""}</div>
              <span>Use AI to summarize <span style={{color:"var(--text-muted)",fontSize:12}}>(turn off to publish your text directly)</span></span>
            </div>
          </div>
          <button className="btn btn-success" onClick={handleReview} disabled={reviewing||!adminDesc.trim()}>
            {reviewing?<><span className="spinner"/> {useAI?"Generating summary...":"Publishing..."}</>:"✓ Review & Publish"}
          </button>
        </div>
      )}

      {insight.summary&&<div className="detail-section"><h3>Summary</h3><p>{insight.summary}</p></div>}
      {points.length>0&&points[0]&&<div className="detail-section"><h3>Key Points</h3>{points.map((pt,i)=><div key={i} className="key-point-item"><span className="key-point-bullet">●</span><span>{pt.trim()}</span></div>)}</div>}
      {(insight.tags||"").split(",").filter(Boolean).length>0&&<div className="detail-section"><h3>Tags</h3><div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{insight.tags.split(",").map((t,i)=><span key={i} className="badge badge-tag">{t.trim()}</span>)}</div></div>}

      {/* Edit Details — always available after review */}
      <div className="detail-section" style={{marginTop:12}}>
        <div className="collapsible-header" onClick={()=>setEditOpen(o=>!o)}>
          <span className="collapsible-arrow" style={{transform:editOpen?"rotate(90deg)":"rotate(0deg)"}}>▶</span>
          <span style={{fontWeight:600}}>Edit Details</span>
          <span style={{marginLeft:4,fontSize:12,color:"var(--text-muted)"}}>— update title, category, tags</span>
        </div>
        {editOpen && (
          <div style={{paddingTop:12}}>
            <div className="form-row" style={{marginBottom:16}}>
              <div className="form-group" style={{margin:0}}>
                <label className="form-label">Title</label>
                <input className="form-input" value={editTitle} onChange={e=>setEditTitle(e.target.value)}/>
              </div>
              <div className="form-group" style={{margin:0}}>
                <label className="form-label">Category</label>
                <select className="form-select" value={editCat} onChange={e=>setEditCat(e.target.value)}>{CATEGORIES.map(c=><option key={c}>{c}</option>)}</select>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Tags <span className="opt">— comma-separated</span></label>
              <input className="form-input" value={editTags} onChange={e=>setEditTags(e.target.value)} placeholder="AI, agents, multimodal..."/>
            </div>
            <div className="form-group">
              <label className="form-label">Submitter's Notes <span className="opt">— original context</span></label>
              <textarea className="form-textarea" style={{minHeight:80}} value={editDescription} onChange={e=>setEditDescription(e.target.value)} placeholder="Submitter's original notes or context..."/>
            </div>
            {!insight.needs_review && (
              <div className="form-group">
                <label className="form-label">Reviewer's Notes <span className="opt">— analyst observations</span></label>
                <textarea className="form-textarea" style={{minHeight:80}} value={editReviewerNotes} onChange={e=>setEditReviewerNotes(e.target.value)} placeholder="What did the reviewer observe about this insight?"/>
              </div>
            )}
            <div className="form-group">
              <div className="toggle-row" onClick={()=>setEditHighImpact(h=>!h)}>
                <div className={`toggle-box ${editHighImpact?"checked":""}`} style={editHighImpact?{borderColor:"#ff4d6a",background:"#ff4d6a"}:{}}>{editHighImpact?"✓":""}</div>
                <span>🔴 <strong style={{color:"#ff4d6a"}}>High Impact</strong></span>
              </div>
            </div>
            <button className="btn btn-primary btn-sm" onClick={handleSaveEdit} disabled={editSaving}>
              {editSaving?<><span className="spinner"/> Saving...</>:"Save Changes"}
            </button>
          </div>
        )}
      </div>

      {editToast&&<div className="toast">✓ Changes saved!</div>}
    </div>
  );
}

// ─── REPORT ─────────────────────────────────────────────────────────
function ReportGen({ insights }) {
  const [report, setReport] = useState("");
  const [loading, setLoading] = useState(false);
  const reviewed = insights.filter(i => !i.needs_review && i.summary);
  const highRecent = reviewed.filter(i => i.impact === "High" && new Date(i.created_at) > new Date(Date.now() - 30*86400000));
  const pending = insights.filter(i => i.needs_review).length;
  const go = async () => {
    setLoading(true);
    try {
      const text = await api.generateReport();
      setReport(text);
    } catch (err) { setReport("❌ " + err.message); }
    setLoading(false);
  };
  const inlineFormat = (text, key) => {
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return <span key={key}>{parts.map((p, j) =>
      p.startsWith("**") && p.endsWith("**")
        ? <strong key={j}>{p.slice(2, -2)}</strong>
        : p
    )}</span>;
  };
  const render = text => text.split("\n").map((l, i) => {
    if (l.startsWith("## ")) return <h2 key={i}>{l.slice(3)}</h2>;
    if (l.startsWith("### ")) return <h3 key={i}>{l.slice(4)}</h3>;
    if (/^[-*] /.test(l)) return <div key={i} className="key-point-item"><span className="key-point-bullet">●</span>{inlineFormat(l.replace(/^[-*] /, ""), i)}</div>;
    if (/^\d+\. /.test(l)) return <div key={i} className="key-point-item"><span className="key-point-bullet" style={{fontFamily:"'JetBrains Mono',monospace",fontSize:11}}>{l.match(/^\d+/)[0]}.</span>{inlineFormat(l.replace(/^\d+\. /, ""), i)}</div>;
    if (!l.trim()) return <br key={i} />;
    return <span key={i}>{inlineFormat(l, i)}<br /></span>;
  });
  return (
    <div className="fade-in">
      <div className="detail-section" style={{marginBottom:24}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:12}}>
          <div><div style={{fontSize:15,fontWeight:600,marginBottom:4}}>Monthly AI Intelligence Report</div><div style={{fontSize:13,color:"var(--text-muted)"}}>{highRecent.length} high-impact reviewed insight{highRecent.length!==1?"s":""}{pending>0&&<span style={{color:"var(--accent-orange)",marginLeft:8}}>⚠ {pending} pending</span>}</div></div>
          <button className="btn btn-primary" onClick={go} disabled={loading}>{loading?<><span className="spinner"/> Generating...</>:"⚡ Generate Report"}</button>
        </div>
      </div>
      {report?<div className="report-box fade-in">{render(report)}</div>:!loading&&<div className="empty-state"><div className="empty-state-icon">📊</div><div className="empty-state-text">Generate an AI-powered monthly intelligence brief</div></div>}
    </div>
  );
}

// ─── LOGIN PAGE ─────────────────────────────────────────────────────
function LoginPage({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await api.login(email, password);
      onLogin(result.user);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };
  return (
    <><style>{CSS}</style>
    <div className="app" style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh",background:"var(--bg-primary)"}}>
      <div className="detail-section fade-in" style={{width:"100%",maxWidth:400,padding:40}}>
        <div style={{textAlign:"center",marginBottom:32}}>
          <div className="logo-icon" style={{width:56,height:56,fontSize:20,margin:"0 auto 12px"}}>AI</div>
          <div className="logo-text" style={{fontSize:22}}>Intelligence Hub</div>
          <div className="logo-sub" style={{fontSize:13}}>Sign in to continue</div>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input className="form-input" type="email" placeholder="you@company.com" value={email} onChange={e=>setEmail(e.target.value)} required autoFocus/>
          </div>
          <div className="form-group">
            <label className="form-label">Password</label>
            <input className="form-input" type="password" placeholder="Enter password" value={password} onChange={e=>setPassword(e.target.value)} required/>
          </div>
          {error&&<div style={{color:"var(--accent-red)",fontSize:13,marginBottom:12,padding:"8px 12px",background:"rgba(239,68,68,0.08)",borderRadius:8,border:"1px solid rgba(239,68,68,0.2)"}}>{error}</div>}
          <button className="btn btn-primary" type="submit" disabled={loading} style={{width:"100%",marginTop:8}}>
            {loading?<><span className="spinner"/> Signing in...</>:"Sign In"}
          </button>
        </form>
        {import.meta.env.DEV && (
          <div style={{marginTop:20,textAlign:"center",fontSize:11,color:"var(--text-muted)",fontFamily:"'JetBrains Mono',monospace",padding:"8px 12px",background:"rgba(245,158,11,0.05)",border:"1px solid rgba(245,158,11,0.15)",borderRadius:8}}>
            DEV · ruturaj@company.com
          </div>
        )}
      </div>
    </div></>
  );
}

// ─── ADMIN PANEL ────────────────────────────────────────────────────
const SAMPLE_ACTIVITY = [
  { type:"sample", actor:"Alex R.", title:"OpenAI o3-mini benchmark analysis", ts: new Date(Date.now()-1800000).toISOString() },
  { type:"sample", actor:"Sarah K.", title:"Anthropic Constitutional AI v2 review completed", ts: new Date(Date.now()-3600000).toISOString() },
  { type:"sample", actor:"Marcus L.", title:"Generated March Monthly Report", ts: new Date(Date.now()-7200000).toISOString() },
  { type:"sample", actor:"Priya N.", title:"Gemini 2.0 Flash submitted for review", ts: new Date(Date.now()-14400000).toISOString() },
  { type:"sample", actor:"Admin", title:"Bulk published 6 pending insights", ts: new Date(Date.now()-86400000).toISOString() },
];
const LS_ACTIVITY_KEY = "admin_activity_sample_dismissed";

function relTime(ts) {
  const d = (Date.now() - new Date(ts)) / 1000;
  if (d < 60) return `${Math.floor(d)}s ago`;
  if (d < 3600) return `${Math.floor(d/60)}m ago`;
  if (d < 86400) return `${Math.floor(d/3600)}h ago`;
  return formatDate(ts);
}

function AdminPanel({ insights = [], onRefresh }) {
  const me = api.getStoredUser();
  const [tab, setTab] = useState("overview");
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState(null);
  const [aiUsage, setAiUsage] = useState(null);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showSampleActivity, setShowSampleActivity] = useState(() => !localStorage.getItem(LS_ACTIVITY_KEY));

  // User management
  const [showRegister, setShowRegister] = useState(false);
  const [regName, setRegName] = useState(""); const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState(""); const [regRole, setRegRole] = useState("user");
  const [regMsg, setRegMsg] = useState(""); const [regErr, setRegErr] = useState("");

  // Bulk publish
  const [selectedPending, setSelectedPending] = useState(new Set());
  const [publishing, setPublishing] = useState(false);
  const [publishMsg, setPublishMsg] = useState("");

  // Bulk upload
  const [uploadText, setUploadText] = useState("");
  const [uploadErr, setUploadErr] = useState(""); const [uploadMsg, setUploadMsg] = useState("");
  const [uploading, setUploading] = useState(false);

  // Export
  const [exporting, setExporting] = useState(false);
  const [exportErr, setExportErr] = useState("");

  // Import
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState("");
  const [importErr, setImportErr] = useState("");

  const handleImport = () => {
    setImportMsg(""); setImportErr("");
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      let parsed;
      try {
        parsed = JSON.parse(await file.text());
      } catch { setImportErr("Invalid JSON file"); return; }
      const { insights = [], reviews = [], reports = [], panel_signals = [], ai_logs = [] } = parsed;
      if (!insights.length && !reviews.length && !reports.length && !panel_signals.length && !ai_logs.length) {
        setImportErr("File must contain at least one of: insights, reviews, reports, panel_signals, ai_logs"); return;
      }
      const ok = window.confirm(
        `This will replace all existing data (except users).\n\nImport: ${insights.length} insights, ${reports.length} reports, ${panel_signals.length} signals, ${reviews.length} reviews, ${ai_logs.length} AI logs?\n\nContinue?`
      );
      if (!ok) return;
      setImporting(true);
      try {
        const res = await api.importAllData({ insights, reviews, reports, panel_signals, ai_logs });
        setImportMsg(`✓ Imported: ${res.counts.insights} insights, ${res.counts.reports} reports, ${res.counts.panel_signals} signals`);
        setTimeout(() => window.location.reload(), 1200);
      } catch (err) { setImportErr(err.message); }
      setImporting(false);
    };
    input.click();
  };

  const handleExport = async () => {
    setExporting(true); setExportErr("");
    try {
      const data = await api.exportAllData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ai-hub-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) { setExportErr(err.message); }
    setExporting(false);
  };

  const pendingInsights = insights.filter(i => i.needs_review);

  useEffect(() => {
    (async () => {
      try {
        const [u, s, a, usage] = await Promise.all([api.fetchUsers(), api.fetchAdminStats(), api.fetchAdminActivity(), api.fetchAiUsageStats()]);
        setUsers(u); setStats(s); setActivity(a); setAiUsage(usage);
      } catch (err) { console.error('Admin load error:', err); }
      setLoading(false);
    })();
  }, []);

  const handleRegister = async () => {
    setRegErr(""); setRegMsg("");
    if (!regName || !regEmail || !regPassword) { setRegErr("All fields required"); return; }
    try {
      const user = await api.registerUser(regName, regEmail, regPassword, regRole);
      setUsers(prev => [{ ...user, active: 1, created_at: new Date().toISOString() }, ...prev]);
      setRegMsg(`✓ ${user.name} (${user.role}) created`);
      setRegName(""); setRegEmail(""); setRegPassword(""); setRegRole("user");
    } catch (err) { setRegErr(err.message); }
  };

  const handleRoleToggle = async (u) => {
    const newRole = u.role === "admin" ? "user" : "admin";
    try {
      const updated = await api.updateUserRole(u.id, newRole);
      setUsers(prev => prev.map(x => x.id === updated.id ? updated : x));
    } catch (err) { alert(err.message); }
  };

  const handleActiveToggle = async (u) => {
    try {
      const updated = await api.updateUserActive(u.id, !u.active);
      setUsers(prev => prev.map(x => x.id === updated.id ? updated : x));
    } catch (err) { alert(err.message); }
  };

  const handleDeleteUser = async (u) => {
    if (!confirm(`Delete user ${u.name}? This cannot be undone.`)) return;
    try {
      await api.deleteUser(u.id);
      setUsers(prev => prev.filter(x => x.id !== u.id));
    } catch (err) { alert(err.message); }
  };

  const togglePending = (id) => setSelectedPending(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  const selectAllPending = () => setSelectedPending(selectedPending.size === pendingInsights.length ? new Set() : new Set(pendingInsights.map(i => i.id)));

  const handleBulkPublish = async (ids) => {
    setPublishing(true); setPublishMsg("");
    try {
      const res = await api.bulkPublishInsights(ids || [...selectedPending]);
      setPublishMsg(`✓ Published ${res.published} insight${res.published !== 1 ? "s" : ""}`);
      setSelectedPending(new Set());
      if (onRefresh) onRefresh();
      const [u, s, a] = await Promise.all([api.fetchUsers(), api.fetchAdminStats(), api.fetchAdminActivity()]);
      setUsers(u); setStats(s); setActivity(a);
    } catch (err) { setPublishMsg(`✗ ${err.message}`); }
    setPublishing(false);
  };

  const handleBulkUpload = async () => {
    setUploadErr(""); setUploadMsg(""); setUploading(true);
    let entries;
    try {
      entries = JSON.parse(uploadText);
      if (!Array.isArray(entries)) throw new Error("Must be a JSON array");
      if (entries.some(e => !e.title)) throw new Error('Each entry needs a "title" field');
    } catch (e) { setUploadErr(e.message); setUploading(false); return; }
    try {
      const res = await api.bulkUploadInsights(entries);
      setUploadMsg(`✓ Inserted ${res.inserted} insight${res.inserted !== 1 ? "s" : ""}`);
      setUploadText("");
      if (onRefresh) onRefresh();
    } catch (err) { setUploadErr(err.message); }
    setUploading(false);
  };

  if (loading) return (
    <div className="fade-in" style={{textAlign:"center",padding:60}}>
      <span className="spinner" style={{width:28,height:28,borderWidth:3}}/>
      <div style={{marginTop:14,color:"var(--text-muted)",fontFamily:"'JetBrains Mono',monospace",fontSize:12}}>Initializing command center...</div>
    </div>
  );

  const TABS = ["overview", "activity", "insights", "users"];
  const TAB_LABELS = { overview: "Overview", activity: "Activity", insights: "Insights", users: "Users" };

  const feedItems = [
    ...activity,
    ...(showSampleActivity ? SAMPLE_ACTIVITY : [])
  ].sort((a, b) => new Date(b.ts) - new Date(a.ts));

  const maxCat = Math.max(...(stats?.categoryBreakdown?.map(c => c.count) || [1]), 1);

  return (
    <div className="fade-in" style={{display:"flex",flexDirection:"column",height:"100%"}}>
      {/* Header */}
      <div style={{marginBottom:20,display:"flex",alignItems:"center",gap:12}}>
        <div className="cmd-dot"/>
        <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"2px",color:"var(--text-muted)"}}>Operations Command Center</span>
        <span style={{marginLeft:"auto",fontFamily:"'JetBrains Mono',monospace",fontSize:10,color:"var(--text-muted)"}}>
          {new Date().toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})} UTC
        </span>
        {me?.role === "admin" && (
          <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
            <div style={{display:"flex",gap:8}}>
              <button className="btn-secondary" onClick={handleImport} disabled={importing}
                style={{fontFamily:"'JetBrains Mono',monospace",fontSize:11}}>
                {importing ? "Importing…" : "Import Data"}
              </button>
              <button className="btn-secondary" onClick={handleExport} disabled={exporting}
                style={{fontFamily:"'JetBrains Mono',monospace",fontSize:11}}>
                {exporting ? "Exporting…" : "Export Data"}
              </button>
            </div>
            {importMsg && <span style={{fontSize:11,color:"var(--accent-green)",fontFamily:"'JetBrains Mono',monospace"}}>{importMsg}</span>}
            {importErr && <span style={{fontSize:11,color:"#ff4d6a",fontFamily:"'JetBrains Mono',monospace"}}>{importErr}</span>}
            {exportErr && <span style={{fontSize:11,color:"#ff4d6a",fontFamily:"'JetBrains Mono',monospace"}}>{exportErr}</span>}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="admin-tabs">
        {TABS.map(t => (
          <button key={t} className={`admin-tab ${tab===t?"active":""}`} onClick={()=>setTab(t)}>
            {TAB_LABELS[t]}
            {t==="insights"&&pendingInsights.length>0&&<span className="nav-badge-count" style={{marginLeft:8}}>{pendingInsights.length}</span>}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW ── */}
      {tab==="overview"&&<>
        {/* Metric cards */}
        <div className="admin-metrics-grid">
          {[
            { label:"Total Users", val:stats?.totalUsers??0, color:"var(--accent-cyan)", sub:"registered accounts" },
            { label:"Active Today", val:stats?.activeToday??0, color:"var(--accent-green)", sub:"submitted or reviewed" },
            { label:"Submitted Today", val:stats?.submittedToday??0, color:"var(--accent-blue)", sub:"new entries" },
            { label:"Reviewed Today", val:stats?.reviewedToday??0, color:"var(--accent-purple)", sub:"via review queue" },
            { label:"Total Insights", val:stats?.totalInsights??0, color:"var(--accent-cyan)", sub:`${stats?.pendingReview??0} pending review` },
            { label:"High Impact", val:stats?.highImpact??0, color:"#ff4d6a", sub:"critical intelligence" },
          ].map((m,i) => (
            <div key={i} className="admin-metric" style={{"--m-color":m.color}}>
              <div className="admin-metric-val">{m.val}</div>
              <div className="admin-metric-label">{m.label}</div>
              <div className="admin-metric-sub">{m.sub}</div>
            </div>
          ))}
        </div>

        <div className="admin-two-col">
          {/* AI Usage Monitoring */}
          <div className="admin-card">
            <div className="admin-card-title">AI Usage Monitoring</div>
            <div className="ai-usage-grid">
              {[
                { label: "AI Requests Today", val: aiUsage?.requestsToday ?? "—", color: "var(--accent-cyan)" },
                { label: "Tokens Used Today", val: aiUsage?.tokensToday ?? "—", color: "var(--accent-blue)" },
                { label: "Summaries Generated", val: aiUsage?.summariesToday ?? "—", color: "var(--accent-purple)" },
                { label: "Reports Generated", val: aiUsage?.reportsToday ?? "—", color: "var(--accent-green)" },
              ].map((m, i) => (
                <div key={i} className="ai-usage-card" style={{"--u-color": m.color}}>
                  <div className="ai-usage-val">{m.val}</div>
                  <div className="ai-usage-lbl">{m.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Category breakdown */}
          <div className="admin-card">
            <div className="admin-card-title">Intelligence by Category</div>
            {stats?.categoryBreakdown?.length > 0 ? stats.categoryBreakdown.map((c,i) => (
              <div key={i} className="cat-bar-row">
                <span className="cat-bar-name">{c.category||"Other"}</span>
                <div className="cat-bar-track"><div className="cat-bar-fill" style={{width:`${(c.count/maxCat)*100}%`}}/></div>
                <span className="cat-bar-count">{c.count}</span>
              </div>
            )) : <div style={{color:"var(--text-muted)",fontSize:13,padding:"16px 0"}}>No data yet</div>}
          </div>
        </div>

        {/* Top submitters */}
        {stats?.topSubmitters?.length > 0 && (
          <div className="admin-card">
            <div className="admin-card-title">Most Active Users</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:10}}>
              {stats.topSubmitters.map((s,i) => (
                <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",background:"var(--bg-secondary)",borderRadius:8,border:"1px solid var(--border)"}}>
                  <div style={{width:28,height:28,borderRadius:"50%",background:`hsl(${i*60},60%,40%)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:"#fff",flex:"shrink:0"}}>{s.submitted_by?.[0]?.toUpperCase()||"?"}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:600,color:"var(--text-primary)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.submitted_by}</div>
                    <div style={{fontSize:11,color:"var(--text-muted)",fontFamily:"'JetBrains Mono',monospace"}}>{s.count} insights</div>
                  </div>
                  <span style={{fontSize:16,fontWeight:800,color:"var(--accent-cyan)",fontFamily:"'JetBrains Mono',monospace"}}>#{i+1}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </>}

      {/* ── ACTIVITY ── */}
      {tab==="activity"&&(
        <div className="admin-card" style={{maxHeight:"70vh",overflow:"hidden",display:"flex",flexDirection:"column"}}>
          <div style={{display:"flex",alignItems:"center",marginBottom:14}}>
            <div className="admin-card-title" style={{margin:0}}>Live Activity Feed</div>
            {showSampleActivity&&(
              <button className="sample-remove-btn" style={{marginLeft:"auto"}} onClick={()=>{setShowSampleActivity(false);localStorage.setItem(LS_ACTIVITY_KEY,"1")}}>
                Remove sample items
              </button>
            )}
          </div>
          {feedItems.length===0 ? (
            <div style={{textAlign:"center",padding:"32px 0",color:"var(--text-muted)",fontSize:13}}>No activity recorded yet</div>
          ) : (
            <div className="activity-feed" style={{overflowY:"auto",flex:1}}>
              {feedItems.map((item, i) => {
                const ts = item.ts || "";
                const type = item.type || "submitted";
                const badgeClass = `activity-type-badge activity-badge-${type==="sample"?"sample":type}`;
                const dotColor = type==="reviewed"?"var(--accent-green)":type==="report"?"var(--accent-purple)":type==="sample"?"var(--accent-orange)":"var(--accent-cyan)";
                const actionText = type==="reviewed"?"reviewed":type==="report"?"generated report":type==="sample"?"·":"submitted";
                return (
                  <div key={i} className="activity-item">
                    <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4,flexShrink:0,paddingTop:4}}>
                      <div className="activity-dot" style={{background:dotColor}}/>
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div className="activity-title">
                        <span style={{color:"var(--accent-cyan)",fontWeight:600}}>{item.actor||"Unknown"}</span>
                        {" "}{actionText}{" "}
                        <span style={{color:"var(--text-secondary)"}}>{item.title||""}</span>
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:8,marginTop:3}}>
                        <span className={badgeClass}>{type==="sample"?"sample":type}</span>
                        <span className="activity-meta">{ts?relTime(ts):""}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── INSIGHTS ── */}
      {tab==="insights"&&<>
        {/* Bulk publish */}
        <div className="admin-card" style={{marginBottom:20}}>
          <div className="admin-card-title" style={{color:"var(--accent-green)"}}>Bulk Publish</div>
          {publishMsg&&<div style={{marginBottom:10,fontSize:13,color:publishMsg.startsWith("✓")?"var(--accent-green)":"var(--accent-red)",fontFamily:"'JetBrains Mono',monospace"}}>{publishMsg}</div>}
          {pendingInsights.length === 0 ? (
            <div style={{color:"var(--text-muted)",fontSize:13,padding:"8px 0"}}>✓ No pending insights — all caught up!</div>
          ) : (
            <>
              <div className="publish-bar">
                <span style={{fontSize:12,color:"var(--text-secondary)",fontFamily:"'JetBrains Mono',monospace"}}>{selectedPending.size} of {pendingInsights.length} selected</span>
                <button className="signal-select-all-btn" style={{color:"var(--accent-green)"}} onClick={selectAllPending}>
                  {selectedPending.size===pendingInsights.length?"Deselect All":"Select All"}
                </button>
                {selectedPending.size>0&&(
                  <button className="btn btn-success" style={{marginLeft:"auto",padding:"5px 16px",fontSize:12}} onClick={()=>handleBulkPublish()} disabled={publishing}>
                    {publishing?"Publishing…":`✓ Publish ${selectedPending.size}`}
                  </button>
                )}
                <button className="btn" style={{padding:"5px 16px",fontSize:12,background:"rgba(16,185,129,0.06)",border:"1px solid rgba(16,185,129,0.2)",color:"var(--accent-green)"}} onClick={()=>handleBulkPublish([])} disabled={publishing}>
                  Publish All ({pendingInsights.length})
                </button>
              </div>
              <div className="pending-table-wrap table-wrapper">
                <table>
                  <thead><tr>
                    <th style={{width:32}}><input type="checkbox" className="bulk-checkbox" checked={selectedPending.size===pendingInsights.length&&pendingInsights.length>0} onChange={selectAllPending}/></th>
                    <th>Title</th><th>Category</th><th>Impact</th><th>By</th><th>Date</th>
                  </tr></thead>
                  <tbody>{pendingInsights.map(ins=>(
                    <tr key={ins.id} className={selectedPending.has(ins.id)?"row-selected":""} onClick={()=>togglePending(ins.id)} style={{cursor:"pointer"}}>
                      <td><input type="checkbox" className="bulk-checkbox" checked={selectedPending.has(ins.id)} onChange={()=>{}}/></td>
                      <td style={{fontWeight:500}}>{ins.title}</td>
                      <td><span className="badge badge-category">{ins.category}</span></td>
                      <td><span className={`badge badge-impact-${ins.impact}`}>{ins.impact}</span></td>
                      <td style={{fontSize:12,color:"var(--text-secondary)"}}>{ins.submitted_by}</td>
                      <td style={{fontSize:11,color:"var(--text-muted)",fontFamily:"'JetBrains Mono',monospace"}}>{formatDate(ins.created_at)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </>
          )}
        </div>

        {/* Bulk upload */}
        <div className="admin-card">
          <div className="admin-card-title">Bulk Upload Intelligence</div>
          <div className="upload-format-hint">{`[\n  {\n    "title": "Required: intelligence title",\n    "summary": "Optional summary",\n    "urls": ["https://source.com"],\n    "category": "Model | Tool | Paper | Use Case | News | Other",\n    "impact": "High | Medium | Low | Other",\n    "tags": "comma,separated,tags",\n    "needs_review": false\n  }\n]`}</div>
          {uploadErr&&<div style={{color:"var(--accent-red)",fontSize:12,fontFamily:"'JetBrains Mono',monospace",marginBottom:8}}>{uploadErr}</div>}
          {uploadMsg&&<div style={{color:"var(--accent-green)",fontSize:12,fontFamily:"'JetBrains Mono',monospace",marginBottom:8}}>{uploadMsg}</div>}
          <textarea className="form-textarea" rows={8} placeholder={'[\n  {"title": "Claude 4 released", "urls": ["https://anthropic.com"], "impact": "High", "needs_review": false}\n]'} value={uploadText} onChange={e=>setUploadText(e.target.value)} style={{fontFamily:"'JetBrains Mono',monospace",fontSize:12}}/>
          <button className="btn btn-primary" style={{marginTop:10}} onClick={handleBulkUpload} disabled={uploading||!uploadText.trim()}>
            {uploading?"Uploading…":"Upload Intelligence"}
          </button>
        </div>
      </>}

      {/* ── USERS ── */}
      {tab==="users"&&(
        <div className="admin-card">
          <div style={{display:"flex",alignItems:"center",marginBottom:16}}>
            <div className="admin-card-title" style={{margin:0}}>User Management ({users.length})</div>
            <button className="btn btn-primary" style={{marginLeft:"auto",padding:"6px 16px",fontSize:12}} onClick={()=>setShowRegister(!showRegister)}>
              {showRegister?"Cancel":"+ Add User"}
            </button>
          </div>

          {showRegister&&(
            <div style={{marginBottom:20,padding:16,background:"rgba(6,214,224,0.03)",border:"1px solid var(--border-glow)",borderRadius:10}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
                <div className="form-group" style={{margin:0}}><label className="form-label">Name</label><input className="form-input" value={regName} onChange={e=>setRegName(e.target.value)} placeholder="Full name"/></div>
                <div className="form-group" style={{margin:0}}><label className="form-label">Email</label><input className="form-input" type="email" value={regEmail} onChange={e=>setRegEmail(e.target.value)} placeholder="email@company.com"/></div>
                <div className="form-group" style={{margin:0}}><label className="form-label">Password</label><input className="form-input" type="password" value={regPassword} onChange={e=>setRegPassword(e.target.value)} placeholder="Set password"/></div>
                <div className="form-group" style={{margin:0}}><label className="form-label">Role</label><select className="form-select" value={regRole} onChange={e=>setRegRole(e.target.value)}><option value="user">User</option><option value="admin">Admin</option></select></div>
              </div>
              {regErr&&<div style={{color:"var(--accent-red)",fontSize:12,marginBottom:8}}>{regErr}</div>}
              {regMsg&&<div style={{color:"var(--accent-green)",fontSize:12,marginBottom:8}}>{regMsg}</div>}
              <button className="btn btn-success" onClick={handleRegister}>Create User</button>
            </div>
          )}

          <div className="table-wrapper"><table>
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Joined</th><th>Actions</th></tr></thead>
            <tbody>{users.map(u=>{
              const isSelf = u.id === me?.id;
              return (
                <tr key={u.id} className={!u.active?"user-inactive":""}>
                  <td style={{fontWeight:500}}>
                    {u.name}
                    {isSelf&&<span style={{marginLeft:6,fontSize:10,color:"var(--accent-cyan)",fontFamily:"'JetBrains Mono',monospace"}}>(you)</span>}
                  </td>
                  <td style={{color:"var(--text-secondary)",fontSize:12}}>{u.email}</td>
                  <td><span className={`badge ${u.role==="admin"?"badge-impact-High":"badge-reviewed"}`}>{u.role}</span></td>
                  <td>
                    {u.active!==0
                      ? <span className="badge badge-reviewed">Active</span>
                      : <span className="badge badge-review" style={{animationName:"none"}}>Inactive</span>
                    }
                  </td>
                  <td style={{color:"var(--text-muted)",fontSize:11,fontFamily:"'JetBrains Mono',monospace"}}>{formatDate(u.created_at)}</td>
                  <td>
                    {!isSelf&&<div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                      <button className="user-action-btn promote" onClick={()=>handleRoleToggle(u)}>
                        {u.role==="admin"?"→ User":"→ Admin"}
                      </button>
                      <button className="user-action-btn" onClick={()=>handleActiveToggle(u)}>
                        {u.active!==0?"Deactivate":"Reactivate"}
                      </button>
                      <button className="user-action-btn danger" onClick={()=>handleDeleteUser(u)}>Delete</button>
                    </div>}
                  </td>
                </tr>
              );
            })}</tbody>
          </table></div>
        </div>
      )}
    </div>
  );
}

// ─── PROFILE PAGE ───────────────────────────────────────────────────
function ProfilePage({ user }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const p = await api.fetchProfile();
        setProfile(p);
      } catch (err) { console.error('Profile load error:', err); }
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="fade-in" style={{textAlign:"center",padding:60}}><span className="spinner" style={{width:28,height:28,borderWidth:3}}/><div style={{marginTop:14,color:"var(--text-muted)"}}>Loading profile...</div></div>;
  if (!profile) return <div className="fade-in empty-state"><div className="empty-state-icon">⚠</div><div className="empty-state-text">Failed to load profile</div></div>;

  const { stats, timeline, badges, expertiseTags } = profile;
  const initials = profile.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  const earnedBadges = badges.filter(b => b.earned);
  const upcomingBadges = badges.filter(b => !b.earned);

  return (
    <div className="fade-in">
      {/* Profile Header Card */}
      <div className="profile-header-card">
        <div className="profile-avatar">{initials}</div>
        <div className="profile-header-info">
          <h2 className="profile-name">{profile.name}</h2>
          <div className="profile-meta">
            <span className="profile-email">{profile.email}</span>
            <span className={`badge ${profile.role==="admin"?"badge-impact-High":"badge-reviewed"}`} style={{fontSize:11}}>{profile.role}</span>
          </div>
          <div className="profile-join">Member since {formatDate(profile.created_at)}</div>
        </div>
        <div className="profile-header-right">
          {earnedBadges.length > 0 && <div className="profile-badge-count">
            <span className="profile-badge-number">{earnedBadges.length}</span>
            <span className="profile-badge-label">badge{earnedBadges.length!==1?"s":""} earned</span>
          </div>}
        </div>
      </div>

      {/* Contribution Stats */}
      <div className="profile-stats-grid">
        <div className="profile-stat-card"><div className="profile-stat-value" style={{color:"var(--accent-cyan)"}}>{stats.submitted}</div><div className="profile-stat-label">Intelligence Submitted</div></div>
        <div className="profile-stat-card"><div className="profile-stat-value" style={{color:"var(--accent-green)"}}>{stats.approved}</div><div className="profile-stat-label">Intelligence Approved</div></div>
        <div className="profile-stat-card"><div className="profile-stat-value" style={{color:"#ff4d6a"}}>{stats.highImpact}</div><div className="profile-stat-label">High Impact Insights</div></div>
        <div className="profile-stat-card"><div className="profile-stat-value" style={{color:"var(--accent-purple)"}}>{stats.reviewed}</div><div className="profile-stat-label">Insights Reviewed</div></div>
      </div>

      <div className="profile-two-col">
        {/* Left Column: Timeline + Expertise */}
        <div>
          {/* Activity Timeline */}
          <div className="detail-section" style={{marginBottom:20}}>
            <h3 style={{marginBottom:16}}>Activity Timeline</h3>
            {timeline.length === 0 ? <div style={{color:"var(--text-muted)",fontSize:13,fontStyle:"italic"}}>No activity yet</div> :
            <div className="profile-timeline">
              {timeline.map((item, i) => (
                <div key={i} className="profile-timeline-item">
                  <div className={`profile-timeline-dot ${item.type==="reviewed"?"dot-reviewed":"dot-submitted"}`}/>
                  <div className="profile-timeline-content">
                    <div className="profile-timeline-action">
                      <span className={`profile-timeline-type ${item.type}`}>{item.type === "submitted" ? "Submitted" : "Reviewed"}</span>
                      <span className="profile-timeline-title">{item.title}</span>
                    </div>
                    <div className="profile-timeline-meta">
                      <span className="badge badge-category" style={{fontSize:10,padding:"1px 6px"}}>{CATEGORY_ICONS[item.category]} {item.category}</span>
                      {item.impact==="High"&&<span className="badge badge-impact-High" style={{fontSize:10,padding:"1px 6px"}}>High</span>}
                      <span style={{fontSize:11,color:"var(--text-muted)",fontFamily:"'JetBrains Mono',monospace"}}>{formatDate(item.date)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>}
          </div>

          {/* Expertise Tags */}
          {expertiseTags.length > 0 && <div className="detail-section">
            <h3 style={{marginBottom:12}}>Expertise Tags</h3>
            <div className="profile-expertise">
              {expertiseTags.map((tag, i) => (
                <div key={i} className="profile-expertise-tag">
                  <span className="profile-expertise-name">{tag.name}</span>
                  <span className="profile-expertise-count">{tag.count}</span>
                </div>
              ))}
            </div>
          </div>}
        </div>

        {/* Right Column: Badges */}
        <div>
          <div className="detail-section" style={{marginBottom:20}}>
            <h3 style={{marginBottom:16}}>Achievements</h3>
            {earnedBadges.length === 0 && upcomingBadges.length === 0 ? <div style={{color:"var(--text-muted)",fontSize:13,fontStyle:"italic"}}>Start contributing to earn badges!</div> : null}
            {earnedBadges.length > 0 && <div className="profile-badges">
              {earnedBadges.map(b => (
                <div key={b.id} className="profile-badge earned">
                  <div className="profile-badge-icon">{b.icon}</div>
                  <div><div className="profile-badge-name">{b.name}</div><div className="profile-badge-desc">{b.desc}</div></div>
                </div>
              ))}
            </div>}
            {upcomingBadges.length > 0 && <>
              <div className="profile-badge-divider">Next achievements</div>
              <div className="profile-badges">
                {upcomingBadges.map(b => (
                  <div key={b.id} className="profile-badge upcoming">
                    <div className="profile-badge-icon" style={{opacity:0.4}}>{b.icon}</div>
                    <div style={{flex:1}}>
                      <div className="profile-badge-name" style={{opacity:0.5}}>{b.name}</div>
                      <div className="profile-badge-desc">{b.desc}</div>
                      {b.target && <div className="profile-badge-progress">
                        <div className="profile-badge-bar"><div className="profile-badge-fill" style={{width:`${Math.min((b.progress/b.target)*100,100)}%`}}/></div>
                        <span className="profile-badge-fraction">{b.progress}/{b.target}</span>
                      </div>}
                    </div>
                  </div>
                ))}
              </div>
            </>}
          </div>

          {/* Last Activity */}
          <div className="detail-section">
            <h3 style={{marginBottom:8}}>Research Activity</h3>
            <div style={{display:"flex",justifyContent:"space-between",padding:"8px 0"}}>
              <span style={{color:"var(--text-secondary)",fontSize:13}}>Last active</span>
              <span style={{color:"var(--text-primary)",fontSize:13,fontFamily:"'JetBrains Mono',monospace"}}>{formatDate(stats.lastActivity)}</span>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderTop:"1px solid var(--border)"}}>
              <span style={{color:"var(--text-secondary)",fontSize:13}}>Approval rate</span>
              <span style={{color:"var(--accent-green)",fontSize:13,fontWeight:600}}>{stats.submitted>0?Math.round((stats.approved/stats.submitted)*100):0}%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── APP ────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(() => api.getStoredUser());
  const [page, setPage] = useState("dashboard");
  const [data, setData] = useState([]);
  const [sel, setSel] = useState(null);
  const [dbFilters, setDbFilters] = useState({});
  const [filterKey, setFilterKey] = useState(0);
  const [showLeftPanel, setShowLeftPanel] = useState(false);
  const [showRightPanel, setShowRightPanel] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [aiDbSignals, setAiDbSignals] = useState([]);
  const [finDbSignals, setFinDbSignals] = useState([]);

  // Fetch insights from API when logged in
  const refreshData = useCallback(async () => {
    if (!user) return;
    try {
      const [insights, aiSigs, finSigs] = await Promise.all([
        api.fetchInsights(),
        api.fetchSignals('ai_signal'),
        api.fetchSignals('financial_ai'),
      ]);
      setData(insights);
      setAiDbSignals(aiSigs || []);
      setFinDbSignals(finSigs || []);
    } catch (err) { console.error('Fetch data failed:', err); }
    setLoadingData(false);
  }, [user]);

  const handleAddSignal = useCallback(async (title, url, panelId) => {
    const sig = await api.addSignal(title, url, panelId);
    if (panelId === 'ai_signal') setAiDbSignals(prev => [sig, ...prev]);
    else setFinDbSignals(prev => [sig, ...prev]);
  }, []);

  const handleDeleteSignal = useCallback(async (id, panelId) => {
    await api.deleteSignal(id);
    if (panelId === 'ai_signal') setAiDbSignals(prev => prev.filter(s => s.id !== id));
    else setFinDbSignals(prev => prev.filter(s => s.id !== id));
  }, []);

  const handleBulkAddSignals = useCallback(async (items, panelId) => {
    const sigs = await api.bulkAddSignals(items, panelId);
    if (panelId === 'ai_signal') setAiDbSignals(sigs);
    else setFinDbSignals(sigs);
  }, []);

  const handleBulkDeleteSignals = useCallback(async (ids, panelId) => {
    await api.bulkDeleteSignals(ids);
    if (panelId === 'ai_signal') setAiDbSignals(prev => prev.filter(s => !ids.includes(s.id)));
    else setFinDbSignals(prev => prev.filter(s => !ids.includes(s.id)));
  }, []);

  const handleBulkDeleteInsights = useCallback(async (ids) => {
    await api.bulkDeleteInsights(ids);
    setData(prev => prev.filter(i => !ids.includes(i.id)));
  }, []);

  useEffect(() => { refreshData(); }, [refreshData]);

  // Listen for auth expiry
  useEffect(() => {
    const handler = () => { setUser(null); setPage("dashboard"); };
    window.addEventListener('auth-expired', handler);
    return () => window.removeEventListener('auth-expired', handler);
  }, []);

  const handleLogin = (u) => { setUser(u); setLoadingData(true); };
  const handleLogout = () => { api.logout(); setUser(null); setData([]); setPage("dashboard"); };

  // Combine insights with panel signals so Core AI / Fin AI filters show their panel data
  const allIntelligence = useMemo(() => {
    const sigToInsight = (s, panel) => ({
      id: `sig-${s.id}`,
      title: s.title,
      urls: [s.url],
      entry_type: panel,
      category: 'Other',
      impact: 'Other',
      needs_review: false,
      submitted_by: s.added_by || '',
      created_at: s.created_at,
      summary: '',
      tags: '',
      key_points: '',
    });
    return [
      ...data,
      ...aiDbSignals.map(s => sigToInsight(s, 'ai_signal')),
      ...finDbSignals.map(s => sigToInsight(s, 'financial_ai')),
    ];
  }, [data, aiDbSignals, finDbSignals]);

  // Not logged in → show login page
  if (!user) return <LoginPage onLogin={handleLogin} />;

  const rc = data.filter(i => i.needs_review).length;
  const nav = p => { setPage(p); setSel(null); };
  const navigateFiltered = (filters) => { setDbFilters(filters); setFilterKey(k => k + 1); setSel(null); setPage("database"); };

  const NAV = [
    {id:"dashboard",icon:"◈",label:"Dashboard"},
    {id:"add",icon:"＋",label:"Submit Intelligence"},
    {id:"database",icon:"▤",label:"All Intelligence",badge:rc||null},
    {id:"report",icon:"◧",label:"Monthly Report"},
    ...(user.role==="admin"?[{id:"admin",icon:"⚙",label:"Admin Panel"}]:[])
  ];
  const T = {
    dashboard:["AI Radar","Real-time intelligence overview"],
    add:["Submit Intelligence","Share AI developments with the team"],
    database:["Intelligence Database","All collected intelligence — reviewed and pending"],
    detail:["Insight Detail","Full intelligence entry"],
    report:["Report Generator","AI-powered monthly intelligence briefs"],
    admin:["Admin Panel","User management & system analytics"],
    profile:["Your Profile","Researcher dashboard & activity"]
  };

  if (loadingData) return (
    <><style>{CSS}</style>
    <div className="app" style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh"}}>
      <div style={{textAlign:"center"}}><span className="spinner" style={{width:32,height:32,borderWidth:3}}/><div style={{marginTop:16,color:"var(--text-muted)"}}>Loading intelligence data...</div></div>
    </div></>
  );

  return (
    <><style>{CSS}</style>
    <div className="app">
      <div className="sidebar">
        <div className="sidebar-logo"><div className="logo-icon">AI</div><div><div className="logo-text">Intelligence Hub</div><div className="logo-sub">AI Research Ops</div></div></div>
        <div className="sidebar-nav">{NAV.map(n=>(
          <div key={n.id} className={`nav-item ${page===n.id?"active":""}`} onClick={()=>{nav(n.id);if(n.id==="database"){setDbFilters({});setFilterKey(k=>k+1)}}}>
            <span className="nav-icon">{n.icon}</span><span className="nav-label">{n.label}</span>
            {n.badge&&<span className="nav-badge-count">{n.badge}</span>}
          </div>
        ))}</div>
        <div className="sidebar-footer">
          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}><span className="pulse-dot"/> {user.name} <span className="badge" style={{fontSize:9,padding:"1px 6px",background:user.role==="admin"?"rgba(239,68,68,0.1)":"rgba(6,214,224,0.1)",color:user.role==="admin"?"var(--accent-red)":"var(--accent-cyan)",border:"1px solid "+(user.role==="admin"?"rgba(239,68,68,0.2)":"rgba(6,214,224,0.2)")}}>{user.role}</span></div>
          <div style={{fontSize:12,color:"var(--text-muted)"}}>{data.filter(i=>!i.needs_review).length} published · {rc} pending</div>
          <div style={{marginTop:8,fontSize:11,color:"var(--accent-red)",cursor:"pointer",opacity:0.7}} onClick={handleLogout}>⏏ Sign out</div>
        </div>
      </div>
      <div className="main">
        <div className="page-header">
          <div><div className="page-title">{(T[page]||T.dashboard)[0]}</div><div className="page-subtitle">{(T[page]||T.dashboard)[1]}</div></div>
          <div className="profile-icon-btn" onClick={()=>nav("profile")} title="View Profile" style={{background:page==="profile"?"rgba(6,214,224,0.15)":""}}>
            <span className="profile-icon-initials">{user.name.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2)}</span>
          </div>
        </div>
        <div className="page-content">
          {page==="dashboard"&&<div className="terminal-layout">
            <SignalStreamPanel title="Core AI" signals={AI_SIGNALS} dbSignals={aiDbSignals} panelId="ai_signal" accentColor="#06d6e0" side="left" isAdmin={user.role==="admin"} onAddSignal={handleAddSignal} onDeleteSignal={id=>handleDeleteSignal(id,'ai_signal')} onBulkAddSignals={handleBulkAddSignals} onBulkDeleteSignals={handleBulkDeleteSignals} />
            <div><Dashboard insights={data} onSelect={i=>{setSel(i);setPage("detail")}} onNavigateFiltered={navigateFiltered}/></div>
            <SignalStreamPanel title="Fin AI" signals={FIN_AI_SIGNALS} dbSignals={finDbSignals} panelId="financial_ai" accentColor="#10b981" side="right" isAdmin={user.role==="admin"} onAddSignal={handleAddSignal} onDeleteSignal={id=>handleDeleteSignal(id,'financial_ai')} onBulkAddSignals={handleBulkAddSignals} onBulkDeleteSignals={handleBulkDeleteSignals} />
            {/* Laptop overlay panels */}
            {(showLeftPanel||showRightPanel)&&<div className={`signal-panel-backdrop ${showLeftPanel||showRightPanel?"visible":""}`} onClick={()=>{setShowLeftPanel(false);setShowRightPanel(false)}}/>}
            <SignalStreamPanel title="Core AI" signals={AI_SIGNALS} dbSignals={aiDbSignals} panelId="ai_signal" accentColor="#06d6e0" side="left" isAdmin={user.role==="admin"} isOverlay={showLeftPanel?"visible":"hidden"} onClose={()=>setShowLeftPanel(false)} onAddSignal={handleAddSignal} onDeleteSignal={id=>handleDeleteSignal(id,'ai_signal')} onBulkAddSignals={handleBulkAddSignals} onBulkDeleteSignals={handleBulkDeleteSignals} />
            <SignalStreamPanel title="Fin AI" signals={FIN_AI_SIGNALS} dbSignals={finDbSignals} panelId="financial_ai" accentColor="#10b981" side="right" isAdmin={user.role==="admin"} isOverlay={showRightPanel?"visible":"hidden"} onClose={()=>setShowRightPanel(false)} onAddSignal={handleAddSignal} onDeleteSignal={id=>handleDeleteSignal(id,'financial_ai')} onBulkAddSignals={handleBulkAddSignals} onBulkDeleteSignals={handleBulkDeleteSignals} />
            <div className="signal-panel-toggle signal-panel-toggle-left" onClick={()=>{setShowLeftPanel(p=>!p);setShowRightPanel(false)}} style={{background:showLeftPanel?"rgba(6,214,224,0.15)":""}}>
              <span style={{color:"#06d6e0",fontSize:14}}>◆</span> Core AI
            </div>
            <div className="signal-panel-toggle signal-panel-toggle-right" onClick={()=>{setShowRightPanel(p=>!p);setShowLeftPanel(false)}} style={{background:showRightPanel?"rgba(16,185,129,0.15)":""}}>
              <span style={{color:"#10b981",fontSize:14}}>$</span> Fin AI
            </div>
          </div>}
          {page!=="dashboard"&&<>
          {page==="add"&&<AddInsight onAdd={i=>{setData(p=>[i,...p])}}/>}
          {page==="database"&&<InsightsTable key={filterKey} insights={allIntelligence} onSelect={i=>{setSel(i);setPage("detail")}} initialFilters={dbFilters} isAdmin={user.role==="admin"} onBulkDelete={handleBulkDeleteInsights}/>}
          {page==="detail"&&sel&&<InsightDetail insight={sel} isAdmin={user.role==="admin"} onBack={()=>setPage("database")} onUpdate={async u=>{
            try {
              const updated = await api.updateInsight(u.id, u);
              setData(p=>p.map(i=>i.id===updated.id?updated:i));
              setSel(updated);
            } catch(err){ console.error('Update failed:', err); }
          }} onDelete={async id=>{
            try {
              await api.deleteInsight(id);
              setData(p=>p.filter(i=>i.id!==id));
              setSel(null);
              setPage("database");
            } catch(err){ console.error('Delete failed:', err); throw err; }
          }}/>}
          {page==="report"&&<ReportGen insights={data}/>}
          {page==="admin"&&user.role==="admin"&&<AdminPanel insights={data} onRefresh={refreshData}/>}
          {page==="profile"&&<ProfilePage user={user}/>}
          </>}
        </div>
      </div>
    </div></>
  );
}
