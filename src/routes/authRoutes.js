const express  = require("express");
const { body, validationResult } = require("express-validator");
const { hashPassword, comparePassword } = require("../utils/passwordUtils");
const db = require("../db/database");
const { generateWallet, encryptPrivateKey } = require("../services/walletService");
const { issueToken, authenticateToken } = require("../middleware/auth");
const logger = require("../logger");

const router = express.Router();

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  next();
};

// POST /auth/register
router.post(
  "/register",
  [
    body("email").isEmail().normalizeEmail(),
    body("password").isLength({ min: 8 }),
    body("fullName").isString().trim().notEmpty(),
    validate,
  ],
  async (req, res) => {
    try {
      const { email, password, fullName, oemTenant } = req.body;

      const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
      if (existing) return res.status(409).json({ error: "Account already exists." });

      const passwordHash = await hashPassword(password);
      const { address, privateKey } = generateWallet();
      const { encrypted, iv, authTag } = encryptPrivateKey(privateKey);

      const result = db.prepare(`
        INSERT INTO users (email, password_hash, full_name, role, oem_tenant, wallet_address, encrypted_private_key, wallet_iv, wallet_auth_tag)
        VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?)
      `).run(email, passwordHash, fullName, oemTenant || "magna", address, encrypted, iv, authTag);

      const user = db.prepare("SELECT id, email, full_name, role, oem_tenant, wallet_address, created_at FROM users WHERE id = ?").get(result.lastInsertRowid);

      logger.info(`New user registered: ${email} | wallet: ${address}`);

      const token = issueToken(user);
      res.status(201).json({
        success: true,
        message: "Account created. Your blockchain wallet has been provisioned. An admin will assign your role.",
        user: { id: user.id, email: user.email, fullName: user.full_name, role: user.role, oemTenant: user.oem_tenant, walletAddress: user.wallet_address },
        token,
      });
    } catch (error) {
      logger.error(`POST /auth/register failed: ${error.message}`);
      res.status(500).json({ error: "Registration failed", detail: error.message });
    }
  }
);

// POST /auth/login
router.post(
  "/login",
  [
    body("email").isEmail().normalizeEmail(),
    body("password").notEmpty(),
    validate,
  ],
  async (req, res) => {
    try {
      const { email, password } = req.body;
      const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
      if (!user) return res.status(401).json({ error: "Invalid email or password." });

      const match = await comparePassword(password, user.password_hash);
      if (!match) {
        logger.warn(`Failed login: ${email}`);
        return res.status(401).json({ error: "Invalid email or password." });
      }

      logger.info(`Login: ${email} (${user.role})`);
      const token = issueToken(user);
      res.json({
        success: true,
        user: { id: user.id, email: user.email, fullName: user.full_name, role: user.role, oemTenant: user.oem_tenant, walletAddress: user.wallet_address },
        token,
      });
    } catch (error) {
      logger.error(`POST /auth/login failed: ${error.message}`);
      res.status(500).json({ error: "Login failed", detail: error.message });
    }
  }
);

// GET /auth/me
router.get("/me", authenticateToken, (req, res) => {
  const user = db.prepare("SELECT id, email, full_name, role, oem_tenant, wallet_address, created_at FROM users WHERE id = ?").get(req.user.userId);
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({
    success: true,
    user: { id: user.id, email: user.email, fullName: user.full_name, role: user.role, oemTenant: user.oem_tenant, walletAddress: user.wallet_address, createdAt: user.created_at },
  });
});

module.exports = router;
