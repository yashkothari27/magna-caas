const crypto = require("crypto");
const db     = require("../db/database");

const PARTNER_PREFIXES = {
  insurance:    "mcaas_ins",
  oem_supplier: "mcaas_oem",
  regulator:    "mcaas_gov",
};

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function generateRawKey(partnerType) {
  const prefix = PARTNER_PREFIXES[partnerType] || "mcaas_key";
  const secret = crypto.randomBytes(24).toString("hex");
  return `${prefix}_${secret}`;
}

function createApiKey({ partnerName, partnerType, oemScope, scopes, rateLimit, createdBy }) {
  if (!PARTNER_PREFIXES[partnerType]) {
    throw new Error(`Invalid partner type. Must be one of: ${Object.keys(PARTNER_PREFIXES).join(", ")}`);
  }
  const rawKey   = generateRawKey(partnerType);
  const keyHash  = sha256(rawKey);
  const keyPrefix = rawKey.slice(0, rawKey.indexOf("_", rawKey.indexOf("_") + 1) + 9); // e.g. mcaas_ins_a1b2c3d4

  db.prepare(`
    INSERT INTO api_keys (key_prefix, key_hash, partner_name, partner_type, oem_scope, scopes, rate_limit, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(keyPrefix, keyHash, partnerName, partnerType, oemScope || null, JSON.stringify(scopes), rateLimit || 60, createdBy || null);

  const row = db.prepare("SELECT id FROM api_keys WHERE key_hash = ?").get(keyHash);
  return { id: row.id, rawKey, prefix: keyPrefix };
}

function verifyApiKey(rawKey) {
  if (!rawKey) return null;
  const keyHash = sha256(rawKey);
  const row = db.prepare("SELECT * FROM api_keys WHERE key_hash = ?").get(keyHash);
  if (!row) return null;
  if (row.revoked_at) return null;

  db.prepare("UPDATE api_keys SET last_used_at = datetime('now') WHERE id = ?").run(row.id);

  return {
    id: row.id,
    partnerName: row.partner_name,
    partnerType: row.partner_type,
    oemScope:    row.oem_scope,
    scopes:      JSON.parse(row.scopes),
    rateLimit:   row.rate_limit,
  };
}

function listApiKeys() {
  return db.prepare(`
    SELECT id, key_prefix, partner_name, partner_type, oem_scope, scopes, rate_limit, created_at, last_used_at, revoked_at
    FROM api_keys ORDER BY created_at DESC
  `).all().map((k) => ({ ...k, scopes: JSON.parse(k.scopes), revoked: !!k.revoked_at }));
}

function revokeApiKey(id) {
  db.prepare("UPDATE api_keys SET revoked_at = datetime('now') WHERE id = ? AND revoked_at IS NULL").run(id);
}

module.exports = { createApiKey, verifyApiKey, listApiKeys, revokeApiKey, PARTNER_PREFIXES };
