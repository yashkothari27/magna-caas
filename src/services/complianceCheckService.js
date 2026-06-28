const db = require("../db/database");

const FRAMEWORK_MAP = {
  OTA_UPDATE:          { framework: "UNECE_R155_R156", label: "OTA & Software Update Management System (SUMS)" },
  AI_ADAS_DECISION:    { framework: "EU_AI_ACT",        label: "EU AI Act — High-Risk ADAS Traceability" },
  SUPPLY_CHAIN_EVENT:  { framework: "SDVERSE_NIS2",     label: "SDVerse Trusted Supply Chain / NIS2 Cybersecurity" },
  INCIDENT_EVIDENCE:   { framework: "LIABILITY",        label: "Post-Accident Liability & Recall Evidence" },
  SOFTWARE_ACTIVATION: { framework: "UNECE_R156_CVR",   label: "Software Activation / US Connected Vehicle Rule" },
};

async function getOemComplianceStatus(oemTenant) {
  const rows = db.prepare(`
    SELECT event_type, COUNT(*) AS count, MAX(submitted_at) AS last_event_at
    FROM vehicle_events
    WHERE oem_tenant = ?
    GROUP BY event_type
  `).all(oemTenant);

  const byType = Object.fromEntries(rows.map((r) => [r.event_type, r]));

  const frameworks = Object.entries(FRAMEWORK_MAP).map(([eventType, meta]) => {
    const row = byType[eventType];
    return {
      framework: meta.framework,
      label: meta.label,
      anchoredEvents: row?.count || 0,
      lastActivityAt: row?.last_event_at || null,
      status: row ? "active_evidence_on_record" : "no_evidence_anchored",
    };
  });

  frameworks.push({
    framework: "GDPR",
    label: "Driver Data Privacy & Right-to-be-Forgotten",
    anchoredEvents: 0,
    lastActivityAt: null,
    status: "not_yet_integrated",
    note: "Consent ledger module is on the platform roadmap and not active in this deployment.",
  });

  const totalEvents = rows.reduce((sum, r) => sum + r.count, 0);
  const vinCountRow = db.prepare(`SELECT COUNT(DISTINCT vehicle_vin) AS n FROM vehicle_events WHERE oem_tenant = ? AND vehicle_vin != ''`).get(oemTenant);

  return {
    oemTenant,
    vehiclesWithRecords: vinCountRow?.n || 0,
    totalAnchoredEvents: totalEvents,
    frameworks,
    dataSource: "Off-chain index of events anchored on Reltime Layer 1 (each row independently verifiable via its on-chain hash)",
    generatedAtUTC: new Date().toISOString(),
  };
}

module.exports = { getOemComplianceStatus };
