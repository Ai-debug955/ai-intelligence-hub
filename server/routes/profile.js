import { Router } from 'express';
import db from '../db.js';
import { requireAuth } from '../auth.js';

const router = Router();

// GET /api/profile — get current user's profile with stats, timeline, badges, expertise
router.get('/', requireAuth, (req, res) => {
  const userId = req.user.id;
  const userName = req.user.name;

  // Basic info
  const user = db.prepare('SELECT id, name, email, role, created_at FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  // Contribution stats
  const submitted = db.prepare('SELECT COUNT(*) as count FROM insights WHERE submitted_by = ?').get(userName).count;
  const approved = db.prepare('SELECT COUNT(*) as count FROM insights WHERE submitted_by = ? AND needs_review = 0').get(userName).count;
  const highImpact = db.prepare('SELECT COUNT(*) as count FROM insights WHERE submitted_by = ? AND impact = ?').get(userName, 'High').count;
  const reviewed = db.prepare('SELECT COUNT(*) as count FROM insights WHERE reviewed_by = ?').get(userName).count;

  // Last activity
  const lastSubmitted = db.prepare('SELECT created_at FROM insights WHERE submitted_by = ? ORDER BY created_at DESC LIMIT 1').get(userName);
  const lastReviewed = db.prepare('SELECT review_date FROM reviews WHERE reviewer = ? ORDER BY review_date DESC LIMIT 1').get(userName);
  const lastActivity = lastSubmitted?.created_at && lastReviewed?.review_date
    ? (lastSubmitted.created_at > lastReviewed.review_date ? lastSubmitted.created_at : lastReviewed.review_date)
    : (lastSubmitted?.created_at || lastReviewed?.review_date || user.created_at);

  // Activity timeline — last 20 actions
  const submittedInsights = db.prepare(
    'SELECT id, title, created_at, category, impact FROM insights WHERE submitted_by = ? ORDER BY created_at DESC LIMIT 15'
  ).all(userName).map(i => ({
    type: 'submitted',
    title: i.title,
    date: i.created_at,
    category: i.category,
    impact: i.impact,
    insightId: i.id
  }));

  const reviewedInsights = db.prepare(`
    SELECT r.review_date, i.title, i.id as insight_id, i.category
    FROM reviews r JOIN insights i ON r.insight_id = i.id
    WHERE r.reviewer = ?
    ORDER BY r.review_date DESC LIMIT 15
  `).all(userName).map(r => ({
    type: 'reviewed',
    title: r.title,
    date: r.review_date,
    category: r.category,
    insightId: r.insight_id
  }));

  // Merge and sort by date
  const timeline = [...submittedInsights, ...reviewedInsights]
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 20);

  // Badges
  const badges = [];
  if (submitted >= 1) badges.push({ id: 'first_intel', name: 'First Intel', icon: '🎯', desc: 'Submitted first insight', earned: true });
  if (submitted >= 5) badges.push({ id: 'contributor', name: 'Contributor', icon: '📝', desc: 'Submitted 5 insights', earned: true });
  if (submitted >= 10) badges.push({ id: 'ai_scout', name: 'AI Scout', icon: '🔭', desc: 'Submitted 10 insights', earned: true });
  if (submitted >= 25) badges.push({ id: 'intel_machine', name: 'Intel Machine', icon: '⚡', desc: 'Submitted 25 insights', earned: true });
  if (reviewed >= 5) badges.push({ id: 'reviewer', name: 'Reviewer', icon: '✅', desc: 'Reviewed 5 insights', earned: true });
  if (reviewed >= 20) badges.push({ id: 'research_analyst', name: 'Research Analyst', icon: '🔬', desc: 'Reviewed 20 insights', earned: true });
  if (highImpact >= 3) badges.push({ id: 'impact_finder', name: 'Impact Finder', icon: '💎', desc: '3 high-impact insights', earned: true });
  if (highImpact >= 5) badges.push({ id: 'high_impact_hunter', name: 'High Impact Hunter', icon: '🏆', desc: '5 high-impact insights', earned: true });

  // Upcoming badges (not yet earned)
  if (submitted < 10) badges.push({ id: 'ai_scout', name: 'AI Scout', icon: '🔭', desc: `Submit ${10 - submitted} more insights`, earned: false, progress: submitted, target: 10 });
  if (reviewed < 20 && reviewed < 5) badges.push({ id: 'reviewer', name: 'Reviewer', icon: '✅', desc: `Review ${5 - reviewed} more insights`, earned: false, progress: reviewed, target: 5 });
  if (highImpact < 5) badges.push({ id: 'high_impact_hunter', name: 'High Impact Hunter', icon: '🏆', desc: `${5 - highImpact} more high-impact insights`, earned: false, progress: highImpact, target: 5 });

  // Expertise tags — extract from user's submitted insights' tags and categories
  const tagRows = db.prepare('SELECT tags, category FROM insights WHERE submitted_by = ?').all(userName);
  const tagMap = {};
  for (const row of tagRows) {
    // Count categories
    tagMap[row.category] = (tagMap[row.category] || 0) + 1;
    // Count individual tags
    if (row.tags) {
      row.tags.split(',').forEach(t => {
        const tag = t.trim();
        if (tag) tagMap[tag] = (tagMap[tag] || 0) + 1;
      });
    }
  }
  const expertiseTags = Object.entries(tagMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([name, count]) => ({ name, count }));

  res.json({
    profile: {
      ...user,
      stats: { submitted, approved, highImpact, reviewed, lastActivity },
      timeline,
      badges,
      expertiseTags
    }
  });
});

export default router;
