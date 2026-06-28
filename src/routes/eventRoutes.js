const express = require("express");
const multer  = require("multer");
const { body, param, validationResult } = require("express-validator");
const blockchainService = require("../services/blockchainService");
const { authorizeRole, authorizeEventType } = require("../middleware/auth");
const { decryptPrivateKey } = require("../services/walletService");
const { uploadToIPFS, uploadJSONToIPFS, computeSHA256 } = require("../services/ipfsService");
const db     = require("../db/database");
const logger = require("../logger");

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 4 * 1024 * 1024 } });

function getUserPrivateKey(userId) {
  const user = db.prepare("SELECT encrypted_private_key, wallet_iv, wallet_auth_tag FROM users WHERE id = ?").get(userId);
  if (!user || !user.encrypted_private_key) throw new Error("User wallet not found");
  return decryptPrivateKey(user.encrypted_private_key, user.wallet_iv, user.wallet_auth_tag);
}

const router = express.Router();

// Block pending users from all event endpoints
router.use((req, res, next) => {
  if (req.user?.role === "pending") {
    return res.status(403).json({
      error: "Forbidden",
      message: "Your account is pending approval. Contact an admin to be assigned a role.",
    });
  }
  next();
});

const VALID_EVENT_TYPES = ["OTA_UPDATE", "AI_ADAS_DECISION", "SUPPLY_CHAIN_EVENT", "INCIDENT_EVIDENCE", "SOFTWARE_ACTIVATION"];

const EVENT_TYPE_INDEX = {
  OTA_UPDATE:          0,
  AI_ADAS_DECISION:    1,
  SUPPLY_CHAIN_EVENT:  2,
  INCIDENT_EVIDENCE:   3,
  SOFTWARE_ACTIVATION: 4,
};

const hashRegex = /^(0x)?[a-fA-F0-9]{64}$/;

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  next();
};

// ══════════════════════════════════════════════════════════
// POST /api/v1/events — Anchor a new compliance event hash
// ══════════════════════════════════════════════════════════
router.post(
  "/",
  [
    body("eventId").isString().notEmpty(),
    body("hash").matches(hashRegex),
    body("eventType").isIn(VALID_EVENT_TYPES),
    body("vehicleVIN").optional().isString().isLength({ max: 17 }),
    body("metadataCID").optional().isString(),
    validate,
  ],
  authorizeRole("engineer", "compliance_officer"),
  authorizeEventType,
  async (req, res) => {
    try {
      const { eventId, hash, eventType, vehicleVIN, metadataCID } = req.body;
      const typeIndex = EVENT_TYPE_INDEX[eventType];

      logger.info(`POST /events — id: ${eventId}, type: ${eventType}, VIN: ${vehicleVIN || "N/A"}, from: ${req.user?.email}`);

      const privateKey = getUserPrivateKey(req.user.userId);
      const result = await blockchainService.anchorEventAs(
        privateKey, eventId, hash, metadataCID || "", vehicleVIN || "", typeIndex
      );

      res.status(201).json({
        success: true,
        message: "Compliance event anchored on Reltime blockchain",
        data: { eventId, eventType, vehicleVIN, ...result },
      });
    } catch (error) {
      logger.error(`POST /events failed: ${error.message}`);
      if (error.message.includes("EventAlreadyExists")) {
        return res.status(409).json({ success: false, error: "Event already anchored. Use PUT to update." });
      }
      res.status(500).json({ success: false, error: "Failed to anchor event", detail: error.message });
    }
  }
);

