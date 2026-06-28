// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title VehicleCompliance
 * @notice Magna CaaS — Stores cryptographic evidence of vehicle compliance events
 *         on the Reltime blockchain. Only hashes are stored on-chain; full payloads
 *         live in IPFS. Covers UNECE R155/R156, EU AI Act, SDVerse, and US CVR.
 *
 * @dev Deployed on Reltime Mainnet (Chain ID: 32323, PoA, zero gas fees).
 *
 *  Role hierarchy:
 *   DEFAULT_ADMIN_ROLE       — grants/revokes all roles
 *   ENGINEER_ROLE            — OEM engineer: anchors OTA updates, software activations, supply chain
 *   COMPLIANCE_OFFICER_ROLE  — validates any event (emits audit event)
 *   AUDITOR_ROLE             — read-only compliance summary
 *   REGULATOR_ROLE           — regulator: read-only access with regulatory context
 */
contract VehicleCompliance is AccessControl, Pausable, ReentrancyGuard {

    // ──────────────────────────── Roles ────────────────────────────
    bytes32 public constant ENGINEER_ROLE           = keccak256("ENGINEER_ROLE");
    bytes32 public constant COMPLIANCE_OFFICER_ROLE = keccak256("COMPLIANCE_OFFICER_ROLE");
    bytes32 public constant AUDITOR_ROLE            = keccak256("AUDITOR_ROLE");
    bytes32 public constant REGULATOR_ROLE          = keccak256("REGULATOR_ROLE");

    // ──────────────────────────── Event Types ──────────────────────
    enum EventType {
        OTA_UPDATE,          // 0 — UNECE R156 software update
        AI_ADAS_DECISION,    // 1 — EU AI Act ADAS/autonomous decision log
        SUPPLY_CHAIN_EVENT,  // 2 — SDVerse supplier/component verification
        INCIDENT_EVIDENCE,   // 3 — Post-accident/recall forensic record
        SOFTWARE_ACTIVATION  // 4 — Software version activation record
    }

    // ──────────────────────────── Structs ──────────────────────────
    struct ComplianceRecord {
        bytes32   eventHash;     // SHA-256 of the full IPFS payload
        uint256   timestamp;     // block.timestamp when anchored
        address   submitter;     // wallet that submitted
        string    metadataCID;   // Pinata IPFS CID of the full event payload
        string    vehicleVIN;    // 17-char VIN (stored off-chain in IPFS, echoed here for lookup)
        EventType eventType;
        bool      exists;
    }

    // ──────────────────────────── State ────────────────────────────
    mapping(string => ComplianceRecord) private records;    // eventId → record
    mapping(string => bytes32[])        private eventHistory; // eventId → version hashes
    mapping(EventType => uint256)       public  countByType;

    string[] private eventIds;
    uint256  public  totalRecords;

    // ──────────────────────────── Events ───────────────────────────
    event EventAnchored(
        string    indexed eventId,
        bytes32           eventHash,
        EventType         eventType,
        string            vehicleVIN,
        string            metadataCID,
        address   indexed submitter,
        uint256           timestamp
    );

    event EventUpdated(
        string    indexed eventId,
        bytes32           oldHash,
        bytes32           newHash,
        EventType         eventType,
        address   indexed submitter,
        uint256           timestamp
    );

    event IntegrityVerified(
        string    indexed eventId,
        bytes32           providedHash,
        bytes32           storedHash,
        EventType         eventType,
        bool              isValid,
        address   indexed checker,
        uint256           timestamp
    );

    // ──────────────────────────── Errors ───────────────────────────
    error EventAlreadyExists(string eventId);
    error EventNotFound(string eventId);
    error InvalidHash();
    error InvalidEventId();
    error UnauthorizedEventType(EventType eventType, address caller);

    // ──────────────────────────── Constructor ──────────────────────
    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE,       admin);
        _grantRole(ENGINEER_ROLE,            admin);
        _grantRole(COMPLIANCE_OFFICER_ROLE,  admin);
        _grantRole(AUDITOR_ROLE,             admin);
        _grantRole(REGULATOR_ROLE,           admin);
    }

    // ──────────────────────────── Write Functions ──────────────────

    /**
     * @notice Anchor a new compliance event hash on-chain.
     * @param eventId      Unique event identifier (UUID or structured ID)
     * @param eventHash    SHA-256 hash of the IPFS payload
     * @param metadataCID  Pinata/IPFS CID of the full JSON payload
     * @param vehicleVIN   17-character VIN (for event lookup index)
     * @param eventType    Type of compliance event
     */
    function anchorEvent(
        string     calldata eventId,
        bytes32             eventHash,
        string     calldata metadataCID,
        string     calldata vehicleVIN,
        EventType           eventType
    )
        external
        whenNotPaused
        nonReentrant
    {
        if (bytes(eventId).length == 0)  revert InvalidEventId();
        if (eventHash == bytes32(0))     revert InvalidHash();
        if (records[eventId].exists)     revert EventAlreadyExists(eventId);

        _checkSubmitPermission(eventType);

        records[eventId] = ComplianceRecord({
            eventHash:   eventHash,
            timestamp:   block.timestamp,
            submitter:   msg.sender,
            metadataCID: metadataCID,
            vehicleVIN:  vehicleVIN,
            eventType:   eventType,
            exists:      true
        });

        eventHistory[eventId].push(eventHash);
        eventIds.push(eventId);
        countByType[eventType]++;
        totalRecords++;

        emit EventAnchored(eventId, eventHash, eventType, vehicleVIN, metadataCID, msg.sender, block.timestamp);
    }

    /**
     * @notice Update an existing event hash (e.g., amended OTA approval chain).
     */
    function updateEvent(
        string     calldata eventId,
        bytes32             newHash,
        string     calldata metadataCID
    )
        external
        whenNotPaused
        nonReentrant
    {
        if (!records[eventId].exists) revert EventNotFound(eventId);
        if (newHash == bytes32(0))    revert InvalidHash();

        EventType et = records[eventId].eventType;
        _checkSubmitPermission(et);

        bytes32 oldHash = records[eventId].eventHash;
        records[eventId].eventHash   = newHash;
        records[eventId].timestamp   = block.timestamp;
        records[eventId].submitter   = msg.sender;
        records[eventId].metadataCID = metadataCID;

        eventHistory[eventId].push(newHash);

        emit EventUpdated(eventId, oldHash, newHash, et, msg.sender, block.timestamp);
    }

    // ──────────────────────────── Read Functions ──────────────────

    /**
     * @notice Retrieve the current compliance record for an event.
     */
    function getEvent(string calldata eventId)
        external
        view
        returns (
            bytes32   eventHash,
            uint256   timestamp,
            address   submitter,
            string memory metadataCID,
            string memory vehicleVIN,
            EventType eventType
        )
    {
        if (!records[eventId].exists) revert EventNotFound(eventId);
        ComplianceRecord memory r = records[eventId];
        return (r.eventHash, r.timestamp, r.submitter, r.metadataCID, r.vehicleVIN, r.eventType);
    }

    /**
     * @notice Validate a hash against the stored on-chain hash. Emits an audit event.
     * @dev    Compliance officers and regulators may validate.
     */
    function verifyIntegrity(
        string  calldata eventId,
        bytes32          hashToVerify
    )
        external
        returns (bool isValid)
    {
        if (!hasRole(COMPLIANCE_OFFICER_ROLE, msg.sender) &&
            !hasRole(REGULATOR_ROLE, msg.sender) &&
            !hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) {
            revert UnauthorizedEventType(records[eventId].eventType, msg.sender);
        }
        if (!records[eventId].exists) revert EventNotFound(eventId);

        bytes32   storedHash = records[eventId].eventHash;
        EventType et         = records[eventId].eventType;
        isValid = (storedHash == hashToVerify);

        emit IntegrityVerified(
            eventId,
            hashToVerify,
            storedHash,
            et,
            isValid,
            msg.sender,
            block.timestamp
        );
    }

    /**
     * @notice Get full hash history for an event (all versions).
     */
    function getEventHistory(string calldata eventId)
        external
        view
        returns (bytes32[] memory)
    {
        if (!records[eventId].exists) revert EventNotFound(eventId);
        return eventHistory[eventId];
    }

    /**
     * @notice Compliance audit summary: counts by event type.
     */
    function getComplianceSummary()
        external
        view
        returns (
            uint256 otaUpdates,
            uint256 aiAdasDecisions,
            uint256 supplyChainEvents,
            uint256 incidentRecords,
            uint256 softwareActivations,
            uint256 total
        )
    {
        if (!hasRole(AUDITOR_ROLE, msg.sender) &&
            !hasRole(REGULATOR_ROLE, msg.sender) &&
            !hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) {
            revert UnauthorizedEventType(EventType.OTA_UPDATE, msg.sender);
        }
        return (
            countByType[EventType.OTA_UPDATE],
            countByType[EventType.AI_ADAS_DECISION],
            countByType[EventType.SUPPLY_CHAIN_EVENT],
            countByType[EventType.INCIDENT_EVIDENCE],
            countByType[EventType.SOFTWARE_ACTIVATION],
            totalRecords
        );
    }

    /**
     * @notice Check if an event exists on-chain.
     */
    function eventExists(string calldata eventId) external view returns (bool) {
        return records[eventId].exists;
    }

    // ──────────────────────────── Admin Functions ─────────────────

    function pause()   external onlyRole(DEFAULT_ADMIN_ROLE) { _pause(); }
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) { _unpause(); }

    // ──────────────────────────── Internal ────────────────────────

    /**
     * @dev Enforces which role may submit which event type.
     *      ENGINEER_ROLE: OTA_UPDATE, SUPPLY_CHAIN_EVENT, SOFTWARE_ACTIVATION
     *      COMPLIANCE_OFFICER_ROLE: AI_ADAS_DECISION, INCIDENT_EVIDENCE
     *      DEFAULT_ADMIN_ROLE: all types
     */
    function _checkSubmitPermission(EventType et) internal view {
        if (hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) return;

        if (et == EventType.AI_ADAS_DECISION || et == EventType.INCIDENT_EVIDENCE) {
            if (!hasRole(COMPLIANCE_OFFICER_ROLE, msg.sender))
                revert UnauthorizedEventType(et, msg.sender);
        } else {
            // OTA_UPDATE, SUPPLY_CHAIN_EVENT, SOFTWARE_ACTIVATION
            if (!hasRole(ENGINEER_ROLE, msg.sender))
                revert UnauthorizedEventType(et, msg.sender);
        }
    }
}
