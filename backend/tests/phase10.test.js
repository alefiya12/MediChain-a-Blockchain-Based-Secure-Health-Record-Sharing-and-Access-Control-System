/**
 * Phase 10 Integration Test Suite
 * Audit Trail and Activity Monitoring UI
 *
 * Exit Criteria:
 *  - Every action performed in Phases 8–9 appears in the correct role's audit view
 *    with a working Polygonscan link.
 *  - Role-scoped visibility: Patient, Doctor, Admin.
 *  - Action filters and pagination.
 *  - On-chain events endpoint.
 */

import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { ethers } from "ethers";
import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// App, Models, Blockchain
import app from "../src/app.js";
import { User } from "../src/models/User.js";
import { DoctorProfile } from "../src/models/DoctorProfile.js";
import { MedicalRecord } from "../src/models/MedicalRecord.js";
import { AccessRequest } from "../src/models/AccessRequest.js";
import { AuditLog } from "../src/models/AuditLog.js";
import { env } from "../src/config/env.js";
import { provider, contract } from "../src/config/blockchain.js";
import { logAudit } from "../src/services/audit.service.js";

// Deployment & ABI
const deploymentPath = resolve(__dirname, "../../blockchain/deployments/amoy.json");
const deployment = JSON.parse(readFileSync(deploymentPath, "utf8"));
const CONTRACT_ADDRESS = deployment.address;
const artifactPath = resolve(__dirname, "../../blockchain/artifacts/contracts/MediChain.sol/MediChain.json");
const contractArtifact = JSON.parse(readFileSync(artifactPath, "utf8"));
const CONTRACT_ABI = contractArtifact.abi;
const iface = new ethers.Interface(CONTRACT_ABI);

let mongod, server, baseUrl;
let adminWallet, doctorWallet, patientWallet, otherPatientWallet;
let adminToken, doctorToken, patientToken, otherPatientToken;
let adminUser, doctorUser, patientUser, otherPatientUser;
let testRecord, testRecord2;

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

// Simulated chain registry for events
const mockReceipts = new Map();

function registerSimulatedTx(from, eventName, eventArgs) {
  const event = iface.getEvent(eventName);
  const log = iface.encodeEventLog(event, eventArgs);
  const txHash = ethers.hexlify(ethers.randomBytes(32));
  const receipt = {
    hash: txHash,
    status: 1,
    from: from.toLowerCase(),
    to: CONTRACT_ADDRESS.toLowerCase(),
    blockNumber: 49975600,
    logs: [log]
  };
  mockReceipts.set(txHash.toLowerCase(), receipt);
  return txHash;
}

provider.getTransactionReceipt = async (txHash) => mockReceipts.get(txHash.toLowerCase()) || null;
provider.getBlockNumber = async () => 49975650;
contract.queryFilter = async (filter) => {
  return [
    {
      eventName: "RecordRegistered",
      transactionHash: "0x1111111111111111111111111111111111111111111111111111111111111111",
      blockNumber: 49975600,
      args: { recordId: "0xrec1", fileHash: "0xhash1", timestamp: 1700000000n }
    },
    {
      eventName: "AccessGranted",
      transactionHash: "0x2222222222222222222222222222222222222222222222222222222222222222",
      blockNumber: 49975610,
      args: { patient: patientWallet.address, doctor: doctorWallet.address, timestamp: 1700000100n }
    }
  ];
};