// ══════════════════════════════════════════════════════════
// POST /api/v1/events/upload — Upload payload → IPFS → anchor hash
// ══════════════════════════════════════════════════════════
router.post(
  "/upload",
  authorizeRole("engineer", "compliance_officer"),
  upload.single("file"),
  authorizeEventType,
  async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ success: false, error: "No file uploaded." });

      const { eventId, eventType, vehicleVIN, oemTenant } = req.body;
      if (!eventId)                           return res.status(400).json({ success: false, error: "eventId is required" });
      if (!VALID_EVENT_TYPES.includes(eventType)) return res.status(400).json({ success: false, error: `eventType must be one of: ${VALID_EVENT_TYPES.join(", ")}` });

      logger.info(`POST /events/upload — id: ${eventId}, type: ${eventType}, VIN: ${vehicleVIN || "N/A"}, file: ${req.file.originalname}`);

      // 1. SHA-256 of file bytes
      const hash = computeSHA256(req.file.buffer);

      // 2. Upload to IPFS
      const { cid: fileCid, ipfsUrl, pinataUrl } = await uploadToIPFS(req.file.buffer, req.file.originalname, req.file.mimetype);
      logger.info(`IPFS upload: ${fileCid}`);

      // 3. Upload a structured metadata wrapper
      const metaWrapper = {
        fileCid,
        filename:       req.file.originalname,
        mimeType:       req.file.mimetype || "application/octet-stream",
        eventId,
        eventType,
        vehicleVIN:     vehicleVIN || "",
        oemTenant:      oemTenant  || req.user?.oemTenant || "magna",
        submittedBy:    req.user?.email,
        submittedAt:    new Date().toISOString(),
        complianceFramework: _frameworkForType(eventType),
      };
      const metadataCID = await uploadJSONToIPFS(metaWrapper, `caas-${eventId}.json`);
      logger.info(`Metadata JSON: ${metadataCID}`);

      // 4. Anchor on-chain
      const typeIndex  = EVENT_TYPE_INDEX[eventType];
      const privateKey = getUserPrivateKey(req.user.userId);
      const result     = await blockchainService.anchorEventAs(
        privateKey, eventId, hash, metadataCID, vehicleVIN || "", typeIndex
      );

      // 5. Track in local DB
      try {
        db.prepare("INSERT OR IGNORE INTO vehicle_events (event_id, event_type, vehicle_vin, oem_tenant, filename, submitted_by) VALUES (?, ?, ?, ?, ?, ?)")
          .run(eventId, eventType, vehicleVIN || "", oemTenant || req.user?.oemTenant || "magna", req.file.originalname, req.user.userId);
      } catch (dbErr) {
        logger.warn(`DB tracking failed: ${dbErr.message}`);
      }

      res.status(201).json({
        success: true,
        message: "Payload uploaded to IPFS and anchored on Reltime blockchain",
        data: {
          eventId, eventType, vehicleVIN: vehicleVIN || "",
          filename: req.file.originalname, sizeBytes: req.file.size,
          hash, fileCid, metadataCID, ipfsUrl, pinataUrl,
          complianceFramework: _frameworkForType(eventType),
          transactionHash: result.transactionHash,
          blockNumber:     result.blockNumber,
          status:          result.status,
        },
      });
    } catch (error) {
      logger.error(`POST /events/upload failed: ${error.message}`);
      if (error.message.includes("EventAlreadyExists")) {
        return res.status(409).json({ success: false, error: "Event already anchored. Use PUT to update." });
      }
      if (error.message.includes("PINATA_JWT")) {
        return res.status(503).json({ success: false, error: "IPFS not configured. Set PINATA_JWT." });
      }
      res.status(500).json({ success: false, error: "Upload failed", detail: error.message });
    }
  }
);

