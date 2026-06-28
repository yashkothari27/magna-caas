require("dotenv").config();
const Database = require("../src/db/database");
const results  = require("./_seed-results.json");

function fmt(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

async function main() {
  await Database.init();

  Database.exec(`DELETE FROM vehicle_events WHERE event_id = 'TEST-PINATA-VERIFY-001'`);
  console.log("Removed TEST-PINATA-VERIFY-001 row.");

  for (const r of results) {
    if (!r.ok) continue;
    const jitterMs = Math.floor(Math.random() * 23 * 3600 * 1000); // random time within the day
    const ts = new Date(Date.now() - r.daysAgo * 86400000 - jitterMs);
    const formatted = fmt(ts);
    Database.prepare(`UPDATE vehicle_events SET submitted_at = ? WHERE event_id = ?`).run(formatted, r.id);
    console.log(`${r.id.padEnd(24)} -> ${formatted}`);
  }

  console.log("\nBackdating complete.");
}

main().catch((e) => { console.error(e); process.exit(1); });
