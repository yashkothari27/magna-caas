// Seeds realistic-looking compliance events through the real upload -> IPFS -> blockchain pipeline.
require("dotenv").config();

const BASE = `http://localhost:${process.env.PORT || 3001}/api/v1`;

const CREDS = {
  engineer1:   { email: "stefan.weber@magna.com",  password: "Eng@Stefan2026!" },
  engineer2:   { email: "yuki.tanaka@magna.com",   password: "Eng@Yuki2026!" },
  compliance1: { email: "claire.dubois@magna.com", password: "CO@Claire2026!" },
  compliance2: { email: "james.okafor@magna.com",  password: "CO@James2026!" },
};

const EVENTS = [
  // ── OTA_UPDATE (engineer) ──────────────────────────────────────
  { id: "BMW-OTA-2026-0091", type: "OTA_UPDATE", oem: "bmw", vin: "WBA5R7C50PFH23491", submitter: "engineer1",
    file: "bmw-adas-gateway-v4.3.0.json", daysAgo: 62,
    payload: { ecu: "ADAS-Gateway-ECU", component: "Magna ICON Radar Fusion Module", previousVersion: "4.2.1", newVersion: "4.3.0",
      releaseNotes: "Security patch CVE-2026-11042 remediation; improved pedestrian classification confidence threshold",
      signedBy: "Magna Electronics Release Authority", hashAlgorithm: "SHA-256", uneceCompliance: "R156-2024", rolloutPhase: "Wave 2 - EU Fleet" } },
  { id: "MB-OTA-2026-0048", type: "OTA_UPDATE", oem: "mercedes", vin: "WDD2223861A678234", submitter: "engineer2",
    file: "mbux-infotainment-2024.12.json", daysAgo: 55,
    payload: { ecu: "MBUX-HU", component: "Infotainment Head Unit", previousVersion: "2024.11.3", newVersion: "2024.12.1",
      releaseNotes: "Drive Pilot map data refresh, voice assistant latency fix", uneceCompliance: "R156-2024", rolloutPhase: "Germany Pilot Fleet" } },
  { id: "VW-OTA-2026-0117", type: "OTA_UPDATE", oem: "volkswagen", vin: "WVWZZZE2ZPW784512", submitter: "engineer1",
    file: "id4-bms-v1.8.3.json", daysAgo: 48,
    payload: { ecu: "Battery-Management-System", component: "ID.4 High-Voltage BMS", previousVersion: "1.8.0", newVersion: "1.8.3",
      releaseNotes: "Thermal runaway early-warning threshold recalibration", uneceCompliance: "R156-2024", rolloutPhase: "EU + NA Fleet" } },
  { id: "GM-OTA-2026-0073", type: "OTA_UPDATE", oem: "gm", vin: "1GNS4PKD3LR556231", submitter: "engineer2",
    file: "onstar-telematics-v3.5.0.json", daysAgo: 39,
    payload: { ecu: "OnStar-Telematics", component: "Cadillac Telematics Control Unit", previousVersion: "3.4.2", newVersion: "3.5.0",
      releaseNotes: "Super Cruise geofence map update, modem firmware bump", uneceCompliance: "R156-2024", rolloutPhase: "North America" } },
  { id: "FORD-OTA-2026-0029", type: "OTA_UPDATE", oem: "ford", vin: "1FTFW1E89PFA77231", submitter: "engineer1",
    file: "sync4-bluecruise-v5.1.2.json", daysAgo: 21,
    payload: { ecu: "SYNC4-BlueCruise", component: "F-150 Lightning Driver Assist", previousVersion: "5.0.9", newVersion: "5.1.2",
      releaseNotes: "BlueCruise 1.4 lane-centering smoothness improvement", uneceCompliance: "R156-2024", rolloutPhase: "Hands-Free Blue Zones expansion" } },
  { id: "STLA-OTA-2026-0055", type: "OTA_UPDATE", oem: "stellantis", vin: "1C4RJFBG6PC998123", submitter: "engineer2",
    file: "jeep-uconnect5-v2.3.1.json", daysAgo: 9,
    payload: { ecu: "Uconnect-5", component: "Grand Cherokee Infotainment", previousVersion: "2.3.0", newVersion: "2.3.1",
      releaseNotes: "Cybersecurity hardening per UNECE R155 SUMS audit findings", uneceCompliance: "R155/R156-2024", rolloutPhase: "Global" } },

  // ── SUPPLY_CHAIN_EVENT (engineer) ──────────────────────────────
  { id: "MAGNA-SCM-2026-0142", type: "SUPPLY_CHAIN_EVENT", oem: "magna", vin: "", submitter: "engineer1",
    file: "magna-radar-batch-qc-0142.json", daysAgo: 58,
    payload: { partNumber: "MG-LRR-77GHZ-R4", componentName: "Long-Range Radar Sensor", supplier: "Magna Electronics — Sterling Heights, MI",
      batchId: "QC-2026-0142", manufacturingDate: "2026-04-18", conformanceCert: "IATF 16949:2016", destinationOEM: "BMW Group", sdversePublished: true } },
  { id: "BMW-SCM-2026-0066", type: "SUPPLY_CHAIN_EVENT", oem: "bmw", vin: "WBA5R7C50PFH23491", submitter: "engineer2",
    file: "bmw-radar-module-cert.json", daysAgo: 51,
    payload: { partNumber: "BMW-RAD-5S-2026", componentName: "Front Radar Module", supplier: "Continental AG",
      batchId: "CT-BAT-22871", conformanceCert: "ISO 26262 ASIL-B", destinationOEM: "BMW Group", sdversePublished: true } },
  { id: "MB-SCM-2026-0034", type: "SUPPLY_CHAIN_EVENT", oem: "mercedes", vin: "WDD2223861A678234", submitter: "engineer1",
    file: "mb-camera-module-batch.json", daysAgo: 44,
    payload: { partNumber: "MB-CAM-SCLS-09", componentName: "Tri-Focal Front Camera Module", supplier: "Bosch Mobility",
      batchId: "BSH-2026-Q2-0091", conformanceCert: "ISO 26262 ASIL-D", destinationOEM: "Mercedes-Benz AG", sdversePublished: true } },
  { id: "TOYOTA-SCM-2026-0019", type: "SUPPLY_CHAIN_EVENT", oem: "toyota", vin: "4T1G11AK0PU556231", submitter: "engineer2",
    file: "toyota-battery-cell-trace.json", daysAgo: 33,
    payload: { partNumber: "PAN-BZ4X-CELL-21", componentName: "Lithium-Ion Battery Cell Pack", supplier: "Panasonic Energy",
      batchId: "PAN-2026-0119", conformanceCert: "UN38.3 / IATF 16949", destinationOEM: "Toyota Motor Corporation", sdversePublished: true } },
  { id: "GM-SCM-2026-0081", type: "SUPPLY_CHAIN_EVENT", oem: "gm", vin: "1GNS4PKD3LR556231", submitter: "engineer1",
    file: "gm-ultracruise-soc-batch.json", daysAgo: 17,
    payload: { partNumber: "GM-UC-SOC-08", componentName: "Ultra Cruise Compute SoC", supplier: "Qualcomm / NVIDIA Joint Supply",
      batchId: "QNV-2026-0457", conformanceCert: "AEC-Q100 Grade 1", destinationOEM: "General Motors", sdversePublished: true } },
  { id: "FORD-SCM-2026-0027", type: "SUPPLY_CHAIN_EVENT", oem: "ford", vin: "1FTFW1E89PFA77231", submitter: "engineer2",
    file: "ford-brake-by-wire-cert.json", daysAgo: 5,
    payload: { partNumber: "FORD-BBW-ACT-14", componentName: "Brake-by-Wire Actuator", supplier: "ZF Friedrichshafen",
      batchId: "ZF-2026-0288", conformanceCert: "ISO 26262 ASIL-D", destinationOEM: "Ford Motor Company", sdversePublished: true } },

  // ── AI_ADAS_DECISION (compliance officer) ──────────────────────
  { id: "BMW-ADAS-2026-0203", type: "AI_ADAS_DECISION", oem: "bmw", vin: "WBA5R7C50PFH23491", submitter: "compliance1",
    file: "bmw-lka-decision-0203.json", daysAgo: 60,
    payload: { decisionEngine: "Magna ICON Perception Stack v6", feature: "Lane Keep Assist", decisionType: "steering_intervention",
      confidenceScore: 0.94, sensorInputs: ["front_camera", "front_radar"], outcome: "corrective_torque_applied",
      euAiActRiskTier: "high-risk-annex-iii", humanOverrideAvailable: true } },
  { id: "MB-ADAS-2026-0091", type: "AI_ADAS_DECISION", oem: "mercedes", vin: "WDD2223861A678234", submitter: "compliance2",
    file: "mb-drivepilot-decision-0091.json", daysAgo: 52,
    payload: { decisionEngine: "Mercedes Drive Pilot L3", feature: "Conditional Automated Driving", decisionType: "control_handback_request",
      confidenceScore: 0.88, reason: "construction_zone_detected", responseTimeMs: 1340,
      euAiActRiskTier: "high-risk-annex-iii", humanOverrideAvailable: true } },
  { id: "TOYOTA-ADAS-2026-0044", type: "AI_ADAS_DECISION", oem: "toyota", vin: "4T1G11AK0PU556231", submitter: "compliance1",
    file: "toyota-aeb-decision-0044.json", daysAgo: 41,
    payload: { decisionEngine: "Toyota Safety Sense 4.0", feature: "Automatic Emergency Braking", decisionType: "braking_intervention",
      confidenceScore: 0.97, sensorInputs: ["front_camera", "front_radar", "lidar"], outcome: "full_brake_applied",
      euAiActRiskTier: "high-risk-annex-iii", humanOverrideAvailable: false } },
  { id: "GM-ADAS-2026-0067", type: "AI_ADAS_DECISION", oem: "gm", vin: "1GNS4PKD3LR556231", submitter: "compliance2",
    file: "gm-supercruise-decision-0067.json", daysAgo: 28,
    payload: { decisionEngine: "Super Cruise Ultra", feature: "Automated Lane Change", decisionType: "lane_change_execution",
      confidenceScore: 0.91, sensorInputs: ["lidar_map", "front_camera", "gps_rtk"], outcome: "lane_change_completed",
      euAiActRiskTier: "high-risk-annex-iii", humanOverrideAvailable: true } },
  { id: "FORD-ADAS-2026-0038", type: "AI_ADAS_DECISION", oem: "ford", vin: "1FTFW1E89PFA77231", submitter: "compliance1",
    file: "ford-bluecruise-decision-0038.json", daysAgo: 14,
    payload: { decisionEngine: "BlueCruise 1.4", feature: "Hands-Free Highway Driving", decisionType: "hands_free_engagement",
      confidenceScore: 0.93, sensorInputs: ["driver_camera", "front_camera", "radar"], outcome: "engagement_authorized",
      euAiActRiskTier: "high-risk-annex-iii", humanOverrideAvailable: true } },
  { id: "VW-ADAS-2026-0052", type: "AI_ADAS_DECISION", oem: "volkswagen", vin: "WVWZZZE2ZPW784512", submitter: "compliance2",
    file: "vw-travelassist-decision-0052.json", daysAgo: 3,
    payload: { decisionEngine: "Travel Assist 2.5", feature: "Adaptive Lane Guidance", decisionType: "steering_assist",
      confidenceScore: 0.89, sensorInputs: ["front_camera", "front_radar"], outcome: "lane_centering_active",
      euAiActRiskTier: "high-risk-annex-iii", humanOverrideAvailable: true } },

  // ── INCIDENT_EVIDENCE (compliance officer) ──────────────────────
  { id: "BMW-INC-2026-0012", type: "INCIDENT_EVIDENCE", oem: "bmw", vin: "WBA5R7C50PFH23491", submitter: "compliance1",
    file: "bmw-incident-0012.json", daysAgo: 64,
    payload: { incidentType: "adas_disengagement", severity: "low",
      description: "Driver-initiated disengagement of Lane Keep Assist during heavy rain; sensor confidence dropped below threshold",
      faultCodes: ["U0420-RADAR-DEGRADED"], liabilityAssessment: "system_correctly_disengaged", reportedTo: "UNECE Type Approval Authority" } },
  { id: "MB-INC-2026-0009", type: "INCIDENT_EVIDENCE", oem: "mercedes", vin: "WDD2223861A678234", submitter: "compliance2",
    file: "mb-incident-0009.json", daysAgo: 47,
    payload: { incidentType: "drive_pilot_incident", severity: "medium",
      description: "Drive Pilot control handback not acknowledged within required window; fallback to manual braking executed",
      faultCodes: ["DP-HANDBACK-TIMEOUT"], liabilityAssessment: "under_review", reportedTo: "KBA (Germany Federal Motor Transport Authority)" } },
  { id: "FORD-INC-2026-0014", type: "INCIDENT_EVIDENCE", oem: "ford", vin: "1FTFW1E89PFA77231", submitter: "compliance1",
    file: "ford-incident-0014.json", daysAgo: 30,
    payload: { incidentType: "bluecruise_incident", severity: "low",
      description: "BlueCruise hands-free mode auto-disengaged due to driver attention monitor false positive",
      faultCodes: ["DAM-FALSE-POSITIVE"], liabilityAssessment: "system_correctly_disengaged", reportedTo: "NHTSA Standing General Order" } },
  { id: "GM-INC-2026-0021", type: "INCIDENT_EVIDENCE", oem: "gm", vin: "1GNS4PKD3LR556231", submitter: "compliance2",
    file: "gm-incident-0021.json", daysAgo: 19,
    payload: { incidentType: "super_cruise_incident", severity: "medium",
      description: "Super Cruise lane-change maneuver aborted mid-execution due to adjacent vehicle sudden deceleration",
      faultCodes: ["SC-ABORT-ADJ-VEHICLE"], liabilityAssessment: "system_correctly_aborted", reportedTo: "NHTSA Standing General Order" } },
  { id: "TOYOTA-INC-2026-0007", type: "INCIDENT_EVIDENCE", oem: "toyota", vin: "4T1G11AK0PU556231", submitter: "compliance1",
    file: "toyota-incident-0007.json", daysAgo: 11,
    payload: { incidentType: "aeb_false_positive", severity: "low",
      description: "Automatic Emergency Braking triggered on overhead highway sign shadow; no collision risk present",
      faultCodes: ["AEB-FP-SHADOW-CLASS"], liabilityAssessment: "calibration_update_recommended", reportedTo: "NHTSA Standing General Order" } },
  { id: "STLA-INC-2026-0006", type: "INCIDENT_EVIDENCE", oem: "stellantis", vin: "1C4RJFBG6PC998123", submitter: "compliance2",
    file: "stla-incident-0006.json", daysAgo: 2,
    payload: { incidentType: "cybersecurity_incident", severity: "high",
      description: "Unauthorized CAN bus probing attempt detected on OBD-II port during dealership service visit; intrusion blocked by SUMS gateway",
      faultCodes: ["SUMS-INTRUSION-BLOCKED"], liabilityAssessment: "no_vehicle_compromise", reportedTo: "UNECE R155 Cybersecurity Authority" } },

  // ── SOFTWARE_ACTIVATION (engineer) ──────────────────────────────
  { id: "BMW-SWA-2026-0301", type: "SOFTWARE_ACTIVATION", oem: "bmw", vin: "WBA5R7C50PFH23491", submitter: "engineer1",
    file: "bmw-activation-0301.json", daysAgo: 59,
    payload: { featureSku: "BMW-HEATED-SEATS-SUB", featureName: "Heated Front Seats (Subscription)", activationType: "customer_subscription",
      entitlementProof: "BMW-ConnectedDrive-Token-88231", billingCycle: "monthly", uneceCompliance: "R156-2024" } },
  { id: "MB-SWA-2026-0187", type: "SOFTWARE_ACTIVATION", oem: "mercedes", vin: "WDD2223861A678234", submitter: "engineer2",
    file: "mb-activation-0187.json", daysAgo: 45,
    payload: { featureSku: "MB-REAR-AXLE-STEER", featureName: "Rear-Axle Steering (10°)", activationType: "one_time_purchase",
      entitlementProof: "MB-Mercedes-Me-Token-44120", uneceCompliance: "R156-2024" } },
  { id: "VW-SWA-2026-0092", type: "SOFTWARE_ACTIVATION", oem: "volkswagen", vin: "WVWZZZE2ZPW784512", submitter: "engineer1",
    file: "vw-activation-0092.json", daysAgo: 35,
    payload: { featureSku: "VW-TRAVEL-ASSIST-PLUS", featureName: "Travel Assist Plus", activationType: "customer_subscription",
      entitlementProof: "VW-WeConnect-Token-31987", billingCycle: "annual", uneceCompliance: "R156-2024" } },
  { id: "GM-SWA-2026-0211", type: "SOFTWARE_ACTIVATION", oem: "gm", vin: "1GNS4PKD3LR556231", submitter: "engineer2",
    file: "gm-activation-0211.json", daysAgo: 22,
    payload: { featureSku: "GM-SUPERCRUISE-SUB", featureName: "Super Cruise Subscription Renewal", activationType: "customer_subscription",
      entitlementProof: "GM-OnStar-Token-99342", billingCycle: "annual", uneceCompliance: "R156-2024" } },
  { id: "FORD-SWA-2026-0058", type: "SOFTWARE_ACTIVATION", oem: "ford", vin: "1FTFW1E89PFA77231", submitter: "engineer1",
    file: "ford-activation-0058.json", daysAgo: 8,
    payload: { featureSku: "FORD-BLUECRUISE-14", featureName: "BlueCruise 1.4 Entitlement", activationType: "customer_subscription",
      entitlementProof: "Ford-Pass-Token-77654", billingCycle: "monthly", uneceCompliance: "R156-2024" } },
  { id: "TOYOTA-SWA-2026-0033", type: "SOFTWARE_ACTIVATION", oem: "toyota", vin: "4T1G11AK0PU556231", submitter: "engineer2",
    file: "toyota-activation-0033.json", daysAgo: 1,
    payload: { featureSku: "TOYOTA-REMOTE-CONNECT", featureName: "Remote Connect Premium", activationType: "customer_subscription",
      entitlementProof: "Toyota-App-Token-15523", billingCycle: "monthly", uneceCompliance: "R156-2024" } },
];

