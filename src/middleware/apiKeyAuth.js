const { verifyApiKey } = require("../services/apiKeyService");
const logger = require("../logger");

function authenticateApiKey(...requiredScopes) {
  return (req, res, next) => {
    const rawKey = req.headers["x-api-key"];
    if (!rawKey) {
      return res.status(401).json({ error: "Missing X-API-Key header" });
    }

    const keyInfo = verifyApiKey(rawKey);
    if (!keyInfo) {
      logger.warn(`Invalid/revoked API key attempt on ${req.path}`);
      return res.status(401).json({ error: "Invalid or revoked API key" });
    }

    if (requiredScopes.length && !requiredScopes.some((s) => keyInfo.scopes.includes(s))) {
      return res.status(403).json({
        error: "API key does not have the required scope for this endpoint",
        requiredScopes,
        grantedScopes: keyInfo.scopes,
      });
    }

    req.apiKey = keyInfo;
    next();
  };
}

module.exports = { authenticateApiKey };
