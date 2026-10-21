/**
 * requestAccess.js — Hardhat script for doctor to call requestAccess(patientWallet) on Amoy.
 *
 * Usage:
 *   PATIENT_WALLET=0x... npx hardhat run scripts/requestAccess.js --network amoy
 *
 * Environment:
 *   DEPLOYER_PRIVATE_KEY — must be a VERIFIED doctor's private key
 *   PATIENT_WALLET       — target patient's Ethereum address
 */
import hre from "hardhat";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const patientWallet = process.env.PATIENT_WALLET;
  if (!patientWallet) {
    throw new Error("PATIENT_WALLET environment variable is required.");
  }

  // Load deployment info
  const deploymentPath = resolve(__dirname, "../deployments/amoy.json");
  const deployment = JSON.parse(readFileSync(deploymentPath, "utf8"));
  const contractAddress = deployment.address;

  // Load contract artifact
  const artifact = await hre.artifacts.readArtifact("MediChain");

  const [signer] = await hre.ethers.getSigners();
  console.log(`Signer (doctor): ${signer.address}`);
  console.log(`Patient wallet : ${patientWallet}`);
  console.log(`Contract       : ${contractAddress}`);

  const contract = new hre.ethers.Contract(contractAddress, artifact.abi, signer);

  // Check doctor is verified before calling
  const isVerified = await contract.verifiedDoctors(signer.address);
  if (!isVerified) {
    throw new Error(
      `Doctor ${signer.address} is NOT verified on-chain. Have the admin call verifyDoctor first.`
    );
  }

  console.log(`Submitting requestAccess(${patientWallet})...`);
  const tx = await contract.requestAccess(patientWallet);
  console.log(`Tx submitted: ${tx.hash}`);

  const receipt = await tx.wait();
  console.log(`Confirmed in block: ${receipt.blockNumber}`);
  console.log(`Tx hash: ${tx.hash}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
