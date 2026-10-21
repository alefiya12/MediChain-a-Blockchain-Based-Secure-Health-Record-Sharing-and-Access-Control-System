/**
 * Phase 6 Integration Test Suite
 * Consent and Access Control — Full request → grant/reject → revoke lifecycle.
 *
 * Uses:
 *  - mongodb-memory-server (in-process MongoDB)
 *  - Real Polygon Amoy chain for on-chain transactions
 *  - ethers.js for signing wallet transactions directly
 *
 * Exit Criteria:
 *  - Doctor requests → patient sees pending → grants → doctor lists records and downloads
 *    → patient revokes → doctor's next download returns 403 immediately.
 *  - Unverified/pending doctor cannot request. Doctor cannot access patient B's records with patient A's grant.
 */

import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { ethers } from "ethers";
import { readFileSync, promises as fs } from "fs";
import { dirname, resolve, join } from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STORAGE_DIR = resolve(__dirname, "../storage");

// Bootstrap: import app BEFORE touching mongoose
import app from "../src/app.js";
import { User } from "../src/models/User.js";
import { DoctorProfile } from "../src/models/DoctorProfile.js";
import { MedicalRecord } from "../src/models/MedicalRecord.js";
import { AccessRequest } from "../src/models/AccessRequest.js";
import { AuditLog } from "../src/models/AuditLog.js";
import { env } from "../src/config/env.js";
import { sha256Hex, encryptBuffer } from "../src/services/crypto.service.js";

// Contract ABI + address
const deploymentPath = resolve(__dirname, "../../blockchain/deployments/amoy.json");
const deployment = JSON.parse(readFileSync(deploymentPath, "utf8"));
const CONTRACT_ADDRESS = deployment.address;
const artifactPath = resolve(__dirname, "../../blockchain/artifacts/contracts/MediChain.sol/MediChain.json");
const contractArtifact = JSON.parse(readFileSync(artifactPath, "utf8"));
const CONTRACT_ABI = contractArtifact.abi;

// Provider
const provider = new ethers.JsonRpcProvider(env.AMOY_RPC_URL);

// State
let mongod, server, baseUrl;
let adminToken, patientToken, doctorToken, patient2Token;
let patientUser, doctorUser, patient2User, adminUser;
let patientWallet, doctorWallet; // ethers.Wallet instances
let testRecordId;
const TEST_FILE_CONTENT = "MediChain Confidential Medical Report: Patient Alice vitals normal.";

// Helpers
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
  let json = null;
  let text = null;
  if (contentType.includes("application/json")) {
    json = await res.json().catch(() => null);
  } else {
    text = await res.text().catch(() => null);
  }
  return { status: res.status, body: json, text, headers: res.headers };
}

async function login(email, password) {
  const r = await apiPost("/auth/login", { email, password });
  if (r.status !== 200) throw new Error(`Login failed for ${email}: ${JSON.stringify(r.body)}`);
  return r.body.data.token;
}

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

// Sign and submit an on-chain transaction; return the mined tx hash
async function onChainTx(signer, methodName, ...args) {
  const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
  const tx = await contract[methodName](...args);
  console.log(`     Tx submitted (${methodName}): ${tx.hash}`);
  const receipt = await tx.wait(1);
  console.log(`     Confirmed in block: ${receipt.blockNumber}`);
  return tx.hash;
}

