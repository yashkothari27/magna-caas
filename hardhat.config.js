require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    hardhat: {},
    reltime: {
      url:      process.env.RELTIME_RPC_URL || "https://mainnet.reltime.com/",
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
      chainId:  parseInt(process.env.RELTIME_CHAIN_ID) || 32323,
      gasPrice: 0,
    },
  },
};
