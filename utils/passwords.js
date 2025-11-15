const argon2 = require('argon2');

const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456, // ~19 MB
  timeCost: 2,
  parallelism: 1
};

async function hashPassword(plain) {
  return argon2.hash(plain, ARGON2_OPTIONS);
}

async function verifyPassword(plain, hash) {
  if (!hash) return false;
  return argon2.verify(hash, plain);
}

module.exports = {
  hashPassword,
  verifyPassword
};
