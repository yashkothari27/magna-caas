const express = require("express");
const { param, body, validationResult } = require("express-validator");
const db = require("../db/database");
const blockchainService = require("../services/blockchainService");
const { authorizeRole } = require("../middleware/auth");
const { createApiKey, listApiKeys, revokeApiKey } = require("../services/apiKeyService");
const logger = require("../logger");

const router = express.Router();
router.use(authorizeRole("admin"));

const VALID_ROLES = ["engineer", "compliance_officer", "auditor", "regulator", "admin", "pending"];

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  next();
};

// GET /admin/users
router.get("/users", (req, res) => {
  const users = db.prepare(`
    SELECT id, email, full_name, role, oem_tenant, wallet_address, created_at, updated_at
    FROM users ORDER BY created_at DESC
  `).all();
  res.json({
    success: true,
    count: users.length,
    users: users.map(u => ({
      id: u.id, email: u.email, fullName: u.full_name, role: u.role,
      oemTenant: u.oem_tenant, walletAddress: u.wallet_address,
      createdAt: u.created_at, updatedAt: u.updated_at,
    })),
  });
});

// GET /admin/users/:id
router.get("/users/:id", [param("id").isInt(), validate], (req, res) => {
  const user = db.prepare("SELECT id, email, full_name, role, oem_tenant, wallet_address, created_at FROM users WHERE id = ?").get(req.params.id);
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({ success: true, user: { id: user.id, email: user.email, fullName: user.full_name, role: user.role, oemTenant: user.oem_tenant, walletAddress: user.wallet_address } });
});

// PUT /admin/users/:id/role
router.put(
  "/users/:id/role",
  [
    param("id").isInt(),
    body("role").isIn(VALID_ROLES),
    validate,
  ],
  async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      const { role } = req.body;
      const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
      if (!user) return res.status(404).json({ error: "User not found" });
      if (!user.wallet_address) return res.status(400).json({ error: "User has no wallet" });

      logger.info(`Admin assigning '${role}' to ${user.email}`);

      let onChainTx = null;
      const ON_CHAIN_ROLES = ["engineer", "compliance_officer", "auditor", "regulator"];
      if (ON_CHAIN_ROLES.includes(role)) {
        onChainTx = await blockchainService.grantUserRole(role, user.wallet_address);
      }

      db.prepare("UPDATE users SET role = ?, updated_at = datetime('now') WHERE id = ?").run(role, userId);
      const updated = db.prepare("SELECT id, email, full_name, role, oem_tenant, wallet_address FROM users WHERE id = ?").get(userId);

      res.json({
        success: true,
        message: `Role '${role}' assigned to ${user.email}`,
        user: { id: updated.id, email: updated.email, fullName: updated.full_name, role: updated.role, oemTenant: updated.oem_tenant, walletAddress: updated.wallet_address },
        onChain: onChainTx,
      });
    } catch (error) {
      logger.error(`PUT /admin/users/:id/role failed: ${error.message}`);
      res.status(500).json({ error: "Role assignment failed", detail: error.message });
    }
  }
);

// DELETE /admin/users/:id
router.delete("/users/:id", [param("id").isInt(), validate], (req, res) => {
  const user = db.prepare("SELECT id, email FROM users WHERE id = ?").get(req.params.id);
  if (!user) return res.status(404).json({ error: "User not found" });
  db.prepare("DELETE FROM users WHERE id = ?").run(req.params.id);
  logger.info(`Admin deleted user: ${user.email}`);
  res.json({ success: true, message: `User ${user.email} deleted.` });
});

const VALID_PARTNER_TYPES = ["insurance", "oem_supplier", "regulator"];
const VALID_SCOPES = ["vin_audit", "ota_status", "compliance_check"];

// GET /admin/api-keys — list all partner API keys (hashed; raw key never re-shown)
router.get("/api-keys", (req, res) => {
  res.json({ success: true, keys: listApiKeys() });
});

// POST /admin/api-keys — issue a new partner API key (raw key returned ONCE)
router.post(
  "/api-keys",
  [
    body("partnerName").isString().notEmpty(),
    body("partnerType").isIn(VALID_PARTNER_TYPES),
    body("scopes").isArray({ min: 1 }),
    body("scopes.*").isIn(VALID_SCOPES),
    body("oemScope").optional({ checkFalsy: true }).isString(),
    validate,
  ],
  (req, res) => {
    try {
      const { partnerName, partnerType, scopes, oemScope, rateLimit } = req.body;
      const result = createApiKey({
        partnerName, partnerType, scopes, oemScope,
        rateLimit: rateLimit || 60,
        createdBy: req.user.userId,
      });
      logger.info(`Admin issued API key for partner '${partnerName}' (${partnerType})`);
      res.status(201).json({
        success: true,
        message: "API key created. Copy it now — it will not be shown again.",
        apiKey: result.rawKey,
        prefix: result.prefix,
        id: result.id,
      });
    } catch (error) {
      logger.error(`POST /admin/api-keys failed: ${error.message}`);
      res.status(500).json({ success: false, error: "API key creation failed", detail: error.message });
    }
  }
);

// DELETE /admin/api-keys/:id — revoke a partner API key
router.delete("/api-keys/:id", [param("id").isInt(), validate], (req, res) => {
  revokeApiKey(req.params.id);
  logger.info(`Admin revoked API key id=${req.params.id}`);
  res.json({ success: true, message: "API key revoked." });
});

module.exports = router;
