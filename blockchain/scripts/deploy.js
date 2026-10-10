const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying MediChain with:", deployer.address);
  console.log("Network:", network.name, "| chainId:", network.config.chainId);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Deployer balance:", ethers.formatEther(balance), "POL");

  const MediChain = await ethers.getContractFactory("MediChain");
  const medichain = await MediChain.deploy();

  // Wait for the deployment tx to be mined + 1 additional confirmation
  const receipt = await medichain.deploymentTransaction().wait(1);
  const contractAddress = await medichain.getAddress();

  console.log("\n✅ MediChain deployed!");
  console.log("   Address :", contractAddress);
  console.log("   Tx hash :", receipt.hash);
  console.log("   Block   :", receipt.blockNumber);
  if (network.name === "amoy") {
    console.log("   Explorer:", `https://amoy.polygonscan.com/address/${contractAddress}`);
  }

  // Write deployments/amoy.json (or deployments/<network>.json)
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) fs.mkdirSync(deploymentsDir, { recursive: true });

  const deploymentInfo = {
    address: contractAddress,
    deployer: deployer.address,
    chainId: network.config.chainId ?? (await ethers.provider.getNetwork()).chainId,
    deployedAt: new Date().toISOString(),
    txHash: receipt.hash,
    blockNumber: receipt.blockNumber,
  };

  const outPath = path.join(deploymentsDir, `${network.name}.json`);
  fs.writeFileSync(outPath, JSON.stringify(deploymentInfo, null, 2));
  console.log("\n📄 Deployment info written to:", outPath);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
