/**
 * revokeAccess.js — Hardhat script for patient to call revokeAccess(doctorWallet) on Amoy.
 *
 * Usage:
 *   DOCTOR_WALLET=0x... npx hardhat run scripts/revokeAccess.js --network amoy
 *
 * Environment:
 *   DEPLOYER_PRIVATE_KEY — patient's private key
 *   DOCTOR_WALLET        — doctor's Ethereum address
 */
import hre from "hardhat";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const doctorWallet = process.env.DOCTOR_WALLET;
  if (!doctorWallet) throw new Error("DOCTOR_WALLET environment variable is required.");

  const deploymentPath = resolve(__dirname, "../deployments/amoy.json");
  const deployment = JSON.parse(readFileSync(deploymentPath, "utf8"));
  const contractAddress = deployment.address;

  const artifact = await hre.artifacts.readArtifact("MediChain");

  const [signer] = await hre.ethers.getSigners();
  console.log(`Signer (patient): ${signer.address}`);
  console.log(`Doctor wallet   : ${doctorWallet}`);
  console.log(`Contract        : ${contractAddress}`);

  const contract = new hre.ethers.Contract(contractAddress, artifact.abi, signer);

  // Verify there is a granted request to revoke
  const status = await contract.accessStatus(signer.address, doctorWallet);
  const statusName = ["None", "Pending", "Granted", "Rejected", "Revoked"][Number(status)];
  console.log(`Current chain access status: ${statusName}`);

  if (Number(status) !== 2) {
    throw new Error(
      `Cannot revoke: access status is '${statusName}' (expected 'Granted') for patient ${signer.address} → doctor ${doctorWallet}.`
    );
  }

  console.log(`Submitting revokeAccess(${doctorWallet})...`);
  const tx = await contract.revokeAccess(doctorWallet);
  console.log(`Tx submitted: ${tx.hash}`);

  const receipt = await tx.wait();
  console.log(`Confirmed in block: ${receipt.blockNumber}`);
  console.log(`Tx hash: ${tx.hash}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
