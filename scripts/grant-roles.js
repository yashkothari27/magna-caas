require("dotenv").config();
const { ethers } = require("ethers");
const path = require("path");
const fs = require("fs");

const artifact = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../artifacts/contracts/VehicleCompliance.sol/VehicleCompliance.json"), "utf8")
);

const ROLE_USERS = [
  // [role_constant_name, wallet_address, display_name]
  ["ENGINEER_ROLE",           "0x8a11d644aaD9f880fB66258e87b2Bdcd11825Bc9", "Stefan Weber (engineer)"],
  ["ENGINEER_ROLE",           "0xE55E657e7f6Fe089f3793606aD5D8649773dAE9b", "Yuki Tanaka (engineer)"],
  ["COMPLIANCE_OFFICER_ROLE", "0xa7e4E642dD004c9Df4E2a6894fD915e95E503B40", "Claire Dubois (compliance_officer)"],
  ["COMPLIANCE_OFFICER_ROLE", "0x62342480C54EcD8F4DB663B3c8094fd5b303638a", "James Okafor (compliance_officer)"],
  ["AUDITOR_ROLE",            "0x122a25BBC0532827fe4739838925AA4AC0ab2C78", "Anna Schmidt (auditor)"],
  ["AUDITOR_ROLE",            "0x47999Cf3577Fc38083aB706e8a23d9c9522Fc3DD", "Peter Kowalski (auditor)"],
  ["REGULATOR_ROLE",          "0x30F08DAAd87F51291bCD2410f8dD155B3B1994B4", "UNECE Inspector (regulator)"],
  ["REGULATOR_ROLE",          "0xF087C2d87B015E3b9d08f4f9e54424F8D0C000B2", "EU AI Office Auditor (regulator)"],
];

async function main() {
  const provider = new ethers.JsonRpcProvider(process.env.RELTIME_RPC_URL);
  const deployer = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider);
  const contract = new ethers.Contract(process.env.CONTRACT_ADDRESS, artifact.abi, deployer);

  console.log("Deployer:", deployer.address);
  console.log("Contract:", process.env.CONTRACT_ADDRESS);
  console.log("");

  for (const [roleConst, wallet, name] of ROLE_USERS) {
    const roleHash = await contract[roleConst]();
    const alreadyHas = await contract.hasRole(roleHash, wallet);
    if (alreadyHas) {
      console.log(`✓ ${name} — already has ${roleConst}`);
      continue;
    }
    const tx = await contract.grantRole(roleHash, wallet, { gasPrice: 0 });
    const receipt = await tx.wait();
    console.log(`✅ ${name} — granted ${roleConst} (block ${receipt.blockNumber})`);
  }

  console.log("\nAll roles granted.");
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
