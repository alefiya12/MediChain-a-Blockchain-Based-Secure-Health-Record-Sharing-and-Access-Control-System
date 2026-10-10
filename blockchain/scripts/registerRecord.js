/**
 * registerRecord.js — Hardhat script to sign a registerRecord transaction on Amoy.
 *
 * Usage:
 *   RECORD_ID=0x... FILE_HASH=0x... npx hardhat run scripts/registerRecord.js --network amoy
 *
 * Both RECORD_ID and FILE_HASH must be bytes32 hex strings (0x prefixed, 66 chars total).
 * You get these values from the POST /api/records response:
 *   - recordIdOnChain  (already formatted as bytes32 via ethers.id)
 *   - fileHash         (sha256 of plaintext, 0x + 64 hex chars)
 */

const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const recordId = process.env.RECORD_ID;
  const fileHash = process.env.FILE_HASH;

  if (!recordId || !fileHash) {
    console.error("Usage: RECORD_ID=0x... FILE_HASH=0x... npx hardhat run scripts/registerRecord.js --network amoy");
    process.exit(1);
  }

  if (!/^0x[0-9a-fA-F]{64}$/.test(recordId)) {
    console.error("RECORD_ID must be a 0x-prefixed 32-byte hex string (66 chars)");
    process.exit(1);
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(fileHash)) {
    console.error("FILE_HASH must be a 0x-prefixed 32-byte hex string (66 chars)");
    process.exit(1);
  }

  const [signer] = await ethers.getSigners();
  console.log("Signing registerRecord with account:", signer.address);
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
  if (!contractAddress) throw new Error("Contract address not found");

  const MediChain = await ethers.getContractFactory("MediChain");
  const contract = MediChain.attach(contractAddress);

  console.log("Contract Address:", contractAddress);
  console.log("recordId      :", recordId);
  console.log("fileHash      :", fileHash);

  console.log("Sending registerRecord transaction...");
  const tx = await contract.registerRecord(recordId, fileHash);
  console.log("Transaction submitted. Hash:", tx.hash);

  console.log("Waiting for confirmation...");
  const receipt = await tx.wait(1);

  console.log("\n✅ Record registered on-chain successfully!");
  console.log("   Tx Hash    :", receipt.hash);
  console.log("   Block      :", receipt.blockNumber);
  console.log("   Gas Used   :", receipt.gasUsed.toString());
  if (network.name === "amoy") {
    console.log("   Explorer   :", `https://amoy.polygonscan.com/tx/${receipt.hash}`);
  }
  console.log("\nNow call POST /api/records/<mongoId>/confirm with { txHash:", `"${receipt.hash}" }`);
}

main().catch((err) => {
  console.error("❌ Error:", err);
  process.exitCode = 1;
});
