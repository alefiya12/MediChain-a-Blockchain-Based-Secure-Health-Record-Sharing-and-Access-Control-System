/**
 * respondAccess.js — Hardhat script for patient to call respondToRequest(doctorWallet, approve).
 *
 * Usage:
 *   DOCTOR_WALLET=0x... APPROVE=true  npx hardhat run scripts/respondAccess.js --network amoy
 *   DOCTOR_WALLET=0x... APPROVE=false npx hardhat run scripts/respondAccess.js --network amoy
 *
 * Environment:
 *   DEPLOYER_PRIVATE_KEY — patient's private key
 *   DOCTOR_WALLET        — doctor's Ethereum address
 *   APPROVE              — "true" to grant, "false" to reject
 */
import hre from "hardhat";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const doctorWallet = process.env.DOCTOR_WALLET;
  const approveStr = process.env.APPROVE;

  if (!doctorWallet) throw new Error("DOCTOR_WALLET environment variable is required.");
  if (!approveStr) throw new Error("APPROVE environment variable is required ('true' or 'false').");

  const approve = approveStr.toLowerCase() === "true";

  const deploymentPath = resolve(__dirname, "../deployments/amoy.json");
  const deployment = JSON.parse(readFileSync(deploymentPath, "utf8"));
  const contractAddress = deployment.address;

  const artifact = await hre.artifacts.readArtifact("MediChain");

  const [signer] = await hre.ethers.getSigners();
  console.log(`Signer (patient): ${signer.address}`);
  console.log(`Doctor wallet   : ${doctorWallet}`);
  console.log(`Approve         : ${approve}`);
  console.log(`Contract        : ${contractAddress}`);

  const contract = new hre.ethers.Contract(contractAddress, artifact.abi, signer);

  // Verify there is a pending request
  const status = await contract.accessStatus(signer.address, doctorWallet);
  const statusName = ["None", "Pending", "Granted", "Rejected", "Revoked"][Number(status)];
  console.log(`Current chain access status: ${statusName}`);

  if (Number(status) !== 1) {
    throw new Error(
      `No Pending request exists for patient ${signer.address} → doctor ${doctorWallet} (status: ${statusName}).`
    );
  }

  console.log(`Submitting respondToRequest(${doctorWallet}, ${approve})...`);
  const tx = await contract.respondToRequest(doctorWallet, approve);
  console.log(`Tx submitted: ${tx.hash}`);

  const receipt = await tx.wait();
  console.log(`Confirmed in block: ${receipt.blockNumber}`);
  console.log(`Tx hash: ${tx.hash}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
