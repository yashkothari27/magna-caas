// Lightweight local-index seeder — no IPFS/blockchain calls.
// Used to repopulate the vehicle_events display index on serverless cold starts
// (the events themselves are already permanently anchored on Reltime mainnet;
// this just restores the off-chain index used by the Dashboard/Event Log UI).
const db = require("../src/db/database");

const SUBMITTER_EMAIL = {
  engineer1:   "stefan.weber@magna.com",
  engineer2:   "yuki.tanaka@magna.com",
  compliance1: "claire.dubois@magna.com",
  compliance2: "james.okafor@magna.com",
};

const EVENTS = [
  { id: "BMW-OTA-2026-0091", type: "OTA_UPDATE", oem: "bmw", vin: "WBA5R7C50PFH23491", file: "bmw-adas-gateway-v4.3.0.json", submitter: "engineer1", daysAgo: 62 },
  { id: "MB-OTA-2026-0048", type: "OTA_UPDATE", oem: "mercedes", vin: "WDD2223861A678234", file: "mbux-infotainment-2024.12.json", submitter: "engineer2", daysAgo: 55 },
  { id: "VW-OTA-2026-0117", type: "OTA_UPDATE", oem: "volkswagen", vin: "WVWZZZE2ZPW784512", file: "id4-bms-v1.8.3.json", submitter: "engineer1", daysAgo: 48 },
  { id: "GM-OTA-2026-0073", type: "OTA_UPDATE", oem: "gm", vin: "1GNS4PKD3LR556231", file: "onstar-telematics-v3.5.0.json", submitter: "engineer2", daysAgo: 39 },
  { id: "FORD-OTA-2026-0029", type: "OTA_UPDATE", oem: "ford", vin: "1FTFW1E89PFA77231", file: "sync4-bluecruise-v5.1.2.json", submitter: "engineer1", daysAgo: 21 },
  { id: "STLA-OTA-2026-0055", type: "OTA_UPDATE", oem: "stellantis", vin: "1C4RJFBG6PC998123", file: "jeep-uconnect5-v2.3.1.json", submitter: "engineer2", daysAgo: 9 },
  { id: "MAGNA-SCM-2026-0142", type: "SUPPLY_CHAIN_EVENT", oem: "magna", vin: "", file: "magna-radar-batch-qc-0142.json", submitter: "engineer1", daysAgo: 58 },
  { id: "BMW-SCM-2026-0066", type: "SUPPLY_CHAIN_EVENT", oem: "bmw", vin: "WBA5R7C50PFH23491", file: "bmw-radar-module-cert.json", submitter: "engineer2", daysAgo: 51 },
  { id: "MB-SCM-2026-0034", type: "SUPPLY_CHAIN_EVENT", oem: "mercedes", vin: "WDD2223861A678234", file: "mb-camera-module-batch.json", submitter: "engineer1", daysAgo: 44 },
  { id: "TOYOTA-SCM-2026-0019", type: "SUPPLY_CHAIN_EVENT", oem: "toyota", vin: "4T1G11AK0PU556231", file: "toyota-battery-cell-trace.json", submitter: "engineer2", daysAgo: 33 },
  { id: "GM-SCM-2026-0081", type: "SUPPLY_CHAIN_EVENT", oem: "gm", vin: "1GNS4PKD3LR556231", file: "gm-ultracruise-soc-batch.json", submitter: "engineer1", daysAgo: 17 },
  { id: "FORD-SCM-2026-0027", type: "SUPPLY_CHAIN_EVENT", oem: "ford", vin: "1FTFW1E89PFA77231", file: "ford-brake-by-wire-cert.json", submitter: "engineer2", daysAgo: 5 },
  { id: "BMW-ADAS-2026-0203", type: "AI_ADAS_DECISION", oem: "bmw", vin: "WBA5R7C50PFH23491", file: "bmw-lka-decision-0203.json", submitter: "compliance1", daysAgo: 60 },
  { id: "MB-ADAS-2026-0091", type: "AI_ADAS_DECISION", oem: "mercedes", vin: "WDD2223861A678234", file: "mb-drivepilot-decision-0091.json", submitter: "compliance2", daysAgo: 52 },
  { id: "TOYOTA-ADAS-2026-0044", type: "AI_ADAS_DECISION", oem: "toyota", vin: "4T1G11AK0PU556231", file: "toyota-aeb-decision-0044.json", submitter: "compliance1", daysAgo: 41 },
  { id: "GM-ADAS-2026-0067", type: "AI_ADAS_DECISION", oem: "gm", vin: "1GNS4PKD3LR556231", file: "gm-supercruise-decision-0067.json", submitter: "compliance2", daysAgo: 28 },
  { id: "FORD-ADAS-2026-0038", type: "AI_ADAS_DECISION", oem: "ford", vin: "1FTFW1E89PFA77231", file: "ford-bluecruise-decision-0038.json", submitter: "compliance1", daysAgo: 14 },
  { id: "VW-ADAS-2026-0052", type: "AI_ADAS_DECISION", oem: "volkswagen", vin: "WVWZZZE2ZPW784512", file: "vw-travelassist-decision-0052.json", submitter: "compliance2", daysAgo: 3 },
  { id: "BMW-INC-2026-0012", type: "INCIDENT_EVIDENCE", oem: "bmw", vin: "WBA5R7C50PFH23491", file: "bmw-incident-0012.json", submitter: "compliance1", daysAgo: 64 },
  { id: "MB-INC-2026-0009", type: "INCIDENT_EVIDENCE", oem: "mercedes", vin: "WDD2223861A678234", file: "mb-incident-0009.json", submitter: "compliance2", daysAgo: 47 },
  { id: "FORD-INC-2026-0014", type: "INCIDENT_EVIDENCE", oem: "ford", vin: "1FTFW1E89PFA77231", file: "ford-incident-0014.json", submitter: "compliance1", daysAgo: 30 },
  { id: "GM-INC-2026-0021", type: "INCIDENT_EVIDENCE", oem: "gm", vin: "1GNS4PKD3LR556231", file: "gm-incident-0021.json", submitter: "compliance2", daysAgo: 19 },
  { id: "TOYOTA-INC-2026-0007", type: "INCIDENT_EVIDENCE", oem: "toyota", vin: "4T1G11AK0PU556231", file: "toyota-incident-0007.json", submitter: "compliance1", daysAgo: 11 },
  { id: "STLA-INC-2026-0006", type: "INCIDENT_EVIDENCE", oem: "stellantis", vin: "1C4RJFBG6PC998123", file: "stla-incident-0006.json", submitter: "compliance2", daysAgo: 2 },
  { id: "BMW-SWA-2026-0301", type: "SOFTWARE_ACTIVATION", oem: "bmw", vin: "WBA5R7C50PFH23491", file: "bmw-activation-0301.json", submitter: "engineer1", daysAgo: 59 },
  { id: "MB-SWA-2026-0187", type: "SOFTWARE_ACTIVATION", oem: "mercedes", vin: "WDD2223861A678234", file: "mb-activation-0187.json", submitter: "engineer2", daysAgo: 45 },
  { id: "VW-SWA-2026-0092", type: "SOFTWARE_ACTIVATION", oem: "volkswagen", vin: "WVWZZZE2ZPW784512", file: "vw-activation-0092.json", submitter: "engineer1", daysAgo: 35 },
  { id: "GM-SWA-2026-0211", type: "SOFTWARE_ACTIVATION", oem: "gm", vin: "1GNS4PKD3LR556231", file: "gm-activation-0211.json", submitter: "engineer2", daysAgo: 22 },
  { id: "FORD-SWA-2026-0058", type: "SOFTWARE_ACTIVATION", oem: "ford", vin: "1FTFW1E89PFA77231", file: "ford-activation-0058.json", submitter: "engineer1", daysAgo: 8 },
  { id: "TOYOTA-SWA-2026-0033", type: "SOFTWARE_ACTIVATION", oem: "toyota", vin: "4T1G11AK0PU556231", file: "toyota-activation-0033.json", submitter: "engineer2", daysAgo: 1 },
];

function fmt(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

async function seedDemoEventsLocal(silent = false) {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO vehicle_events
      (event_id, event_type, vehicle_vin, oem_tenant, filename, submitted_by, submitted_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  let count = 0;
  for (const ev of EVENTS) {
    const email = SUBMITTER_EMAIL[ev.submitter];
    const user  = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
    if (!user) continue;

    const jitterMs = Math.floor(Math.random() * 23 * 3600 * 1000);
    const ts = new Date(Date.now() - ev.daysAgo * 86400000 - jitterMs);
    insert.run(ev.id, ev.type, ev.vin || "", ev.oem, ev.file, user.id, fmt(ts));
    count++;
  }

  if (!silent) console.log(`Seeded ${count} demo events into local index.`);
  return count;
}

module.exports = { seedDemoEventsLocal };

if (require.main === module) {
  (async () => {
    try {
      await db.init();
      await seedDemoEventsLocal();
      process.exit(0);
    } catch (err) {
      console.error("Local event seeding failed:", err);
      process.exit(1);
    }
  })();
}
