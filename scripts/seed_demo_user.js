#!/usr/bin/env node
// scripts/seed_demo_user.js
'use strict';

require('dotenv').config({ override: true, quiet: true });
const argon2 = require('argon2');
const db = require('../database');

async function main() {
  const email = process.env.DEMO_USER_EMAIL || 'demo.user@example.com';
  const password = process.env.DEMO_USER_PASSWORD || 'test';
  const name = process.env.DEMO_USER_NAME || 'Demo User';

  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1
  });

  const { rows } = await db.query(
    `
    INSERT INTO users (name, email, password_hash, org_id)
    VALUES ($1, $2, $3, 1)
    ON CONFLICT (email)
    DO UPDATE SET
      name = EXCLUDED.name,
      password_hash = EXCLUDED.password_hash
    RETURNING id, email;
    `,
    [name, email, passwordHash]
  );

  console.log('✅ Seeded demo Argon2id user:', rows[0]);
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ seed_demo_user:', err.message || err);
  process.exit(1);
});
