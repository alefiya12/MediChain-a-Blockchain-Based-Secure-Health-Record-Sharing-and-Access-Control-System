const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const doctorAddress = process.env.DOCTOR_ADDRESS || process.argv[2];
  if (!doctorAddress || !ethers.isAddress(doctorAddress)) {
    console.error("Usage: DOCTOR_ADDRESS=0x... npx hardhat run scripts/rejectDoctor.js --network amoy");
    console.error("   or: npx hardhat run scripts/rejectDoctor.js --network amoy <doctorAddress>");
    process.exit(1);
  }

  const [signer] = await ethers.getSigners();
  console.log("Executing rejectDoctor with account:", signer.address);
  console.log("Network:", network.name);

  const deploymentFile = path.join(__dirname, "..", "deployments", `${network.name}.json`);
  let contractAddress;
  if (fs.existsSync(deploymentFile)) {
    const deployment = JSON.parse(fs.readFileSync(deploymentFile, "utf-8"));
    contractAddress = deployment.address;
  } else {
    contractAddress = process.env.CONTRACT_ADDRESS;
  }

  if (!contractAddress) {
    throw new Error(`Deployment file not found at ${deploymentFile} and CONTRACT_ADDRESS not set`);
  }

  const MediChain = await ethers.getContractFactory("MediChain");
  const contract = MediChain.attach(contractAddress);

  console.log("Target Contract Address:", contractAddress);
  console.log("Doctor Address to reject:", doctorAddress);

  console.log("Sending rejectDoctor transaction...");
  const tx = await contract.rejectDoctor(doctorAddress);
  console.log("Transaction submitted. Hash:", tx.hash);

  console.log("Waiting for confirmation on-chain...");
  const receipt = await tx.wait(1);

  const verified = await contract.verifiedDoctors(doctorAddress);

  console.log("\n✅ Doctor rejected on-chain successfully!");
  console.log("   Tx Hash     :", receipt.hash);
  console.log("   Block       :", receipt.blockNumber);
  console.log("   Is Verified :", verified);
}

main().catch((err) => {
  console.error("❌ Error running rejectDoctor:", err);
  process.exitCode = 1;
});
