require("dotenv").config();
const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying VehicleCompliance with:", deployer.address);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Deployer balance:", hre.ethers.formatEther(balance), "RTM");

  const VehicleCompliance = await hre.ethers.getContractFactory("VehicleCompliance");
  const contract = await VehicleCompliance.deploy(deployer.address);
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log("\n✅ VehicleCompliance deployed to:", address);
  console.log("Transaction hash:", contract.deploymentTransaction()?.hash);
  console.log("\nAdd to .env:");
  console.log(`CONTRACT_ADDRESS=${address}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