// ══════════════════════════════════════════════════════════
// GET /api/v1/events/list — List all anchored events
// ══════════════════════════════════════════════════════════
router.get("/list", async (req, res) => {
  try {
    const userId = Number(req.user.userId);
    const rows   = db.prepare(`
      SELECT e.event_id, e.event_type, e.vehicle_vin, e.oem_tenant, e.filename, e.submitted_at,
             e.submitted_by, u.full_name as submitter_name
      FROM vehicle_events e
      JOIN users u ON u.id = e.submitted_by
      ORDER BY e.submitted_at DESC
    `).all();
    const result = rows.map(r => ({ ...r, is_mine: Number(r.submitted_by) === userId }));
    res.json({ success: true, data: result });
  } catch (e) {
    logger.error(`GET /events/list failed: ${e.message}`);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ══════════════════════════════════════════════════════════
// GET /api/v1/events/check/:eventId/:hash — Quick read-only integrity check
// (must be before /:eventId to avoid route shadowing)
// ══════════════════════════════════════════════════════════
router.get(
  "/check/:eventId/:hash",
  [
    param("eventId").isString().notEmpty(),
    param("hash").matches(hashRegex),
    validate,
  ],
  async (req, res) => {
    try {
      const { eventId, hash } = req.params;
      const result            = await blockchainService.checkIntegrity(eventId, hash);
      res.json({ success: true, data: result });
    } catch (error) {
      logger.error(`GET /events/check failed: ${error.message}`);
      res.status(500).json({ success: false, error: "Integrity check failed", detail: error.message });
    }
  }
);

// ══════════════════════════════════════════════════════════
// GET /api/v1/events/history/:eventId — All hash versions
// (must be before /:eventId to avoid route shadowing)
// ══════════════════════════════════════════════════════════
router.get(
  "/history/:eventId",
  [param("eventId").isString().notEmpty(), validate],
  async (req, res) => {
    try {
      const result = await blockchainService.getEventHistory(req.params.eventId);
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// ══════════════════════════════════════════════════════════
// GET /api/v1/events/audit/summary — Compliance dashboard
// (must be before /:eventId to avoid route shadowing)
// ══════════════════════════════════════════════════════════
router.get(
  "/audit/summary",
  authorizeRole("auditor", "regulator", "admin"),
  async (req, res) => {
    try {
      const summary = req.user.role === "admin"
        ? await blockchainService.getComplianceSummary()
        : await blockchainService.getComplianceSummaryAs(getUserPrivateKey(req.user.userId));
      res.json({ success: true, data: summary });
    } catch (error) {
      logger.error(`GET /events/audit/summary failed: ${error.message}`);
      res.status(500).json({ success: false, error: "Audit summary failed", detail: error.message });
    }
  }
);

// ══════════════════════════════════════════════════════════
// GET /api/v1/events/vin/:vin/audit — Fault attribution audit (internal, JWT)
// Same engine as the external /external/v1/vin/:vin/audit endpoint, for use
// inside the app by auditors/regulators/admins without issuing an API key.
// (must be before /:eventId to avoid route shadowing)
// ══════════════════════════════════════════════════════════
router.get(
  "/vin/:vin/audit",
  authorizeRole("auditor", "regulator", "admin", "compliance_officer"),
  async (req, res) => {
    try {
      const { getVehicleAudit } = require("../services/faultAttributionService");
      const vin = req.params.vin.toUpperCase();
      const audit = await getVehicleAudit(vin);
      res.json({ success: true, data: audit });
    } catch (error) {
      logger.error(`GET /events/vin/${req.params.vin}/audit failed: ${error.message}`);
      res.status(500).json({ success: false, error: "Fault attribution audit failed", detail: error.message });
    }
  }
);

// ══════════════════════════════════════════════════════════
// GET /api/v1/events/:eventId — Retrieve anchored event
// ══════════════════════════════════════════════════════════
router.get(
  "/:eventId",
  [param("eventId").isString().notEmpty(), validate],
  async (req, res) => {
    try {
      const { eventId } = req.params;
      const exists = await blockchainService.eventExists(eventId);
      if (!exists) return res.status(404).json({ success: false, error: `Event '${eventId}' not found` });
      const record = await blockchainService.getEvent(eventId);
      res.json({ success: true, data: record });
    } catch (error) {
      logger.error(`GET /events/${req.params.eventId} failed: ${error.message}`);
      res.status(500).json({ success: false, error: "Failed to retrieve event", detail: error.message });
    }
  }
);

// ══════════════════════════════════════════════════════════
// PUT /api/v1/events/:eventId — Update event hash
// ══════════════════════════════════════════════════════════
router.put(
  "/:eventId",
  [
    param("eventId").isString().notEmpty(),
    body("hash").matches(hashRegex),
    body("metadataCID").optional().isString(),
    validate,
  ],
  authorizeRole("engineer", "compliance_officer"),
  async (req, res) => {
    try {
      const { eventId }              = req.params;
      const { hash, metadataCID }    = req.body;
      const privateKey               = getUserPrivateKey(req.user.userId);
      const result                   = await blockchainService.updateEventAs(privateKey, eventId, hash, metadataCID || "");
      res.json({ success: true, message: "Event hash updated", data: { eventId, ...result } });
    } catch (error) {
      logger.error(`PUT /events/${req.params.eventId} failed: ${error.message}`);
      if (error.message.includes("EventNotFound")) {
        return res.status(404).json({ success: false, error: "Event not found. Use POST to create." });
      }
      res.status(500).json({ success: false, error: "Update failed", detail: error.message });
    }
  }
);

// ══════════════════════════════════════════════════════════
// POST /api/v1/events/verify — Verify integrity (on-chain audit event)
// ══════════════════════════════════════════════════════════
router.post(
  "/verify",
  [
    body("eventId").isString().notEmpty(),
    body("hash").matches(hashRegex),
    validate,
  ],
  authorizeRole("compliance_officer", "regulator"),
  async (req, res) => {
    try {
      const { eventId, hash } = req.body;
      const privateKey        = getUserPrivateKey(req.user.userId);
      const result            = await blockchainService.verifyIntegrityAs(privateKey, eventId, hash);
      res.json({ success: true, data: result });
    } catch (error) {
      logger.error(`POST /events/verify failed: ${error.message}`);
      res.status(500).json({ success: false, error: "Verification failed", detail: error.message });
    }
  }
);

// ══════════════════════════════════════════════════════════
// GET /api/v1/events/:eventId/payload — Fetch IPFS payload
// ══════════════════════════════════════════════════════════
router.get(
  "/:eventId/payload",
  [param("eventId").isString().notEmpty(), validate],
  async (req, res) => {
    try {
      const { eventId } = req.params;
      const exists = await blockchainService.eventExists(eventId);
      if (!exists) return res.status(404).json({ success: false, error: `Event '${eventId}' not found` });

      const record = await blockchainService.getEvent(eventId);
      if (!record.metadataCID) return res.status(404).json({ success: false, error: "No IPFS CID for this event" });

      const ipfsRes = await fetch(`https://gateway.pinata.cloud/ipfs/${record.metadataCID}`);
      if (!ipfsRes.ok) return res.status(502).json({ success: false, error: `IPFS fetch failed (${ipfsRes.status})` });

      const contentType = ipfsRes.headers.get("content-type") || "";
      const text        = await ipfsRes.text();

      if (contentType.includes("json")) {
        try {
          const parsed = JSON.parse(text);
          return res.json({ success: true, data: { eventId, metadataCID: record.metadataCID, vehicleVIN: record.vehicleVIN, eventTypeName: record.eventTypeName, payload: parsed } });
        } catch {}
      }

      res.setHeader("Content-Type", contentType || "application/octet-stream");
      res.send(text);
    } catch (error) {
      logger.error(`GET /events/:eventId/payload failed: ${error.message}`);
      res.status(500).json({ success: false, error: "Payload retrieval failed", detail: error.message });
    }
  }
);

// ── Helper ──
function _frameworkForType(eventType) {
  const map = {
    OTA_UPDATE:          "UNECE_R155_R156",
    AI_ADAS_DECISION:    "EU_AI_ACT",
    SUPPLY_CHAIN_EVENT:  "SDVERSE_NIS2",
    INCIDENT_EVIDENCE:   "LIABILITY_AI_DIRECTIVE",
    SOFTWARE_ACTIVATION: "UNECE_R156_CVR",
  };
  return map[eventType] || "GENERAL";
}

module.exports = router;
