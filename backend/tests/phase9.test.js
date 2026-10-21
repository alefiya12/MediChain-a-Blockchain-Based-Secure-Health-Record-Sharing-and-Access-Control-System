/**
 * Phase 9 Integration Test Suite
 * Frontend: Patient Flows (Upload, Consent Management, Verification)
 * End-to-End Validation
 *
 * Exit Criteria:
 *  1. Patient uploads medical record, record shows 'confirmed', verify returns 'VERIFIED'.
 *  2. Patient grants access on-chain -> doctor can view/download.
 *  3. Patient revokes access on-chain -> doctor loses access (confirmed by immediate 403 response).
 *  4. Retry flow for pending record blockchain registration.
 *  5. Complete patient audit history verification.
 */

import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { ethers } from "ethers";
import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// App & Models & Blockchain singletons
import app from "../src/app.js";
import { User } from "../src/models/User.js";
import { DoctorProfile } from "../src/models/DoctorProfile.js";
import { MedicalRecord } from "../src/models/MedicalRecord.js";
import { AccessRequest } from "../src/models/AccessRequest.js";
import { env } from "../src/config/env.js";
import { provider, contract } from "../src/config/blockchain.js";

// Deployment & ABI
const deploymentPath = resolve(__dirname, "../../blockchain/deployments/amoy.json");
const deployment = JSON.parse(readFileSync(deploymentPath, "utf8"));
const CONTRACT_ADDRESS = deployment.address;
const artifactPath = resolve(__dirname, "../../blockchain/artifacts/contracts/MediChain.sol/MediChain.json");
const contractArtifact = JSON.parse(readFileSync(artifactPath, "utf8"));
const CONTRACT_ABI = contractArtifact.abi;
const iface = new ethers.Interface(CONTRACT_ABI);

let mongod, server, baseUrl;
let adminWallet, doctorWallet, patientWallet;
let adminToken, doctorToken, patientToken;
let patientUser;
let uploadedRecordId, recordIdOnChain, recordFileHash;
let accessRequestId;

let passed = 0;
let failed = 0;

function assert(label, condition, detail = "") {
  if (condition) {
    console.log(`  ✅ PASS: ${label}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${label}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Simulated Chain Registry for Fast, Reliable, Gasless EVM Receipt Testing
// ──────────────────────────────────────────────────────────────────────────────
const mockReceipts = new Map();
const onChainRecords = new Map();
let onChainAccessGranted = false;

function registerSimulatedTx(from, eventName, eventArgs) {
  const event = iface.getEvent(eventName);
  const log = iface.encodeEventLog(event, eventArgs);
  const txHash = ethers.hexlify(ethers.randomBytes(32));
  const receipt = {
    hash: txHash,
    status: 1,
    from: from.toLowerCase(),
    to: CONTRACT_ADDRESS.toLowerCase(),
    blockNumber: 49975500,
    logs: [log]
  };
  mockReceipts.set(txHash.toLowerCase(), receipt);
  return txHash;
}

// Attach simulated chain hooks to provider and contract singletons
provider.getTransactionReceipt = async (txHash) => {
  return mockReceipts.get(txHash.toLowerCase()) || null;
};
provider.getTransaction = async (txHash) => {
  const r = mockReceipts.get(txHash.toLowerCase());
  return r ? { hash: r.hash, from: r.from, to: r.to } : null;
};
contract.verifiedDoctors = async () => true;
contract.getRecord = async (recordId) => {
  const rec = onChainRecords.get(recordId);
  if (!rec) return ["0x" + "00".repeat(32), ethers.ZeroAddress, 0n];
  return [rec.fileHash, rec.patient, rec.timestamp];
};
contract.hasAccess = async () => onChainAccessGranted;

function buildFormData(fields, fileBuffer, filename, mimeType) {
  const boundary = "----MediChainBoundary" + Date.now();
  const parts = [];

  for (const [key, value] of Object.entries(fields)) {
    parts.push(
      `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`
    );
  }

  parts.push(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mimeType}\r\n\r\n`
  );

  const header = Buffer.from(parts.join(""));
  const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
  const body = Buffer.concat([header, fileBuffer, footer]);

  return { body, contentType: `multipart/form-data; boundary=${boundary}` };
}

async function apiPost(path, body, token) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(body)
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json };
}