// Setup
async function setup() {
  process.env.NODE_ENV = "test";
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  server = app.listen(0);
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}/api`;

  await fs.mkdir(STORAGE_DIR, { recursive: true });

  // Wallet signers
  const PATIENT_PK = process.env.DEPLOYER_PRIVATE_KEY;
  if (!PATIENT_PK) throw new Error("DEPLOYER_PRIVATE_KEY is required for phase6 tests.");
  patientWallet = new ethers.Wallet(PATIENT_PK, provider);

  // Doctor wallet — verified on-chain in Amoy
  const DOCTOR_PK = process.env.DOCTOR_PRIVATE_KEY || ethers.keccak256(ethers.toUtf8Bytes("medichain-capstone-doctor-alefiya-private-key-v1"));
  doctorWallet = new ethers.Wallet(DOCTOR_PK, provider);

  const hash = (pw) => User.hashPassword(pw);

  // Admin (distinct dummy wallet to satisfy uniqueness if populated)
  adminUser = await User.create({
    name: "Admin",
    email: env.ADMIN_EMAIL,
    passwordHash: await hash(env.ADMIN_PASSWORD),
    role: "admin",
    walletAddress: "0x1111111111111111111111111111111111111111",
    isActive: true
  });

  // Patient 1 — Alice (Deployer wallet on Amoy)
  patientUser = await User.create({
    name: "Alice Patient",
    email: "alice.patient.p6@medichain.local",
    passwordHash: await hash("Password123!"),
    role: "patient",
    walletAddress: patientWallet.address.toLowerCase(),
    patientId: "MC-P-ALICE6",
    isActive: true
  });

  // Patient 2 — Bob (different wallet)
  patient2User = await User.create({
    name: "Bob Patient",
    email: "bob.patient.p6@medichain.local",
    passwordHash: await hash("Password123!"),
    role: "patient",
    walletAddress: "0x2222222222222222222222222222222222222222",
    patientId: "MC-P-BOB6",
    isActive: true
  });

  // Doctor — Dr. Carol (Verified doctor wallet on Amoy)
  doctorUser = await User.create({
    name: "Dr. Carol",
    email: "carol.doctor.p6@medichain.local",
    passwordHash: await hash("Password123!"),
    role: "doctor",
    walletAddress: doctorWallet.address.toLowerCase(),
    isActive: true
  });

  await DoctorProfile.create({
    user: doctorUser._id,
    licenseNumber: "LIC-CAROL-P6",
    specialization: "Cardiology",
    hospital: "City Hospital",
    experienceYears: 8,
    status: "approved",
    verifiedAt: new Date()
  });

  // Seed encrypted medical record for Alice so doctor download can be tested
  const fileBuf = Buffer.from(TEST_FILE_CONTENT, "utf8");
  const fileHash = sha256Hex(fileBuf);
  const { encrypted, iv, authTag } = encryptBuffer(fileBuf);
  const storedName = `${crypto.randomUUID()}.enc`;
  await fs.writeFile(join(STORAGE_DIR, storedName), encrypted);

  const testRec = await MedicalRecord.create({
    patient: patientUser._id,
    title: "Alice Cardiac Panel",
    category: "lab_report",
    description: "Phase 6 exit criteria test record",
    originalName: "cardiac_panel.pdf",
    mimeType: "application/pdf",
    sizeBytes: fileBuf.length,
    storedName,
    iv,
    authTag,
    fileHash,
    chainStatus: "confirmed",
    recordIdOnChain: "0x" + "c".repeat(64),
    txHash: "0x" + "e".repeat(64),
    blockNumber: 12345
  });
  testRecordId = testRec._id.toString();

  // Seed a record for Bob to test cross-patient isolation
  const bobBuf = Buffer.from("Bob Confidential Records", "utf8");
  const bobEnc = encryptBuffer(bobBuf);
  const bobStoredName = `${crypto.randomUUID()}.enc`;
  await fs.writeFile(join(STORAGE_DIR, bobStoredName), bobEnc.encrypted);
  await MedicalRecord.create({
    patient: patient2User._id,
    title: "Bob Medical History",
    category: "discharge_summary",
    originalName: "bob_history.pdf",
    mimeType: "application/pdf",
    sizeBytes: bobBuf.length,
    storedName: bobStoredName,
    iv: bobEnc.iv,
    authTag: bobEnc.authTag,
    fileHash: sha256Hex(bobBuf),
    recordIdOnChain: "0x" + "b".repeat(64),
    chainStatus: "confirmed"
  });

  // Login all users
  adminToken = await login(env.ADMIN_EMAIL, env.ADMIN_PASSWORD);
  patientToken = await login("alice.patient.p6@medichain.local", "Password123!");
  patient2Token = await login("bob.patient.p6@medichain.local", "Password123!");
  doctorToken = await login("carol.doctor.p6@medichain.local", "Password123!");
}

async function teardown() {
  if (server) server.close();
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
}

// ──────────────────────────────────────────────────────────────────────────────
// TEST SECTIONS
// ──────────────────────────────────────────────────────────────────────────────

async function testAccessRequestValidation() {
  console.log("\n--- 1. Access Request Validation ---");

  // Missing txHash
  let r = await apiPost("/access/request", { patientId: "MC-P-ALICE6", reason: "Medical review" }, doctorToken);
  assert("POST /access/request rejects missing txHash (400)", r.status === 400, JSON.stringify(r.body));

  // Missing patientId
  r = await apiPost("/access/request", { reason: "Medical review", txHash: "0x" + "a".repeat(64) }, doctorToken);
  assert("POST /access/request rejects missing patientId (400)", r.status === 400, JSON.stringify(r.body));

  // Missing reason
  r = await apiPost("/access/request", { patientId: "MC-P-ALICE6", txHash: "0x" + "a".repeat(64) }, doctorToken);
  assert("POST /access/request rejects missing reason (400)", r.status === 400, JSON.stringify(r.body));

  // Patient cannot call request
  r = await apiPost("/access/request", { patientId: "MC-P-ALICE6", reason: "test", txHash: "0x" + "a".repeat(64) }, patientToken);
  assert("POST /access/request rejects non-doctor (403)", r.status === 403, JSON.stringify(r.body));

  // Unauthenticated
  r = await apiPost("/access/request", { patientId: "MC-P-ALICE6", reason: "test", txHash: "0x" + "a".repeat(64) });
  assert("POST /access/request rejects unauthenticated (401)", r.status === 401, JSON.stringify(r.body));

  // Bogus txHash
  r = await apiPost("/access/request", {
    patientId: "MC-P-ALICE6",
    reason: "Test",
    txHash: "0x" + "f".repeat(64)
  }, doctorToken);
  assert("POST /access/request rejects bogus txHash (400 from chain)", r.status === 400, JSON.stringify(r.body));

  // Non-existent patientId
  r = await apiPost("/access/request", {
    patientId: "MC-P-ZZZZZ",
    reason: "Test",
    txHash: "0x" + "a".repeat(64)
  }, doctorToken);
  assert("POST /access/request rejects unknown patientId (400 or 404)", r.status === 400 || r.status === 404, JSON.stringify(r.body));
}

async function testPatientSearchValidation() {
  console.log("\n--- 2. Patient Search Validation ---");

  // Missing query
  let r = await apiGet("/doctor/patients/search", doctorToken);
  assert("GET /doctor/patients/search rejects missing patientId (400)", r.status === 400, JSON.stringify(r.body));

  // Non-existent patientId
  r = await apiGet("/doctor/patients/search?patientId=MC-P-ZZZZZ", doctorToken);
  assert("GET /doctor/patients/search returns 404 for unknown patientId", r.status === 404, JSON.stringify(r.body));

  // Valid search — returns safe fields only
  r = await apiGet("/doctor/patients/search?patientId=MC-P-ALICE6", doctorToken);
  assert("GET /doctor/patients/search returns patient info (200)", r.status === 200, JSON.stringify(r.body));
  const p = r.body?.data?.patient;
  assert(
    "Search response contains name, patientId, walletAddress only — no sensitive fields",
    p &&
    p.name === "Alice Patient" &&
    p.patientId === "MC-P-ALICE6" &&
    !p.passwordHash &&
    !p.email,
    JSON.stringify(p)
  );

  // Patient cannot access search
  r = await apiGet("/doctor/patients/search?patientId=MC-P-ALICE6", patientToken);
  assert("GET /doctor/patients/search rejects patient role (403)", r.status === 403, JSON.stringify(r.body));
}

async function testRespondAndRevokeValidation() {
  console.log("\n--- 3. Respond / Revoke Validation ---");

  const fakeId = "64a1b2c3d4e5f607080910ab";

  // Respond to non-existent request
  let r = await apiPost(`/access/${fakeId}/respond`, { approve: true, txHash: "0x" + "a".repeat(64) }, patientToken);
  assert("POST /access/:id/respond returns 404 for unknown request", r.status === 404, JSON.stringify(r.body));

  // Revoke non-existent request
  r = await apiPost(`/access/${fakeId}/revoke`, { txHash: "0x" + "a".repeat(64) }, patientToken);
  assert("POST /access/:id/revoke returns 404 for unknown request", r.status === 404, JSON.stringify(r.body));

  // Doctor cannot respond
  r = await apiPost(`/access/${fakeId}/respond`, { approve: true, txHash: "0x" + "a".repeat(64) }, doctorToken);
  assert("POST /access/:id/respond rejects non-patient role (403)", r.status === 403 || r.status === 404, JSON.stringify(r.body));
}

// ─── Live On-Chain Full Consent & Access Lifecycle ───────────────────────────
let requestId;

async function testLiveRequestFlow() {
  console.log("\n--- 4. Live On-Chain: Doctor Requests Access ---");
  console.log(`     Patient wallet: ${patientWallet.address}`);
  console.log(`     Doctor wallet : ${doctorWallet.address}`);

  // Before grant: doctor cannot list records (403)
  const rBeforeList = await apiGet("/doctor/patients/MC-P-ALICE6/records", doctorToken);
  assert("Doctor cannot list Alice's records before grant (403)", rBeforeList.status === 403, JSON.stringify(rBeforeList.body));

  // Before grant: doctor cannot download Alice's record (403)
  const rBeforeDownload = await apiGet(`/records/${testRecordId}/download`, doctorToken);
  assert("Doctor cannot download Alice's record before grant (403)", rBeforeDownload.status === 403, JSON.stringify(rBeforeDownload.body));

  // Doctor submits requestAccess on Polygon Amoy
  console.log("     Submitting requestAccess on Amoy...");
  const txHash = await onChainTx(doctorWallet, "requestAccess", patientWallet.address);

  // POST to backend API
  const r = await apiPost("/access/request", {
    patientId: "MC-P-ALICE6",
    reason: "Cardiology follow-up consultation",
    txHash
  }, doctorToken);

  assert(
    "POST /access/request with valid on-chain tx creates pending request (201)",
    r.status === 201 && r.body.data?.request?.status === "pending",
    JSON.stringify(r.body)
  );

  requestId = r.body?.data?.request?._id;

  // Audit log has ACCESS_REQUESTED
  const audit = await AuditLog.findOne({ action: "ACCESS_REQUESTED", doctor: doctorUser._id });
  assert("AuditLog recorded ACCESS_REQUESTED with txHash", !!audit && audit.txHash === txHash, String(audit));

  // Duplicate request rejected (409)
  const rDup = await apiPost("/access/request", {
    patientId: "MC-P-ALICE6",
    reason: "Duplicate attempt",
    txHash
  }, doctorToken);
  assert("POST /access/request rejects duplicate pending request (409)", rDup.status === 409, JSON.stringify(rDup.body));
}

async function testPatientSeesPending() {
  console.log("\n--- 5. Patient Sees Pending Request ---");

  const r = await apiGet("/patient/access-requests?status=pending", patientToken);
  assert(
    "GET /patient/access-requests shows pending request for Alice (200)",
    r.status === 200 && Array.isArray(r.body?.data?.requests) && r.body.data.requests.length >= 1,
    JSON.stringify(r.body)
  );
  assert(
    "Pending request has correct reason and doctor info",
    r.body.data.requests[0].reason === "Cardiology follow-up consultation" &&
    r.body.data.requests[0].doctor.email === "carol.doctor.p6@medichain.local",
    JSON.stringify(r.body.data.requests[0])
  );
}

async function testLiveGrantFlow() {
  console.log("\n--- 6. Live On-Chain: Patient Grants Access ---");

  if (!requestId) throw new Error("No requestId from previous step.");

  // Patient signs respondToRequest(doctorWallet, true) on Polygon Amoy
  console.log("     Submitting respondToRequest(approve=true) on Amoy...");
  const txHash = await onChainTx(patientWallet, "respondToRequest", doctorWallet.address, true);

  // POST to backend API
  const r = await apiPost(`/access/${requestId}/respond`, { approve: true, txHash }, patientToken);
  assert(
    "POST /access/:id/respond sets status=granted (200)",
    r.status === 200 && r.body.data?.request?.status === "granted",
    JSON.stringify(r.body)
  );

  // Audit log has ACCESS_GRANTED
  const audit = await AuditLog.findOne({ action: "ACCESS_GRANTED", patient: patientUser._id });
  assert("AuditLog recorded ACCESS_GRANTED with txHash", !!audit && audit.txHash === txHash, String(audit));
}

async function testDoctorAuthorizedRecordsAndDownload() {
  console.log("\n--- 7. Doctor Lists Records & Downloads Plaintext ---");

  // 1. Doctor lists records for Alice
  const rList = await apiGet("/doctor/patients/MC-P-ALICE6/records", doctorToken);
  assert(
    "GET /doctor/patients/MC-P-ALICE6/records returns 200 after grant",
    rList.status === 200 && Array.isArray(rList.body?.data?.records),
    JSON.stringify(rList.body)
  );
  assert(
    "Records list contains Alice's cardiac panel",
    rList.body.data.records.some((rec) => rec._id === testRecordId),
    JSON.stringify(rList.body.data.records)
  );

  // 2. Doctor downloads Alice's record — decrypted plaintext returned
  const rDown = await apiGet(`/records/${testRecordId}/download`, doctorToken);
  assert(
    "GET /records/:id/download returns 200 for authorized doctor",
    rDown.status === 200,
    `Status: ${rDown.status}, Body: ${JSON.stringify(rDown.body)}`
  );
  assert(
    "Downloaded file matches decrypted original plaintext",
    rDown.text === TEST_FILE_CONTENT,
    `Received content: ${rDown.text}`
  );
  assert(
    "Download headers set Content-Type and Content-Disposition",
    rDown.headers.get("content-type")?.includes("application/pdf") &&
    rDown.headers.get("content-disposition")?.includes("cardiac_panel.pdf"),
    `Headers: ${JSON.stringify(Object.fromEntries(rDown.headers.entries()))}`
  );

  // 3. Audit log contains RECORD_VIEWED
  const audit = await AuditLog.findOne({ action: "RECORD_VIEWED", doctor: doctorUser._id, record: testRecordId });
  assert("AuditLog recorded RECORD_VIEWED for doctor download", !!audit, String(audit));

  // 4. Authorized patients endpoint reflects active live grant
  const rAuth = await apiGet("/doctor/authorized-patients", doctorToken);
  assert(
    "GET /doctor/authorized-patients returns Alice with liveChainAccess=true",
    rAuth.status === 200 &&
    rAuth.body.data?.authorizedPatients?.some(
      (g) => g.patient.patientId === "MC-P-ALICE6" && g.liveChainAccess === true
    ),
    JSON.stringify(rAuth.body)
  );
}

async function testLiveRevokeFlow() {
  console.log("\n--- 8. Live On-Chain: Patient Revokes Access ---");

  if (!requestId) throw new Error("No requestId from previous step.");

  // Patient signs revokeAccess(doctorWallet) on Polygon Amoy
  console.log("     Submitting revokeAccess on Amoy...");
  const txHash = await onChainTx(patientWallet, "revokeAccess", doctorWallet.address);

  // POST to backend API
  const r = await apiPost(`/access/${requestId}/revoke`, { txHash }, patientToken);
  assert(
    "POST /access/:id/revoke sets status=revoked (200)",
    r.status === 200 && r.body.data?.request?.status === "revoked",
    JSON.stringify(r.body)
  );

  // Audit log has ACCESS_REVOKED
  const audit = await AuditLog.findOne({ action: "ACCESS_REVOKED", patient: patientUser._id });
  assert("AuditLog recorded ACCESS_REVOKED with txHash", !!audit && audit.txHash === txHash, String(audit));

  // EXIT CRITERION: Doctor's NEXT download returns 403 immediately!
  const rDownAfter = await apiGet(`/records/${testRecordId}/download`, doctorToken);
  assert(
    "CRITICAL EXIT CRITERIA: Doctor's next download returns 403 immediately after revoke",
    rDownAfter.status === 403,
    `Status: ${rDownAfter.status}`
  );

  // Doctor's next record listing returns 403 immediately!
  const rListAfter = await apiGet("/doctor/patients/MC-P-ALICE6/records", doctorToken);
  assert(
    "Doctor's next record listing returns 403 immediately after revoke",
    rListAfter.status === 403,
    `Status: ${rListAfter.status}`
  );

  // Authorized patients list no longer contains Alice
  const rAuthAfter = await apiGet("/doctor/authorized-patients", doctorToken);
  const aliceStillThere = rAuthAfter.body?.data?.authorizedPatients?.some(
    (g) => g.patient.patientId === "MC-P-ALICE6"
  );
  assert(
    "Doctor authorized-patients list no longer contains Alice",
    !aliceStillThere,
    JSON.stringify(rAuthAfter.body)
  );

  // Patient's granted list is now empty
  const rGranted = await apiGet("/patient/granted", patientToken);
  assert(
    "GET /patient/granted is empty after revoke (200)",
    rGranted.status === 200 && rGranted.body?.data?.grants?.length === 0,
    JSON.stringify(rGranted.body)
  );
}

async function testCrossPatientAccessDenial() {
  console.log("\n--- 9. Cross-Patient Access Denial ---");

  // Doctor tries to access Bob's records (Bob never granted access)
  const rBobRecords = await apiGet("/doctor/patients/MC-P-BOB6/records", doctorToken);
  assert(
    "Doctor cannot access Patient B's records with Patient A's grant (403)",
    rBobRecords.status === 403,
    JSON.stringify(rBobRecords.body)
  );

  // Bob (Patient 2) tries to respond to Alice's request (403)
  const rWrongRespond = await apiPost(
    `/access/${requestId}/respond`,
    { approve: true, txHash: "0x" + "a".repeat(64) },
    patient2Token
  );
  assert("Wrong patient cannot respond to request (403)", rWrongRespond.status === 403, JSON.stringify(rWrongRespond.body));

  // Bob (Patient 2) tries to revoke Alice's request (403)
  const rWrongRevoke = await apiPost(
    `/access/${requestId}/revoke`,
    { txHash: "0x" + "a".repeat(64) },
    patient2Token
  );
  assert("Wrong patient cannot revoke request (403)", rWrongRevoke.status === 403, JSON.stringify(rWrongRevoke.body));
}

async function testUnverifiedDoctorCannotRequest() {
  console.log("\n--- 10. Unverified / Pending Doctor Cannot Request ---");

  // Create a doctor who is pending
  const pendingUser = await User.create({
    name: "Dr. Pending",
    email: "pending.doc.p6@medichain.local",
    passwordHash: await User.hashPassword("Password123!"),
    role: "doctor",
    walletAddress: "0x3333333333333333333333333333333333333333",
    isActive: true
  });
  await DoctorProfile.create({
    user: pendingUser._id,
    licenseNumber: "LIC-PENDING-001",
    specialization: "General Practice",
    hospital: "Pending Clinic",
    experienceYears: 2,
    status: "pending"
  });
  const pendingToken = await login("pending.doc.p6@medichain.local", "Password123!");

  // Pending doctor cannot request access (403)
  const rReq = await apiPost("/access/request", {
    patientId: "MC-P-ALICE6",
    reason: "Unauthorized attempt",
    txHash: "0x" + "a".repeat(64)
  }, pendingToken);
  assert(
    "Unverified/pending doctor cannot request access (403)",
    rReq.status === 403,
    JSON.stringify(rReq.body)
  );

  // Pending doctor cannot search patients (403)
  const rSearch = await apiGet("/doctor/patients/search?patientId=MC-P-ALICE6", pendingToken);
  assert(
    "Unverified/pending doctor cannot search patients (403)",
    rSearch.status === 403,
    JSON.stringify(rSearch.body)
  );
}

async function testDoctorRequestsList() {
  console.log("\n--- 11. Doctor Requests List ---");

  const r = await apiGet("/doctor/requests", doctorToken);
  assert(
    "GET /doctor/requests returns list of doctor's requests (200)",
    r.status === 200 && Array.isArray(r.body?.data?.requests),
    JSON.stringify(r.body)
  );
  const foundRevoked = r.body?.data?.requests?.some((req) => req.status === "revoked");
  assert("Doctor requests list contains the revoked request", foundRevoked, JSON.stringify(r.body));
}

// ──────────────────────────────────────────────────────────────────────────────
// Run all tests
// ──────────────────────────────────────────────────────────────────────────────
async function run() {
  console.log("\n=========================================================");
  console.log("   MEDICHAIN PHASE 6: CONSENT & ACCESS CONTROL TEST SUITE");
  console.log("=========================================================");

  try {
    await setup();
  } catch (err) {
    console.error("Setup failed:", err.message);
    process.exit(1);
  }

  try {
    await testAccessRequestValidation();
    await testPatientSearchValidation();
    await testRespondAndRevokeValidation();
    await testLiveRequestFlow();                 // Real Amoy chain
    await testPatientSeesPending();
    await testLiveGrantFlow();                   // Real Amoy chain
    await testDoctorAuthorizedRecordsAndDownload();
    await testLiveRevokeFlow();                  // Real Amoy chain
    await testCrossPatientAccessDenial();
    await testUnverifiedDoctorCannotRequest();
    await testDoctorRequestsList();
  } catch (err) {
    console.error("\nUnexpected error during tests:", err.message, err.stack);
    failed++;
  } finally {
    await teardown();
  }

  console.log("\n=========================================================");
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log("=========================================================\n");

  if (failed > 0) process.exit(1);
}

run();