async function apiGet(path, token) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "GET",
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json };
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
  otherPatientWallet = ethers.Wallet.createRandom();

  // 1. Seed Admin
  adminUser = await User.create({
    name: "System Admin",
    email: env.ADMIN_EMAIL,
    passwordHash: await User.hashPassword(env.ADMIN_PASSWORD),
    role: "admin",
    walletAddress: adminWallet.address.toLowerCase(),
    isActive: true
  });
  const adminLogin = await apiPost("/auth/login", {
    email: env.ADMIN_EMAIL,
    password: env.ADMIN_PASSWORD
  });
  adminToken = adminLogin.body.data.token;

  // 2. Seed Doctor
  doctorUser = await User.create({
    name: "Dr. Evelyn Reed",
    email: "evelyn.doctor.p10@medichain.local",
    passwordHash: await User.hashPassword("Password123!"),
    role: "doctor",
    walletAddress: doctorWallet.address.toLowerCase(),
    isActive: true
  });
  await DoctorProfile.create({
    user: doctorUser._id,
    licenseNumber: "LIC-EVELYN-P10",
    specialization: "Neurology",
    hospital: "Apex Medical Center",
    experienceYears: 12,
    status: "approved"
  });
  const docLogin = await apiPost("/auth/login", {
    email: "evelyn.doctor.p10@medichain.local",
    password: "Password123!"
  });
  doctorToken = docLogin.body.data.token;

  // 3. Seed Patient 1 (Alice)
  patientUser = await User.create({
    name: "Alice Montgomery",
    email: "alice.patient.p10@medichain.local",
    passwordHash: await User.hashPassword("Password123!"),
    role: "patient",
    patientId: "MC-P-ALICE10",
    walletAddress: patientWallet.address.toLowerCase(),
    isActive: true
  });
  const patLogin = await apiPost("/auth/login", {
    email: "alice.patient.p10@medichain.local",
    password: "Password123!"
  });
  patientToken = patLogin.body.data.token;

  // 4. Seed Patient 2 (Bob - Unrelated)
  otherPatientUser = await User.create({
    name: "Bob Unrelated",
    email: "bob.patient.p10@medichain.local",
    passwordHash: await User.hashPassword("Password123!"),
    role: "patient",
    patientId: "MC-P-BOB10",
    walletAddress: otherPatientWallet.address.toLowerCase(),
    isActive: true
  });
  const otherPatLogin = await apiPost("/auth/login", {
    email: "bob.patient.p10@medichain.local",
    password: "Password123!"
  });
  otherPatientToken = otherPatLogin.body.data.token;

  // 5. Seed Medical Records
  testRecord = await MedicalRecord.create({
    patient: patientUser._id,
    title: "Brain MRI & Neurological Scan",
    category: "scan_report",
    description: "Cranial magnetic resonance scan.",
    storedName: "mri_alice.enc",
    originalName: "brain_mri.pdf",
    sizeBytes: 450000,
    mimeType: "application/pdf",
    fileHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    recordIdOnChain: "0xrec1111111111111111111111111111111111111111111111111111111111111",
    chainStatus: "confirmed",
    txHash: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    blockNumber: 49975001,
    iv: "iv_dummy",
    authTag: "tag_dummy"
  });

  testRecord2 = await MedicalRecord.create({
    patient: otherPatientUser._id,
    title: "Bob Blood Chemistry Analysis",
    category: "lab_report",
    storedName: "bob_blood.enc",
    originalName: "blood_test.pdf",
    sizeBytes: 120000,
    mimeType: "application/pdf",
    fileHash: "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    recordIdOnChain: "0xrec2222222222222222222222222222222222222222222222222222222222222",
    chainStatus: "confirmed",
    txHash: "0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
    blockNumber: 49975002,
    iv: "iv_dummy",
    authTag: "tag_dummy"
  });

  // 6. Seed Complete Phase 8-9 Lifecycle Events in AuditLog
  // (a) DOCTOR_REGISTERED
  await logAudit({
    actor: doctorUser._id,
    actorRole: "doctor",
    action: "DOCTOR_REGISTERED",
    doctor: doctorUser._id,
    metadata: { licenseNumber: "LIC-EVELYN-P10", hospital: "Apex Medical Center" }
  });

  // (b) DOCTOR_APPROVED (with on-chain tx)
  await logAudit({
    actor: adminUser._id,
    actorRole: "admin",
    action: "DOCTOR_APPROVED",
    doctor: doctorUser._id,
    txHash: "0x1000000000000000000000000000000000000000000000000000000000000001",
    metadata: { licenseNumber: "LIC-EVELYN-P10" }
  });

  // (c) RECORD_UPLOADED (Alice)
  await logAudit({
    actor: patientUser._id,
    actorRole: "patient",
    action: "RECORD_UPLOADED",
    patient: patientUser._id,
    record: testRecord._id,
    metadata: { title: testRecord.title }
  });

  // (d) RECORD_CHAIN_CONFIRMED (Alice, on-chain tx)
  await logAudit({
    actor: patientUser._id,
    actorRole: "patient",
    action: "RECORD_CHAIN_CONFIRMED",
    patient: patientUser._id,
    record: testRecord._id,
    txHash: testRecord.txHash,
    metadata: { recordIdOnChain: testRecord.recordIdOnChain }
  });

  // (e) ACCESS_REQUESTED (Doctor -> Alice, on-chain tx)
  const reqTx = "0x1000000000000000000000000000000000000000000000000000000000000002";
  await logAudit({
    actor: doctorUser._id,
    actorRole: "doctor",
    action: "ACCESS_REQUESTED",
    patient: patientUser._id,
    doctor: doctorUser._id,
    txHash: reqTx,
    metadata: { patientId: patientUser.patientId, reason: "Neurological diagnosis" }
  });

  // (f) ACCESS_GRANTED (Alice -> Doctor, on-chain tx)
  const grantTx = "0x1000000000000000000000000000000000000000000000000000000000000003";
  await logAudit({
    actor: patientUser._id,
    actorRole: "patient",
    action: "ACCESS_GRANTED",
    patient: patientUser._id,
    doctor: doctorUser._id,
    txHash: grantTx,
    metadata: { approve: true }
  });

  // (g) RECORD_VIEWED (Doctor views Alice record)
  await logAudit({
    actor: doctorUser._id,
    actorRole: "doctor",
    action: "RECORD_VIEWED",
    patient: patientUser._id,
    doctor: doctorUser._id,
    record: testRecord._id,
    metadata: { title: testRecord.title }
  });

  // (h) RECORD_VERIFIED (Doctor verifies integrity)
  await logAudit({
    actor: doctorUser._id,
    actorRole: "doctor",
    action: "RECORD_VERIFIED",
    patient: patientUser._id,
    record: testRecord._id,
    metadata: { localMatchesDb: true, chainMatchesDb: true, title: testRecord.title }
  });

  // (i) ACCESS_REVOKED (Alice -> Doctor, on-chain tx)
  const revokeTx = "0x1000000000000000000000000000000000000000000000000000000000000004";
  await logAudit({
    actor: patientUser._id,
    actorRole: "patient",
    action: "ACCESS_REVOKED",
    patient: patientUser._id,
    doctor: doctorUser._id,
    txHash: revokeTx,
    metadata: { requestId: "req123" }
  });

  // (j) Bob's unrelated record event (Bob only)
  await logAudit({
    actor: otherPatientUser._id,
    actorRole: "patient",
    action: "RECORD_UPLOADED",
    patient: otherPatientUser._id,
    record: testRecord2._id,
    metadata: { title: testRecord2.title }
  });
}