async function apiGet(path, token) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "GET",
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const json = await res.json().catch(() => ({}));
    return { status: res.status, body: json, headers: res.headers };
  } else {
    const buffer = await res.arrayBuffer();
    return { status: res.status, buffer: Buffer.from(buffer), headers: res.headers };
  }
}

async function apiUpload(path, { body, contentType }, token) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": contentType,
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json };
}

async function setup() {
  process.env.NODE_ENV = "test";
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  server = app.listen(0);
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}/api`;

  adminWallet = ethers.Wallet.createRandom();
  doctorWallet = ethers.Wallet.createRandom();
  patientWallet = ethers.Wallet.createRandom();

  console.log("Suite Wallets Initialized:");
  console.log(`  Admin:   ${adminWallet.address}`);
  console.log(`  Doctor:  ${doctorWallet.address}`);
  console.log(`  Patient: ${patientWallet.address}`);

  // Seed Admin user
  await User.create({
    name: "System Admin",
    email: env.ADMIN_EMAIL,
    passwordHash: await User.hashPassword(env.ADMIN_PASSWORD),
    role: "admin",
    walletAddress: adminWallet.address.toLowerCase(),
    isActive: true
  });

  // Register Doctor
  const docReg = await apiPost("/auth/register", {
    name: "Dr. Marcus Vance",
    email: "marcus.doctor.p9@medichain.local",
    password: "Password123!",
    role: "doctor",
    walletAddress: doctorWallet.address.toLowerCase(),
    licenseNumber: "LIC-MARCUS-P9",
    specialization: "Cardiology",
    hospital: "City Heart Center",
    experienceYears: 15
  });
  doctorToken = docReg.body.data?.token;

  // Mark Doctor approved in DB
  await DoctorProfile.updateOne(
    { licenseNumber: "LIC-MARCUS-P9" },
    { status: "approved", verifiedAt: new Date() }
  );

  // Register Patient
  const patReg = await apiPost("/auth/register", {
    name: "Sophia Martinez",
    email: "sophia.patient.p9@medichain.local",
    password: "Password123!",
    role: "patient",
    walletAddress: patientWallet.address.toLowerCase()
  });
  patientToken = patReg.body.data?.token;
  patientUser = patReg.body.data?.user;
}

async function teardown() {
  if (server) server.close();
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
}

// ──────────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────────

async function testPatientUploadAndBlockchainAnchor() {
  console.log("\n--- 1. Patient Record Upload & Blockchain Anchoring ---");

  // Step 1: Upload encrypted file
  const testFileContent = Buffer.from(
    "%PDF-1.4\n% MediChain Cryptographic Diagnostic Report for Sophia Martinez\nPatient ID: " +
      patientUser.patientId +
      "\nStatus: Confirmed Healthy Cardiology Analysis\n%%EOF"
  );

  const formData = buildFormData(
    {
      title: "Cardiac Ultrasound & ECG Evaluation",
      category: "scan_report",
      description: "High-resolution echocardiogram and rhythm analysis."
    },
    testFileContent,
    "cardiac_ultrasound.pdf",
    "application/pdf"
  );

  const uploadRes = await apiUpload("/records", formData, patientToken);
  assert(
    "Patient uploads record (201 Created with encrypted ciphertext)",
    uploadRes.status === 201 && uploadRes.body.data?.record?.chainStatus === "pending",
    JSON.stringify(uploadRes.body)
  );

  const record = uploadRes.body.data.record;
  uploadedRecordId = record._id;
  recordIdOnChain = uploadRes.body.data.recordIdOnChain;
  recordFileHash = uploadRes.body.data.fileHash;

  assert(
    "Upload response returns recordIdOnChain and SHA-256 fileHash",
    Boolean(recordIdOnChain && recordFileHash),
    `recordId: ${recordIdOnChain}, hash: ${recordFileHash}`
  );

  // Step 2: Patient signs registerRecord on smart contract
  const regTxHash = registerSimulatedTx(patientWallet.address, "RecordRegistered", [
    recordIdOnChain,
    patientWallet.address,
    recordFileHash,
    Math.floor(Date.now() / 1000)
  ]);
  onChainRecords.set(recordIdOnChain, {
    fileHash: recordFileHash,
    patient: patientWallet.address.toLowerCase(),
    timestamp: BigInt(Math.floor(Date.now() / 1000))
  });

  // Step 3: Patient calls POST /api/records/:id/confirm { txHash }
  const confirmRes = await apiPost(
    `/records/${uploadedRecordId}/confirm`,
    { txHash: regTxHash },
    patientToken
  );
  assert(
    "Backend confirms on-chain registration (200, status: confirmed)",
    confirmRes.status === 200 && confirmRes.body.data?.record?.chainStatus === "confirmed",
    JSON.stringify(confirmRes.body)
  );

  // Step 4: Verify record appears in MyRecords
  const myRecordsRes = await apiGet("/records/mine", patientToken);
  assert(
    "Patient lists records via /api/records/mine (contains confirmed record)",
    myRecordsRes.status === 200 &&
      myRecordsRes.body.data?.records?.some(
        (r) => r._id === uploadedRecordId && r.chainStatus === "confirmed"
      ),
    JSON.stringify(myRecordsRes.body)
  );
}

async function testRecordIntegrityVerificationAndDownload() {
  console.log("\n--- 2. Record Cryptographic Verification & Download ---");

  // Step 1: Verify integrity
  const verifyRes = await apiPost(`/records/${uploadedRecordId}/verify`, {}, patientToken);
  assert(
    "Integrity check returns status 'VERIFIED' (200)",
    verifyRes.status === 200 && verifyRes.body.data?.status === "VERIFIED",
    JSON.stringify(verifyRes.body)
  );
  assert(
    "Plaintext re-hash matches on-chain anchored hash",
    verifyRes.body.data?.localHash?.toLowerCase() === recordFileHash.toLowerCase() &&
      verifyRes.body.data?.chainHash?.toLowerCase() === recordFileHash.toLowerCase() &&
      verifyRes.body.data?.localMatchesDb === true &&
      verifyRes.body.data?.chainMatchesDb === true,
    JSON.stringify(verifyRes.body.data)
  );

  // Step 2: Patient downloads decrypted record
  const downloadRes = await apiGet(`/records/${uploadedRecordId}/download`, patientToken);
  assert("Patient downloads decrypted record (200 OK)", downloadRes.status === 200);
  assert(
    "Decrypted buffer matches original PDF content",
    downloadRes.buffer && downloadRes.buffer.toString().includes("MediChain Cryptographic Diagnostic Report"),
    "Buffer content did not match"
  );
}

async function testRetryBlockchainRegistration() {
  console.log("\n--- 2b. Retry Blockchain Registration Flow for Pending Record ---");

  // Step 1: Upload a second record that remains pending
  const testFile2 = Buffer.from(
    "%PDF-1.4\n% MediChain Secondary Record: Blood Chemistry Panel\n%%EOF"
  );
  const formData2 = buildFormData(
    {
      title: "Comprehensive Metabolic & Lipid Panel",
      category: "lab_report",
      description: "Fast track metabolic panel."
    },
    testFile2,
    "lipid_panel.pdf",
    "application/pdf"
  );

  const uploadRes2 = await apiUpload("/records", formData2, patientToken);
  assert(
    "Second record uploaded with chainStatus: pending (201)",
    uploadRes2.status === 201 && uploadRes2.body.data?.record?.chainStatus === "pending"
  );
  const rec2Id = uploadRes2.body.data.record._id;
  const rec2ChainId = uploadRes2.body.data.recordIdOnChain;
  const rec2Hash = uploadRes2.body.data.fileHash;

  // Step 2: Simulate retry registration on-chain
  const retryTxHash = registerSimulatedTx(patientWallet.address, "RecordRegistered", [
    rec2ChainId,
    patientWallet.address,
    rec2Hash,
    Math.floor(Date.now() / 1000)
  ]);
  onChainRecords.set(rec2ChainId, {
    fileHash: rec2Hash,
    patient: patientWallet.address.toLowerCase(),
    timestamp: BigInt(Math.floor(Date.now() / 1000))
  });

  // Step 3: Call confirm on the pending record
  const confirmRes2 = await apiPost(
    `/records/${rec2Id}/confirm`,
    { txHash: retryTxHash },
    patientToken
  );
  assert(
    "Retry confirmation updates pending record to confirmed (200)",
    confirmRes2.status === 200 && confirmRes2.body.data?.record?.chainStatus === "confirmed",
    JSON.stringify(confirmRes2.body)
  );
}

async function testDoctorRequestAndPatientGrant() {
  console.log("\n--- 3. Doctor Request & Patient On-Chain Grant Flow ---");

  // Step 1: Doctor requests access on chain
  const reqTxHash = registerSimulatedTx(doctorWallet.address, "AccessRequested", [
    patientWallet.address,
    doctorWallet.address,
    Math.floor(Date.now() / 1000)
  ]);

  // Step 2: Doctor submits request to backend
  const reqPostRes = await apiPost(
    "/access/request",
    {
      patientId: patientUser.patientId,
      reason: "Evaluating cardiac function and ultrasound scans.",
      txHash: reqTxHash
    },
    doctorToken
  );
  assert(
    "Doctor submits request to backend (201 Created, status: pending)",
    reqPostRes.status === 201 && reqPostRes.body.data?.request?.status === "pending",
    JSON.stringify(reqPostRes.body)
  );
  accessRequestId = reqPostRes.body.data.request._id;

  // Step 3: Patient checks pending access requests
  const pendingRes = await apiGet("/patient/access-requests?status=pending", patientToken);
  assert(
    "Patient receives pending requests with doctor profile (specialization & hospital)",
    pendingRes.status === 200 &&
      pendingRes.body.data?.requests?.some(
        (r) =>
          r._id === accessRequestId &&
          r.doctorProfile?.specialization === "Cardiology" &&
          r.doctorProfile?.hospital === "City Heart Center"
      ),
    JSON.stringify(pendingRes.body)
  );

  // Step 4: Patient grants access on chain
  const grantTxHash = registerSimulatedTx(patientWallet.address, "AccessGranted", [
    patientWallet.address,
    doctorWallet.address,
    Math.floor(Date.now() / 1000)
  ]);
  onChainAccessGranted = true;

  // Step 5: Patient submits grant response to backend
  const grantPostRes = await apiPost(
    `/access/${accessRequestId}/respond`,
    {
      approve: true,
      txHash: grantTxHash
    },
    patientToken
  );
  assert(
    "Patient confirms grant response to backend (200, status: granted)",
    grantPostRes.status === 200 && grantPostRes.body.data?.request?.status === "granted",
    JSON.stringify(grantPostRes.body)
  );

  // Step 6: Patient checks granted list
  const grantedRes = await apiGet("/patient/granted", patientToken);
  assert(
    "Patient sees doctor in /api/patient/granted list",
    grantedRes.status === 200 &&
      grantedRes.body.data?.grants?.some(
        (g) => g.doctor?.walletAddress.toLowerCase() === doctorWallet.address.toLowerCase()
      ),
    JSON.stringify(grantedRes.body)
  );

  // Step 7: Doctor can now view and download patient's records
  const docRecordsRes = await apiGet(
    `/doctor/patients/${patientUser.patientId}/records`,
    doctorToken
  );
  assert(
    "Doctor accesses patient's records (200 OK)",
    docRecordsRes.status === 200 && docRecordsRes.body.data?.records?.length >= 1,
    JSON.stringify(docRecordsRes.body)
  );

  const docDownloadRes = await apiGet(`/records/${uploadedRecordId}/download`, doctorToken);
  assert(
    "Doctor downloads decrypted record under active consent (200 OK)",
    docDownloadRes.status === 200 &&
      docDownloadRes.buffer?.toString().includes("MediChain Cryptographic Diagnostic Report"),
    "Doctor download failed"
  );
}

async function testPatientRevokeAccessAndDoctor403Forbidden() {
  console.log("\n--- 4. Patient Revocation & Immediate 403 Enforcement ---");

  // Step 1: Patient revokes access on chain
  const revokeTxHash = registerSimulatedTx(patientWallet.address, "AccessRevoked", [
    patientWallet.address,
    doctorWallet.address,
    Math.floor(Date.now() / 1000)
  ]);
  onChainAccessGranted = false;

  // Step 2: Patient submits revocation to backend
  const revokePostRes = await apiPost(
    `/access/${accessRequestId}/revoke`,
    { txHash: revokeTxHash },
    patientToken
  );
  assert(
    "Patient confirms revocation to backend (200, status: revoked)",
    revokePostRes.status === 200 && revokePostRes.body.data?.request?.status === "revoked",
    JSON.stringify(revokePostRes.body)
  );

  // Step 3: Doctor immediately attempts to download record -> MUST RECEIVE 403
  const forbiddenDownloadRes = await apiGet(
    `/records/${uploadedRecordId}/download`,
    doctorToken
  );
  assert(
    "Doctor download immediately blocked with 403 Forbidden after revocation",
    forbiddenDownloadRes.status === 403,
    `Status: ${forbiddenDownloadRes.status}`
  );

  // Step 4: Doctor attempts to view patient record list -> MUST RECEIVE 403
  const forbiddenRecordsRes = await apiGet(
    `/doctor/patients/${patientUser.patientId}/records`,
    doctorToken
  );
  assert(
    "Doctor record list immediately blocked with 403 Forbidden after revocation",
    forbiddenRecordsRes.status === 403,
    `Status: ${forbiddenRecordsRes.status}`
  );

  // Step 5: Doctor attempts to verify record -> MUST RECEIVE 403
  const forbiddenVerifyRes = await apiPost(
    `/records/${uploadedRecordId}/verify`,
    {},
    doctorToken
  );
  assert(
    "Doctor verify immediately blocked with 403 Forbidden after revocation",
    forbiddenVerifyRes.status === 403,
    `Status: ${forbiddenVerifyRes.status}`
  );
}

async function testPatientDashboardAndAuditTrail() {
  console.log("\n--- 5. Patient Dashboard Stats & Audit Ledger ---");

  // Check Dashboard counts
  const dashRes = await apiGet("/patient/dashboard", patientToken);
  assert(
    "Patient dashboard returns accurate counts and metrics (200 OK)",
    dashRes.status === 200 &&
      dashRes.body.data?.counts?.records?.confirmed >= 1 &&
      dashRes.body.data?.recentActivity?.length > 0,
    JSON.stringify(dashRes.body)
  );

  // Check Patient Audit logs
  const auditRes = await apiGet("/audit", patientToken);
  assert(
    "Patient audit ledger returns chronological history of events (200 OK)",
    auditRes.status === 200 && auditRes.body.data?.logs?.length >= 4,
    JSON.stringify(auditRes.body)
  );

  const actions = auditRes.body.data.logs.map((l) => l.action);
  assert("Audit includes RECORD_UPLOADED", actions.includes("RECORD_UPLOADED"));
  assert("Audit includes RECORD_CHAIN_CONFIRMED", actions.includes("RECORD_CHAIN_CONFIRMED"));
  assert("Audit includes ACCESS_REQUESTED", actions.includes("ACCESS_REQUESTED"));
  assert("Audit includes ACCESS_GRANTED", actions.includes("ACCESS_GRANTED"));
  assert("Audit includes RECORD_VIEWED", actions.includes("RECORD_VIEWED"));
  assert("Audit includes ACCESS_REVOKED", actions.includes("ACCESS_REVOKED"));
}

async function run() {
  console.log("================================================================");
  console.log("   MediChain Phase 9 Test Suite — Frontend: Patient Flows       ");
  console.log("================================================================");

  try {
    await setup();
    await testPatientUploadAndBlockchainAnchor();
    await testRecordIntegrityVerificationAndDownload();
    await testRetryBlockchainRegistration();
    await testDoctorRequestAndPatientGrant();
    await testPatientRevokeAccessAndDoctor403Forbidden();
    await testPatientDashboardAndAuditTrail();
  } catch (err) {
    console.error("FATAL SUITE ERROR:", err);
    failed++;
  } finally {
    await teardown();
  }

  console.log("\n================================================================");
  console.log(`RESULTS: ${passed} Passed, ${failed} Failed`);
  console.log("================================================================");

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

run();
