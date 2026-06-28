const { ethers } = require("ethers");
const fs         = require("fs");
const path       = require("path");
const config     = require("../config");
const logger     = require("../logger");

class BlockchainService {
  constructor() {
    this.provider   = null;
    this.signer     = null;
    this.contract   = null;
    this.isConnected = false;
    this.initError  = null;
    this.initLog    = [];
    this._initPromise = null;
  }

  initialize() {
    if (!this._initPromise) {
      this._initPromise = this._doInitialize();
    }
    return this._initPromise;
  }

  async _doInitialize() {
    try {
      this.initLog.push("Starting Magna CaaS blockchain initialization...");
      logger.info("Starting Magna CaaS blockchain initialization...");

      if (!config.blockchain.contractAddress) throw new Error("CONTRACT_ADDRESS not set");
      if (!config.blockchain.privateKey)      throw new Error("DEPLOYER_PRIVATE_KEY not set");

      this.provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl, {
        name: "reltime-mainnet",
        chainId: config.blockchain.chainId,
      });

      try {
        const networkPromise = this.provider.getNetwork();
        const timeout = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), 5000)
        );
        const network = await Promise.race([networkPromise, timeout]);
        logger.info(`Connected to Reltime Mainnet, Chain ID: ${network.chainId}`);
        this.initLog.push(`Chain ID: ${network.chainId}`);
      } catch (e) {
        logger.warn(`Network verification skipped: ${e.message}`);
        this.initLog.push(`WARN: ${e.message}`);
      }

      this.signer = new ethers.Wallet(config.blockchain.privateKey, this.provider);
      logger.info(`Signer: ${this.signer.address}`);

      const artifactPath = path.join(
        __dirname,
        "../../artifacts/contracts/VehicleCompliance.sol/VehicleCompliance.json"
      );
      if (!fs.existsSync(artifactPath)) {
        throw new Error(`Contract artifact not found. Run 'npx hardhat compile' first.`);
      }

      const artifact  = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
      this.contract   = new ethers.Contract(config.blockchain.contractAddress, artifact.abi, this.signer);
      this.isConnected = true;
      logger.info("Magna CaaS blockchain service ready");
    } catch (error) {
      this.initError = error.message;
      this.initLog.push(`FATAL: ${error.message}`);
      logger.error("Blockchain init failed:", error.message);
      throw error;
    }
  }

  // ── Event type mappings ──
  static EVENT_TYPES = {
    OTA_UPDATE:          0,
    AI_ADAS_DECISION:    1,
    SUPPLY_CHAIN_EVENT:  2,
    INCIDENT_EVIDENCE:   3,
    SOFTWARE_ACTIVATION: 4,
  };

  static EVENT_TYPE_NAMES = [
    "OTA_UPDATE", "AI_ADAS_DECISION", "SUPPLY_CHAIN_EVENT", "INCIDENT_EVIDENCE", "SOFTWARE_ACTIVATION"
  ];

  // ── Write operations ──

  async anchorEvent(eventId, hashHex, metadataCID = "", vehicleVIN = "", eventType = 0) {
    await this._ensureConnected();
    const hashBytes32 = this._toBytes32(hashHex);

    logger.info(`Anchoring event: ${eventId} (type: ${BlockchainService.EVENT_TYPE_NAMES[eventType]}, VIN: ${vehicleVIN || "N/A"})`);

    const tx = await this.contract.anchorEvent(eventId, hashBytes32, metadataCID, vehicleVIN, eventType, {
      gasPrice: 0,
      gasLimit: config.blockchain.gasLimit,
    });
    const receipt = await tx.wait();
    logger.info(`Anchored in block ${receipt.blockNumber}: ${receipt.hash}`);

    return {
      transactionHash: receipt.hash,
      blockNumber:     receipt.blockNumber,
      gasUsed:         receipt.gasUsed.toString(),
      status:          receipt.status === 1 ? "confirmed" : "failed",
    };
  }

  async anchorEventAs(privateKey, eventId, hashHex, metadataCID = "", vehicleVIN = "", eventType = 0) {
    await this._ensureConnected();
    const wallet      = new ethers.Wallet(privateKey, this.provider);
    const contractAs  = this.contract.connect(wallet);
    const hashBytes32 = this._toBytes32(hashHex);

    const tx = await contractAs.anchorEvent(eventId, hashBytes32, metadataCID, vehicleVIN, eventType, {
      gasPrice: 0,
      gasLimit: config.blockchain.gasLimit,
    });
    const receipt = await tx.wait();
    return {
      transactionHash: receipt.hash,
      blockNumber:     receipt.blockNumber,
      gasUsed:         receipt.gasUsed.toString(),
      status:          receipt.status === 1 ? "confirmed" : "failed",
    };
  }

  async updateEventAs(privateKey, eventId, newHashHex, metadataCID = "") {
    await this._ensureConnected();
    const wallet     = new ethers.Wallet(privateKey, this.provider);
    const contractAs = this.contract.connect(wallet);
    const hashBytes32 = this._toBytes32(newHashHex);

    const tx = await contractAs.updateEvent(eventId, hashBytes32, metadataCID, {
      gasPrice: 0,
      gasLimit: config.blockchain.gasLimit,
    });
    const receipt = await tx.wait();
    return {
      transactionHash: receipt.hash,
      blockNumber:     receipt.blockNumber,
      status:          receipt.status === 1 ? "confirmed" : "failed",
    };
  }

  async verifyIntegrityAs(privateKey, eventId, hashHex) {
    await this._ensureConnected();
    const wallet     = new ethers.Wallet(privateKey, this.provider);
    const contractAs = this.contract.connect(wallet);
    const hashBytes32 = this._toBytes32(hashHex);

    const tx = await contractAs.verifyIntegrity(eventId, hashBytes32, {
      gasPrice: 0,
      gasLimit: config.blockchain.gasLimit,
    });
    const receipt = await tx.wait();

    const event = receipt.logs
      .map(log => { try { return this.contract.interface.parseLog(log); } catch { return null; } })
      .find(e => e?.name === "IntegrityVerified");

    return {
      eventId,
      isValid:         event ? event.args.isValid : null,
      eventTypeName:   event ? BlockchainService.EVENT_TYPE_NAMES[Number(event.args.eventType)] : null,
      transactionHash: receipt.hash,
      blockNumber:     receipt.blockNumber,
    };
  }

  // ── Read operations ──

  async getEvent(eventId) {
    await this._ensureConnected();
    // Use getFunction() to avoid collision with ethers.js v6's built-in contract.getEvent() method
    const [eventHash, timestamp, submitter, metadataCID, vehicleVIN, eventType] =
      await this.contract.getFunction("getEvent")(eventId);

    return {
      eventId,
      hash:          eventHash,
      timestamp:     Number(timestamp),
      timestampISO:  new Date(Number(timestamp) * 1000).toISOString(),
      submitter,
      metadataCID,
      vehicleVIN,
      eventType:     Number(eventType),
      eventTypeName: BlockchainService.EVENT_TYPE_NAMES[Number(eventType)] ?? "UNKNOWN",
    };
  }

  async checkIntegrity(eventId, hashHex) {
    await this._ensureConnected();
    const stored      = await this.getEvent(eventId);
    const hashBytes32 = this._toBytes32(hashHex);
    return {
      eventId,
      isValid:        stored.hash === hashBytes32,
      providedHash:   hashBytes32,
      storedHash:     stored.hash,
      storedTimestamp: stored.timestampISO,
      vehicleVIN:     stored.vehicleVIN,
      eventTypeName:  stored.eventTypeName,
    };
  }

  async getEventHistory(eventId) {
    await this._ensureConnected();
    const history = await this.contract.getEventHistory(eventId);
    return {
      eventId,
      versions:      history.map((h, i) => ({ version: i + 1, hash: h })),
      totalVersions: history.length,
    };
  }

  async getComplianceSummary() {
    await this._ensureConnected();
    const [otaUpdates, aiAdasDecisions, supplyChainEvents, incidentRecords, softwareActivations, total] =
      await this.contract.getComplianceSummary();
    return {
      otaUpdates:         Number(otaUpdates),
      aiAdasDecisions:    Number(aiAdasDecisions),
      supplyChainEvents:  Number(supplyChainEvents),
      incidentRecords:    Number(incidentRecords),
      softwareActivations: Number(softwareActivations),
      total:              Number(total),
    };
  }

  async getComplianceSummaryAs(privateKey) {
    await this._ensureConnected();
    const wallet     = new ethers.Wallet(privateKey, this.provider);
    const contractAs = this.contract.connect(wallet);
    const [a, b, c, d, e, total] = await contractAs.getComplianceSummary();
    return {
      otaUpdates:          Number(a),
      aiAdasDecisions:     Number(b),
      supplyChainEvents:   Number(c),
      incidentRecords:     Number(d),
      softwareActivations: Number(e),
      total:               Number(total),
    };
  }

  async eventExists(eventId) {
    await this._ensureConnected();
    return await this.contract.eventExists(eventId);
  }

  async getHealth() {
    try {
      if (!this.isConnected) return { status: "unhealthy", error: "Not initialized" };
      const [blockNumber, network, totalRecords] = await Promise.all([
        this.provider.getBlockNumber(),
        this.provider.getNetwork(),
        this.contract.totalRecords(),
      ]);
      return {
        status:          "healthy",
        chain:           "Reltime Mainnet",
        chainId:         Number(network.chainId),
        currentBlock:    blockNumber,
        contractAddress: config.blockchain.contractAddress,
        totalRecords:    Number(totalRecords),
      };
    } catch (error) {
      return { status: "unhealthy", error: error.message };
    }
  }

  async grantUserRole(roleKey, walletAddress) {
    await this._ensureConnected();
    const ROLE_MAP = {
      engineer:           this.contract.ENGINEER_ROLE,
      compliance_officer: this.contract.COMPLIANCE_OFFICER_ROLE,
      auditor:            this.contract.AUDITOR_ROLE,
      regulator:          this.contract.REGULATOR_ROLE,
    };
    const roleFn = ROLE_MAP[roleKey];
    if (!roleFn) throw new Error(`Unknown role: ${roleKey}`);
    const roleHash = await roleFn.call(this.contract);
    const tx = await this.contract.grantRole(roleHash, walletAddress, {
      gasPrice: 0,
      gasLimit: config.blockchain.gasLimit,
    });
    const receipt = await tx.wait();
    logger.info(`Granted ${roleKey} to ${walletAddress} in block ${receipt.blockNumber}`);
    return { transactionHash: receipt.hash, blockNumber: receipt.blockNumber };
  }

  _toBytes32(hexString) {
    if (!hexString.startsWith("0x")) hexString = "0x" + hexString;
    return ethers.zeroPadValue(hexString, 32);
  }

  async _ensureConnected() {
    if (!this.isConnected && this._initPromise) {
      try { await this._initPromise; } catch {}
    }
    if (!this.isConnected) {
      throw new Error("Blockchain service not initialized. Check RPC and environment variables.");
    }
  }
}

module.exports = new BlockchainService();