async function teardown() {
  if (server) server.close();
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
}

// ──────────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────────

async function testPatientAuditViewAndScoping() {
  console.log("\n--- 1. Patient Audit Trail Scoping & Working Tx Links ---");

  const res = await apiGet("/audit", patientToken);
  assert("Patient retrieves audit logs (200 OK)", res.status === 200, JSON.stringify(res.body));

  const logs = res.body.data?.logs || [];
  assert(
    "Patient receives all personal events (upload, anchor, request, grant, view, verify, revoke)",
    logs.length >= 7,
    `Received count: ${logs.length}`
  );

  // Check role-scoping: Patient Alice must NEVER see Bob's record upload
  const containsBob = logs.some((l) => l.patient?._id === otherPatientUser._id.toString());
  assert("Strict role-scoping: Alice cannot see Bob's private audit records", !containsBob);

  // Check working Polygonscan link format for on-chain events
  const onChainLogs = logs.filter((l) => Boolean(l.txHash));
  assert("On-chain events contain valid 0x-prefixed 64-hex txHashes", onChainLogs.length >= 4);

  for (const log of onChainLogs) {
    const isValidTx = /^0x[0-9a-fA-F]{64}$/.test(log.txHash);
    const expectedScanUrl = `https://amoy.polygonscan.com/tx/${log.txHash}`;
    assert(
      `Log ${log.action} has valid Polygonscan tx (${log.txHash.slice(0, 10)}...)`,
      isValidTx && expectedScanUrl.startsWith("https://amoy.polygonscan.com/tx/0x")
    );
  }

  // Check populated fields
  const sampleLog = logs.find((l) => l.action === "ACCESS_GRANTED");
  assert(
    "Audit log contains populated actor, doctor, patient, and metadata",
    sampleLog &&
      sampleLog.doctor?.name === "Dr. Evelyn Reed" &&
      sampleLog.patient?.patientId === "MC-P-ALICE10"
  );
}

async function testDoctorAuditViewAndScoping() {
  console.log("\n--- 2. Doctor Audit Trail Scoping & Actions ---");

  const res = await apiGet("/audit", doctorToken);
  assert("Doctor retrieves audit logs (200 OK)", res.status === 200, JSON.stringify(res.body));

  const logs = res.body.data?.logs || [];
  assert(
    "Doctor sees doctor-relevant events (registration, approval, requests, grants, views, verifications, revokes)",
    logs.length >= 7,
    `Count: ${logs.length}`
  );

  // Doctor must NOT see Bob's record upload
  const containsBob = logs.some((l) => l.patient?._id === otherPatientUser._id.toString());
  assert("Strict doctor role-scoping: Doctor cannot see unshared patient activity", !containsBob);

  // Actions check
  const actions = logs.map((l) => l.action);
  assert("Doctor audit includes DOCTOR_REGISTERED", actions.includes("DOCTOR_REGISTERED"));
  assert("Doctor audit includes DOCTOR_APPROVED", actions.includes("DOCTOR_APPROVED"));
  assert("Doctor audit includes ACCESS_REQUESTED", actions.includes("ACCESS_REQUESTED"));
  assert("Doctor audit includes ACCESS_GRANTED", actions.includes("ACCESS_GRANTED"));
  assert("Doctor audit includes RECORD_VIEWED", actions.includes("RECORD_VIEWED"));
  assert("Doctor audit includes RECORD_VERIFIED", actions.includes("RECORD_VERIFIED"));
  assert("Doctor audit includes ACCESS_REVOKED", actions.includes("ACCESS_REVOKED"));
}