async function login(email, password) {
  const res  = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!data.token) throw new Error(`Login failed for ${email}: ${JSON.stringify(data)}`);
  return data.token;
}

async function uploadEvent(token, ev) {
  const buf  = Buffer.from(JSON.stringify(ev.payload, null, 2));
  const blob = new Blob([buf], { type: "application/json" });
  const fd   = new FormData();
  fd.append("file", blob, ev.file);
  fd.append("eventId", ev.id);
  fd.append("eventType", ev.type);
  if (ev.vin) fd.append("vehicleVIN", ev.vin);
  fd.append("oemTenant", ev.oem);

  const res = await fetch(`${BASE}/events/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
  return res.json();
}

async function main() {
  console.log("Logging in seed submitters...");
  const tokens = {};
  for (const [key, c] of Object.entries(CREDS)) {
    tokens[key] = await login(c.email, c.password);
  }
  console.log("Ready. Seeding", EVENTS.length, "events...\n");

  const results = [];
  for (const ev of EVENTS) {
    const token = tokens[ev.submitter];
    try {
      const result = await uploadEvent(token, ev);
      if (result.success) {
        console.log(`OK  ${ev.id.padEnd(24)} block ${result.data.blockNumber}`);
        results.push({ id: ev.id, daysAgo: ev.daysAgo, ok: true });
      } else if (result.error && result.error.includes("already anchored")) {
        console.log(`SKIP ${ev.id.padEnd(24)} already exists`);
        results.push({ id: ev.id, daysAgo: ev.daysAgo, ok: true });
      } else {
        console.log(`FAIL ${ev.id.padEnd(24)} ${result.error || JSON.stringify(result)}`);
        results.push({ id: ev.id, daysAgo: ev.daysAgo, ok: false });
      }
    } catch (e) {
      console.log(`FAIL ${ev.id.padEnd(24)} ${e.message}`);
      results.push({ id: ev.id, daysAgo: ev.daysAgo, ok: false });
    }
  }

  require("fs").writeFileSync(
    require("path").join(__dirname, "_seed-results.json"),
    JSON.stringify(results, null, 2)
  );
  console.log("\nDone. Results written to scripts/_seed-results.json");
}

main().catch((e) => { console.error(e); process.exit(1); });
