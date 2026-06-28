// Compliance-as-Code external API surface.
// Authenticated by partner API key (X-API-Key header), NOT employee JWT.
// Three consumer types: insurance (fault attribution), oem_supplier (OTA status),
// regulator/government (framework-level compliance check).
const express = require("express");
const { param, validationResult } = require("express-validator");
const { authenticateApiKey } = require("../middleware/apiKeyAuth");
const { getVehicleAudit } = require("../services/faultAttributionService");
const { getOemComplianceStatus } = require("../services/complianceCheckService");
const logger = require("../logger");

const router = express.Router();

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  next();
};

function checkOemScope(req, res, oemTenant) {
  if (req.apiKey.oemScope && oemTenant && oemTenant !== req.apiKey.oemScope) {
    res.status(403).json({ error: `This API key is scoped to '${req.apiKey.oemScope}' and cannot access records for '${oemTenant}'.` });
    return false;
  }
  return true;
}

// ══════════════════════════════════════════════════════════
// GET /external/v1/vin/:vin/audit — Insurance / forensic fault-attribution report
// ══════════════════════════════════════════════════════════
router.get(
  "/vin/:vin/audit",
  [param("vin").isString().isLength({ min: 5, max: 17 }), validate],
  authenticateApiKey("vin_audit"),
  async (req, res) => {
    try {
      const vin = req.params.vin.toUpperCase();
      const audit = await getVehicleAudit(vin);
      if (!checkOemScope(req, res, audit.oemTenant)) return;

      logger.info(`[external] vin_audit by ${req.apiKey.partnerName} (${req.apiKey.partnerType}) — VIN ${vin}`);
      res.json({ success: true, requestedBy: req.apiKey.partnerName, data: audit });
    } catch (error) {
      logger.error(`External vin_audit failed: ${error.message}`);
      res.status(500).json({ success: false, error: "Audit lookup failed", detail: error.message });
    }
  }
);

// ══════════════════════════════════════════════════════════
// GET /external/v1/vin/:vin/ota-status — OEM/Supplier software provenance lookup
// ══════════════════════════════════════════════════════════
router.get(
  "/vin/:vin/ota-status",
  [param("vin").isString().isLength({ min: 5, max: 17 }), validate],
  authenticateApiKey("ota_status", "vin_audit"),
  async (req, res) => {
    try {
      const vin = req.params.vin.toUpperCase();
      const audit = await getVehicleAudit(vin);
      if (!checkOemScope(req, res, audit.oemTenant)) return;

      const softwareEvents = audit.timeline.filter((e) => e.type === "OTA_UPDATE" || e.type === "SOFTWARE_ACTIVATION");
      const latest = softwareEvents[softwareEvents.length - 1] || null;

      logger.info(`[external] ota_status by ${req.apiKey.partnerName} (${req.apiKey.partnerType}) — VIN ${vin}`);
      res.json({
        success: true,
        requestedBy: req.apiKey.partnerName,
        data: {
          vin,
          oemTenant: audit.oemTenant,
          latestSoftwareEvent: latest,
          softwareHistory: softwareEvents,
        },
      });
    } catch (error) {
      logger.error(`External ota_status failed: ${error.message}`);
      res.status(500).json({ success: false, error: "OTA status lookup failed", detail: error.message });
    }
  }
);

// ══════════════════════════════════════════════════════════
// GET /external/v1/compliance/:oem — Regulator framework-level compliance check
// ══════════════════════════════════════════════════════════
router.get(
  "/compliance/:oem",
  [param("oem").isString().isLength({ min: 2, max: 40 }), validate],
  authenticateApiKey("compliance_check"),
  async (req, res) => {
    try {
      const oem = req.params.oem.toLowerCase();
      if (!checkOemScope(req, res, oem)) return;

      const status = await getOemComplianceStatus(oem);
      logger.info(`[external] compliance_check by ${req.apiKey.partnerName} (${req.apiKey.partnerType}) — OEM ${oem}`);
      res.json({ success: true, requestedBy: req.apiKey.partnerName, data: status });
    } catch (error) {
      logger.error(`External compliance_check failed: ${error.message}`);
      res.status(500).json({ success: false, error: "Compliance check failed", detail: error.message });
    }
  }
);

module.exports = router;
