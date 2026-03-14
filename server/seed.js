import db from './db.js';
import bcrypt from 'bcryptjs';

// ─── PASTE YOUR EXPORT DATA HERE ────────────────────────────────────
const EXPORT = {
  "users": [
    {
      "id": 1,
      "name": "Ruturaj",
      "email": "ruturaj@company.com",
      "role": "admin",
      "active": 1,
      "created_at": "2026-03-14 21:44:11"
    },
    {
      "id": 2,
      "name": "Example User",
      "email": "example1@company.com",
      "role": "user",
      "active": 1,
      "created_at": "2026-03-14 21:44:11"
    }
  ],
  "insights": [],
  "reviews": [],
  "reports": [],
  "panel_signals": [],
  "ai_logs": []
};

// ─── SEED USERS ─────────────────────────────────────────────────────
const DEFAULT_PASSWORD = 'welcome123';

for (const user of EXPORT.users) {
  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(user.email);
  if (!exists) {
    const password = user.email === 'ruturaj@company.com' ? 'admin123' : DEFAULT_PASSWORD;
    const hash = bcrypt.hashSync(password, 10);
    db.prepare('INSERT INTO users (name, email, password_hash, role, active) VALUES (?, ?, ?, ?, ?)').run(
      user.name, user.email, hash, user.role, user.active
    );
    console.log(`✅ Created user: ${user.email}`);
  }
}

// ─── SEED INSIGHTS ──────────────────────────────────────────────────
if (EXPORT.insights.length > 0) {
  const count = db.prepare('SELECT COUNT(*) as n FROM insights').get().n;
  if (count === 0) {
    const stmt = db.prepare(`INSERT INTO insights (id, title, summary, description, category, impact, tags, sources, key_points, submitted_by, reviewed_by, created_at, needs_review, entry_type, reviewer_notes, reviewed_at) VALUES (@id, @title, @summary, @description, @category, @impact, @tags, @sources, @key_points, @submitted_by, @reviewed_by, @created_at, @needs_review, @entry_type, @reviewer_notes, @reviewed_at)`);
    db.transaction(() => { for (const row of EXPORT.insights) stmt.run(row); })();
    console.log(`✅ Seeded ${EXPORT.insights.length} insights`);
  }
}

// ─── SEED REVIEWS ───────────────────────────────────────────────────
if (EXPORT.reviews.length > 0) {
  const count = db.prepare('SELECT COUNT(*) as n FROM reviews').get().n;
  if (count === 0) {
    const stmt = db.prepare(`INSERT INTO reviews (insight_id, reviewer, summary, key_points, review_date) VALUES (@insight_id, @reviewer, @summary, @key_points, @review_date)`);
    db.transaction(() => { for (const row of EXPORT.reviews) stmt.run(row); })();
    console.log(`✅ Seeded ${EXPORT.reviews.length} reviews`);
  }
}

// ─── SEED REPORTS ───────────────────────────────────────────────────
if (EXPORT.reports.length > 0) {
  const count = db.prepare('SELECT COUNT(*) as n FROM reports').get().n;
  if (count === 0) {
    const stmt = db.prepare(`INSERT INTO reports (report_content, generated_at, generated_by) VALUES (@report_content, @generated_at, @generated_by)`);
    db.transaction(() => { for (const row of EXPORT.reports) stmt.run(row); })();
    console.log(`✅ Seeded ${EXPORT.reports.length} reports`);
  }
}

// ─── SEED PANEL SIGNALS ────────────────────────────────────────────
if (EXPORT.panel_signals.length > 0) {
  const count = db.prepare('SELECT COUNT(*) as n FROM panel_signals').get().n;
  if (count === 0) {
    const stmt = db.prepare(`INSERT INTO panel_signals (title, url, panel, added_by, created_at) VALUES (@title, @url, @panel, @added_by, @created_at)`);
    db.transaction(() => { for (const row of EXPORT.panel_signals) stmt.run(row); })();
    console.log(`✅ Seeded ${EXPORT.panel_signals.length} signals`);
  }
}

// ─── SEED AI LOGS ──────────────────────────────────────────────────
if (EXPORT.ai_logs.length > 0) {
  const count = db.prepare('SELECT COUNT(*) as n FROM ai_logs').get().n;
  if (count === 0) {
    const stmt = db.prepare(`INSERT INTO ai_logs (type, tokens, actor, created_at) VALUES (@type, @tokens, @actor, @created_at)`);
    db.transaction(() => { for (const row of EXPORT.ai_logs) stmt.run(row); })();
    console.log(`✅ Seeded ${EXPORT.ai_logs.length} ai_logs`);
  }
}

console.log('🏁 Seed complete');
process.exit(0);