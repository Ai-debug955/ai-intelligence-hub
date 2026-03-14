import db from './db.js';
import bcrypt from 'bcryptjs';

// ─── SEED ADMIN USER ────────────────────────────────────────────────
const adminEmail = 'ruturaj@company.com';
const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(adminEmail);

if (!existing) {
  const hash = bcrypt.hashSync('admin123', 10);
  db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)').run(
    'Ruturaj', adminEmail, hash, 'admin'
  );
  console.log('✅ Admin user created: ruturaj@company.com / admin123');
} else {
  console.log('ℹ️  Admin user already exists');
}

// ─── SEED EXAMPLE USER ─────────────────────────────────────────────
const exampleEmail = 'example1@company.com';
const existingExample = db.prepare('SELECT id FROM users WHERE email = ?').get(exampleEmail);

if (!existingExample) {
  const hash = bcrypt.hashSync('example123', 10);
  db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)').run(
    'Example User', exampleEmail, hash, 'user'
  );
  console.log('✅ Example user created: example@company.com / example123');
} else {
  console.log('ℹ️  Example user already exists');
}

console.log('🏁 Seed complete');
process.exit(0);