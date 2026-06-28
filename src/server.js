const express      = require("express");
const helmet       = require("helmet");
const cors         = require("cors");
const rateLimit    = require("express-rate-limit");
const path         = require("path");
const config       = require("./config");
const logger       = require("./logger");
const { authenticateToken } = require("./middleware/auth");
const eventRoutes  = require("./routes/eventRoutes");
const authRoutes   = require("./routes/authRoutes");
const adminRoutes  = require("./routes/adminRoutes");
const externalRoutes = require("./routes/externalRoutes");
const blockchainService = require("./services/blockchainService");

const app = express();

// Gate all requests behind startup readiness (DB init + blockchain connect).
// Critical on serverless: a cold-started container's first request can arrive
// before async init finishes; without this it would fail with "DB not initialized".
let appReady;
app.use((req, res, next) => {
  appReady.then(() => next()).catch((err) => {
    res.status(503).json({ error: "Service initializing, please retry shortly.", detail: err.message });
  });
});

app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: config.corsOrigins }));
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "../public")));

app.use(["/api/", "/external/"], (_req, res, next) => {
  res.setHeader("Content-Security-Policy", "default-src 'none'");
  next();
});

const limiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 100,
  message: { error: "Too many requests, please try again later." },
});
app.use("/api/", limiter);

const externalLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 60,
  message: { error: "Too many requests, please try again later." },
});
app.use("/external/", externalLimiter);

// Web UI
app.get("/", (_req, res) => res.redirect(302, "/app"));
app.get("/app", (_req, res) => res.sendFile(path.join(__dirname, "../public/app.html")));
app.get("/favicon.ico", (_req, res) => res.status(204).end());

// Health
app.get("/health", async (req, res) => {
  const health     = await blockchainService.getHealth();
  const statusCode = health.status === "healthy" ? 200 : 503;
  res.status(statusCode).json(health);
});

// Debug
app.get("/health/debug", (req, res) => {
  const db        = require("./db/database");
  const userCount = db.prepare("SELECT COUNT(*) as count FROM users").get().count;
  const roles     = db.prepare("SELECT role, COUNT(*) as n FROM users GROUP BY role").all();
  res.json({
    isConnected: blockchainService.isConnected,
    initError:   blockchainService.initError,
    initLog:     blockchainService.initLog,
    userCount,
    roles,
    env: {
      WALLET_ENCRYPTION_KEY: !!process.env.WALLET_ENCRYPTION_KEY,
      JWT_SECRET:            !!process.env.JWT_SECRET,
      CONTRACT_ADDRESS:      !!process.env.CONTRACT_ADDRESS,
      RELTIME_RPC_URL:       !!process.env.RELTIME_RPC_URL,
      PINATA_JWT:            !!process.env.PINATA_JWT,
    },
    timestamp: new Date().toISOString(),
  });
});

// Routes
app.use("/api/v1/auth",   authRoutes);
app.use("/api/v1/events", authenticateToken, eventRoutes);
app.use("/api/v1/admin",  authenticateToken, adminRoutes);

// External Compliance-as-Code API — partner API-key auth, not employee JWT.
app.use("/external/v1", externalRoutes);

// 404
app.use((req, res) => res.status(404).json({ error: "Endpoint not found" }));

// Error handler
app.use((err, req, res, next) => {
  logger.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

// Startup
const db = require("./db/database");
const { seedUsers } = require("../scripts/seed-users");
const { seedDemoEventsLocal } = require("../scripts/seed-demo-events-local");

async function startServer() {
  await db.init();
  logger.info("Database initialized");

  const userCount = db.prepare("SELECT COUNT(*) as count FROM users").get()?.count || 0;
  if (userCount === 0) {
    try {
      await seedUsers(true);
      logger.info("Test users auto-seeded");
    } catch (err) {
      logger.error("Auto-seed (users) failed:", err.message);
    }
  }

  const eventCount = db.prepare("SELECT COUNT(*) as count FROM vehicle_events").get()?.count || 0;
  if (eventCount === 0) {
    try {
      await seedDemoEventsLocal(true);
      logger.info("Demo event index auto-seeded");
    } catch (err) {
      logger.error("Auto-seed (events) failed:", err.message);
    }
  }

  await blockchainService.initialize();
  logger.info("Blockchain service initialized");
}

appReady = startServer();

if (require.main === module) {
  appReady
    .then(() => {
      console.log(`
  ╔══════════════════════════════════════════════════════════════╗
  ║   Magna CaaS — Vehicle Compliance Blockchain Service        ║
  ║   Powered by Reltime DCI · Chain ID: 32323                  ║
  ║   UNECE R155/R156 · EU AI Act · SDVerse · US CVR            ║
  ╚══════════════════════════════════════════════════════════════╝
      `);
      app.listen(config.port, () => {
        logger.info(`Server running on port ${config.port}`);
        logger.info(`Health:  http://localhost:${config.port}/health`);
        logger.info(`App UI:  http://localhost:${config.port}/app`);
        logger.info(`API:     http://localhost:${config.port}/api/v1/events`);
      });
    })
    .catch((err) => {
      logger.error("Failed to start:", err.message);
      process.exit(1);
    });
}

module.exports = app;
