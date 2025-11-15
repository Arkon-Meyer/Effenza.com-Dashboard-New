const db = require('../database');
const { hashPassword } = require('../utils/passwords');

(async () => {
  try {
    // Ensure password_hash column exists
    await db.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash text");

    const email = 'demo.user@example.com';
    const name = 'Demo User';
    const plain = 'test';

    const hash = await hashPassword(plain);

    // Unique index on email (safe if already exists)
    try {
      await db.query("CREATE UNIQUE INDEX IF NOT EXISTS users_email_uidx ON users(lower(email))");
    } catch (_) {}

    // Upsert demo user
    const sql = `
      INSERT INTO users (name, email, password_hash)
      VALUES ($1, $2, $3)
      ON CONFLICT (email) DO UPDATE
      SET name = EXCLUDED.name,
          password_hash = EXCLUDED.password_hash
      RETURNING id, email
    `;
    const r = await db.query(sql, [name, email, hash]);
    console.log('✅ Seeded demo Argon2id user:', r.rows[0]);
    process.exit(0);
  } catch (e) {
    console.error('❌ seed failed:', e.message);
    process.exit(1);
  }
})();