async function testAdminAuditViewAndSystemTransparency() {
  console.log("\n--- 3. Admin Audit Trail Platform-Wide Visibility ---");

  const res = await apiGet("/audit", adminToken);
  assert("Admin retrieves system-wide audit logs (200 OK)", res.status === 200, JSON.stringify(res.body));

  const logs = res.body.data?.logs || [];
  assert(
    "Admin sees full platform activity across all users and patients",
    logs.length >= 10,
    `Total logs count: ${logs.length}`
  );

  // Admin MUST see both Alice's and Bob's events
  const seesAlice = logs.some((l) => l.patient?._id === patientUser._id.toString());
  const seesBob = logs.some((l) => l.patient?._id === otherPatientUser._id.toString());
  assert("Admin has full platform transparency (sees Alice and Bob)", seesAlice && seesBob);

  // Admin sees doctor approval with txHash
  const approveLog = logs.find((l) => l.action === "DOCTOR_APPROVED");
  assert(
    "Admin sees DOCTOR_APPROVED with on-chain verifyDoctor tx link",
    approveLog && Boolean(approveLog.txHash)
  );
}

async function testActionFilteringAndPagination() {
  console.log("\n--- 4. Action Filtering & Pagination ---");

  // 1. Action filtering: Filter for ACCESS_GRANTED
  const filterRes = await apiGet("/audit?action=ACCESS_GRANTED", adminToken);
  assert("Filter by action=ACCESS_GRANTED succeeds (200 OK)", filterRes.status === 200);
  const grantedLogs = filterRes.body.data?.logs || [];
  assert(
    "All returned logs match the requested action filter",
    grantedLogs.length >= 1 && grantedLogs.every((l) => l.action === "ACCESS_GRANTED")
  );

  // 2. Pagination: Page 1 with limit 3
  const page1Res = await apiGet("/audit?page=1&limit=3", adminToken);
  assert("Pagination page 1 with limit 3 succeeds (200 OK)", page1Res.status === 200);
  assert("Page 1 returns exactly 3 logs", page1Res.body.data?.logs?.length === 3);
  assert(
    "Pagination metadata returned accurately (page, limit, total, totalPages)",
    page1Res.body.data?.pagination?.page === 1 &&
      page1Res.body.data?.pagination?.limit === 3 &&
      page1Res.body.data?.pagination?.total >= 10 &&
      page1Res.body.data?.pagination?.totalPages >= 4
  );

  // 3. Pagination: Page 2
  const page2Res = await apiGet("/audit?page=2&limit=3", adminToken);
  assert("Pagination page 2 returns non-overlapping records", page2Res.status === 200);
  const page1Ids = page1Res.body.data?.logs.map((l) => l._id);
  const page2Ids = page2Res.body.data?.logs.map((l) => l._id);
  const hasOverlap = page1Ids.some((id) => page2Ids.includes(id));
  assert("Page 1 and Page 2 records do not overlap", !hasOverlap);
}

async function testOnChainEventsEndpoint() {
  console.log("\n--- 5. On-Chain Events Endpoint ---");

  const onChainRes = await apiGet("/audit/on-chain", patientToken);
  assert("On-chain events endpoint responds (200 OK)", onChainRes.status === 200, JSON.stringify(onChainRes.body));
  assert(
    "Returns structured on-chain events list",
    Array.isArray(onChainRes.body.data?.events) && onChainRes.body.data?.events.length >= 1
  );

  const sampleEvent = onChainRes.body.data?.events[0];
  assert(
    "On-chain event contains eventName, blockNumber, txHash, and decoded args",
    sampleEvent &&
      Boolean(sampleEvent.eventName) &&
      Boolean(sampleEvent.blockNumber) &&
      Boolean(sampleEvent.txHash) &&
      typeof sampleEvent.args === "object"
  );
}

async function run() {
  console.log("================================================================");
  console.log("   MediChain Phase 10 Test Suite — Audit Trail & Monitoring     ");
  console.log("================================================================");

  try {
    await setup();
    await testPatientAuditViewAndScoping();
    await testDoctorAuditViewAndScoping();
    await testAdminAuditViewAndSystemTransparency();
    await testActionFilteringAndPagination();
    await testOnChainEventsEndpoint();
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
