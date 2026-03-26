import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import db from './db.js';
dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'ai-hub-secret-change-me';

export function generateToken(user) {
  return jwt.sign(
    { id: user.id, name: user.name, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

// Middleware: require valid JWT
export function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Middleware: require admin role
export function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// Middleware: check daily AI token limit and admin block
export function checkAiLimit(req, res, next) {
  const userRow = db.prepare('SELECT daily_token_limit, ai_blocked FROM users WHERE id = ?').get(req.user.id);
  if (!userRow) return res.status(401).json({ error: 'User not found' });

  if (userRow.ai_blocked) {
    return res.status(403).json({ error: 'AI access has been disabled for your account by an administrator.', code: 'ai_blocked' });
  }

  const today = new Date().toISOString().slice(0, 10);
  const { total } = db.prepare(
    "SELECT COALESCE(SUM(tokens), 0) as total FROM ai_logs WHERE actor = ? AND created_at >= ?"
  ).get(req.user.name, today);

  const limit = userRow.daily_token_limit || 100000;
  if (total >= limit) {
    return res.status(429).json({
      error: 'Daily AI token limit reached. Your limit resets at midnight.',
      code: 'ai_limit_exceeded',
      used: total,
      limit,
    });
  }
  next();
}
