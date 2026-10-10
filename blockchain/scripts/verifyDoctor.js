const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const doctorAddress = process.env.DOCTOR_ADDRESS || process.argv[2];
  if (!doctorAddress || !ethers.isAddress(doctorAddress)) {
    console.error("Usage: DOCTOR_ADDRESS=0x... npx hardhat run scripts/verifyDoctor.js --network amoy");
    console.error("   or: npx hardhat run scripts/verifyDoctor.js --network amoy <doctorAddress>");
    process.exit(1);
  }

  const [signer] = await ethers.getSigners();
  console.log("Executing verifyDoctor with account:", signer.address);
  console.log("Network:", network.name);

  // Load deployment address
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
  console.log("Doctor Address to verify:", doctorAddress);

  const isAlreadyVerified = await contract.verifiedDoctors(doctorAddress);
  if (isAlreadyVerified) {
    console.log(`ℹ️ Doctor ${doctorAddress} is already verified on-chain.`);
  }

  console.log("Sending verifyDoctor transaction...");
  const tx = await contract.verifyDoctor(doctorAddress);
  console.log("Transaction submitted. Hash:", tx.hash);

  console.log("Waiting for confirmation on-chain...");
  const receipt = await tx.wait(1);

  const verified = await contract.verifiedDoctors(doctorAddress);

  console.log("\n✅ Doctor verified on-chain successfully!");
  console.log("   Tx Hash     :", receipt.hash);
  console.log("   Block       :", receipt.blockNumber);
  console.log("   Gas Used    :", receipt.gasUsed.toString());
  console.log("   Is Verified :", verified);
  if (network.name === "amoy") {
    console.log("   Explorer    :", `https://amoy.polygonscan.com/tx/${receipt.hash}`);
  }
}

main().catch((err) => {
  console.error("❌ Error running verifyDoctor:", err);
  process.exitCode = 1;
});
