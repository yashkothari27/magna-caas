const jwt    = require("jsonwebtoken");
const config = require("../config");
const logger = require("../logger");

const ROLES = {
  ENGINEER:           "engineer",
  COMPLIANCE_OFFICER: "compliance_officer",
  AUDITOR:            "auditor",
  REGULATOR:          "regulator",
  ADMIN:              "admin",
  PENDING:            "pending",
};

// Which event types each role may submit
const ROLE_ALLOWED_TYPES = {
  [ROLES.ENGINEER]:           ["OTA_UPDATE", "SUPPLY_CHAIN_EVENT", "SOFTWARE_ACTIVATION"],
  [ROLES.COMPLIANCE_OFFICER]: ["AI_ADAS_DECISION", "INCIDENT_EVIDENCE"],
};

function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    logger.warn(`Unauthenticated request from ${req.ip} to ${req.path}`);
    return res.status(401).json({
      error: "Authentication required",
      message: "Provide a Bearer token in the Authorization header.",
    });
  }

  jwt.verify(token, config.jwt.secret, (err, payload) => {
    if (err) {
      logger.warn(`Invalid token from ${req.ip}: ${err.message}`);
      return res.status(403).json({ error: "Invalid or expired token" });
    }
    req.user = payload;
    next();
  });
}

function authorizeRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Authentication required" });
    if (!allowedRoles.includes(req.user.role)) {
      logger.warn(`Forbidden: role '${req.user.role}' on ${req.path}`);
      return res.status(403).json({
        error: "Forbidden",
        message: `Role '${req.user.role}' is not permitted for this action.`,
        requiredRoles: allowedRoles,
      });
    }
    next();
  };
}

function authorizeEventType(req, res, next) {
  const { eventType } = req.body;
  if (!eventType) return next();

  const allowed = ROLE_ALLOWED_TYPES[req.user?.role] || [];
  if (!allowed.includes(eventType)) {
    logger.warn(`Role '${req.user?.role}' attempted to submit '${eventType}'`);
    return res.status(403).json({
      error: "Forbidden",
      message: `Your role ('${req.user?.role}') may not submit '${eventType}' events.`,
      allowedTypes: allowed,
    });
  }
  next();
}

function issueToken(user) {
  return jwt.sign(
    { userId: user.id, email: user.email, role: user.role, oemTenant: user.oem_tenant },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn || "24h" }
  );
}

module.exports = { authenticateToken, authorizeRole, authorizeEventType, issueToken, ROLES };
