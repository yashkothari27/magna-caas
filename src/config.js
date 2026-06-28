require("dotenv").config();

module.exports = {
  port: parseInt(process.env.PORT) || 3001,
  nodeEnv: process.env.NODE_ENV || "development",

  // Reltime Blockchain
  blockchain: {
    rpcUrl: (process.env.RELTIME_RPC_URL || "https://mainnet.reltime.com/").trim(),
    chainId: parseInt(process.env.RELTIME_CHAIN_ID) || 32323,
    contractAddress: process.env.CONTRACT_ADDRESS?.trim(),
    privateKey: process.env.DEPLOYER_PRIVATE_KEY?.trim(),
    gasPrice: 0,
    gasLimit: 5000000,
  },

  // Auth
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: "24h",
  },

  corsOrigins: process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(",")
    : "*",

  walletEncryptionKey: process.env.WALLET_ENCRYPTION_KEY,

  dbPath: process.env.DB_PATH || "./data/magna-caas.db",

  logLevel: process.env.LOG_LEVEL || "info",
};
