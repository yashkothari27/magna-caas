const crypto = require("crypto");

const SALT_LENGTH = 16;
const ITERATIONS  = 100000;
const KEY_LENGTH  = 64;
const DIGEST      = "sha256";

async function hashPassword(password) {
  const salt = crypto.randomBytes(SALT_LENGTH).toString("base64");
  const hash = crypto
    .pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, DIGEST)
    .toString("base64");
  return `${salt}:${hash}`;
}

async function comparePassword(password, passwordHash) {
  const [salt, hash] = passwordHash.split(":");
  if (!salt || !hash) return false;
  const computedHash = crypto
    .pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, DIGEST)
    .toString("base64");
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(computedHash));
}

module.exports = { hashPassword, comparePassword };
