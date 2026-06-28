const db = require("../db/database");
const blockchainService = require("./blockchainService");

const OTA_WINDOW_HIGH_DAYS   = 7;
const OTA_WINDOW_MEDIUM_DAYS = 30;
const ADAS_WINDOW_HOURS      = 24;

function daysBetween(a, b) {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 86400000;
}
function hoursBetween(a, b) {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 3600000;
}

async function buildTimelineForVin(vin) {
  const rows = db.prepare(`
    SELECT e.event_id, e.event_type, e.vehicle_vin, e.oem_tenant, e.filename, e.submitted_at, u.full_name AS submitter_name
    FROM vehicle_events e
    JOIN users u ON u.id = e.submitted_by
    WHERE e.vehicle_vin = ?
    ORDER BY e.submitted_at ASC
  `).all(vin);

  const timeline = [];
  for (const row of rows) {
    let onChain = null;
    try {
      const rec = await blockchainService.getEvent(row.event_id);
      onChain = {
        hash: rec.hash,
        metadataCID: rec.metadataCID,
        anchoredAtUTC: rec.timestampISO,
        submitterWallet: rec.submitter,
      };
    } catch {
      onChain = null; // event row exists locally but couldn't be read on-chain right now
    }
    timeline.push({
      eventId: row.event_id,
      type: row.event_type,
      oemTenant: row.oem_tenant,
      filename: row.filename,
      submittedAt: row.submitted_at,
      submittedBy: row.submitter_name,
      onChain,
    });
  }
  return timeline;
}

function attributeFault(timeline) {
  const incidents = timeline.filter((e) => e.type === "INCIDENT_EVIDENCE");
  if (incidents.length === 0) {
    return { cleanRecord: true, incidents: [] };
  }

  const otaEvents    = timeline.filter((e) => e.type === "OTA_UPDATE");
  const scmEvents    = timeline.filter((e) => e.type === "SUPPLY_CHAIN_EVENT");
  const adasEvents   = timeline.filter((e) => e.type === "AI_ADAS_DECISION");

  const reports = incidents.map((incident) => {
    const candidates = [];

    // OTA software factor: most recent OTA before the incident
    const priorOTA = otaEvents
      .filter((o) => new Date(o.submittedAt) <= new Date(incident.submittedAt))
      .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt))[0];
    if (priorOTA) {
      const gap = daysBetween(priorOTA.submittedAt, incident.submittedAt);
      if (gap <= OTA_WINDOW_MEDIUM_DAYS) {
        candidates.push({
          factor: "OTA_SOFTWARE_UPDATE",
          confidence: gap <= OTA_WINDOW_HIGH_DAYS ? "high" : "medium",
          eventId: priorOTA.eventId,
          daysBeforeIncident: Math.round(gap * 10) / 10,
          evidence: priorOTA.onChain,
          explanation: `Software update anchored ${Math.round(gap)} day(s) before the incident — software regression cannot be ruled out.`,
        });
      }
    }

    // Supply chain / component factor: component of record for this VIN
    const component = scmEvents.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt))[0];
    if (component) {
      candidates.push({
        factor: "SUPPLY_CHAIN_COMPONENT",
        confidence: "informational",
        eventId: component.eventId,
        evidence: component.onChain,
        explanation: "Component/supplier of record for this vehicle — relevant for warranty and supplier liability review.",
      });
    }

    // AI/ADAS decision factor: decision logged close to the incident time
    const nearbyDecision = adasEvents.find((d) => hoursBetween(d.submittedAt, incident.submittedAt) <= ADAS_WINDOW_HOURS);
    if (nearbyDecision) {
      candidates.push({
        factor: "AI_ADAS_DECISION",
        confidence: "high",
        eventId: nearbyDecision.eventId,
        evidence: nearbyDecision.onChain,
        explanation: "An ADAS/AI decision was logged within 24 hours of the incident — directly relevant under EU AI Act Article 12 traceability requirements.",
      });
    }

    const primary = candidates.sort((a, b) => {
      const order = { high: 0, medium: 1, informational: 2, low: 3 };
      return order[a.confidence] - order[b.confidence];
    })[0];

    return {
      incidentEventId: incident.eventId,
      incidentDate: incident.submittedAt,
      onChain: incident.onChain,
      candidateCauses: candidates,
      primaryHypothesis: primary
        ? `${primary.factor} (${primary.confidence} confidence) — ${primary.explanation}`
        : "No software, supply-chain, or AI-decision event correlates with this incident within the standard lookback window. Recommend manual investigation.",
    };
  });

  return { cleanRecord: false, incidents: reports };
}

async function getVehicleAudit(vin) {
  const timeline = await buildTimelineForVin(vin);
  const attribution = attributeFault(timeline);
  const oemTenant = timeline[0]?.oemTenant || null;
  return {
    vin,
    oemTenant,
    totalEvents: timeline.length,
    timeline,
    ...attribution,
  };
}

module.exports = { getVehicleAudit };
