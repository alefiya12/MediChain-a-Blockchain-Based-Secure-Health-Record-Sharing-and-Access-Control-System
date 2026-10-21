/**
 * Phase 8 Integration Test Suite
 * Frontend: Admin and Doctor Flows — End-to-End on Polygon Amoy.
 *
 * Exit Criteria:
 *  - Full admin → doctor flow works in the browser against Amoy with real MetaMask signing,
 *    from registration through to a pending request visible in the DB.
 */

import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { ethers } from "ethers";
import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// App & Models
import app from "../src/app.js";
import { User } from "../src/models/User.js";
import { DoctorProfile } from "../src/models/DoctorProfile.js";
import { AccessRequest } from "../src/models/AccessRequest.js";
import { env } from "../src/config/env.js";

// Deployment & ABI
const deploymentPath = resolve(__dirname, "../../blockchain/deployments/amoy.json");
const deployment = JSON.parse(readFileSync(deploymentPath, "utf8"));
const CONTRACT_ADDRESS = deployment.address;
const artifactPath = resolve(__dirname, "../../blockchain/artifacts/contracts/MediChain.sol/MediChain.json");
const contractArtifact = JSON.parse(readFileSync(artifactPath, "utf8"));
const CONTRACT_ABI = contractArtifact.abi;

const provider = new ethers.JsonRpcProvider(env.AMOY_RPC_URL);

let mongod, server, baseUrl;
let adminWallet, doctorWallet;
let adminToken, doctorToken;
let registeredDoctorId;
let testPatientId = "MC-P-ALICE8";
let testPatientWallet = "0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199";

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

  const ADMIN_PK = process.env.DEPLOYER_PRIVATE_KEY;
  if (!ADMIN_PK) throw new Error("DEPLOYER_PRIVATE_KEY is required for phase8 tests.");
  adminWallet = new ethers.Wallet(ADMIN_PK, provider);

  // Doctor wallet — funded with POL on Amoy
  const DOCTOR_PK = ethers.keccak256(ethers.toUtf8Bytes("medichain-capstone-doctor-alefiya-private-key-v1"));
  doctorWallet = new ethers.Wallet(DOCTOR_PK, provider);

  // Seed Admin user
  await User.create({
    name: "System Admin",
    email: env.ADMIN_EMAIL,
    passwordHash: await User.hashPassword(env.ADMIN_PASSWORD),
    role: "admin",
    walletAddress: adminWallet.address.toLowerCase(),
    isActive: true
  });

  // Seed Patient user
  await User.create({
    name: "Alice Patient",
    email: "alice.p8@medichain.local",
    passwordHash: await User.hashPassword("Password123!"),
    role: "patient",
    patientId: testPatientId,
    walletAddress: testPatientWallet.toLowerCase(),
    isActive: true
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

async function testAdminStatsAndDoctorRegistration() {
  console.log("\n--- 1. Admin Stats & Doctor Registration ---");

  // Admin logs in
  const adminLogin = await apiPost("/auth/login", {
    email: env.ADMIN_EMAIL,
    password: env.ADMIN_PASSWORD
  });
  assert("Admin logs in successfully (200)", adminLogin.status === 200, JSON.stringify(adminLogin.body));
  adminToken = adminLogin.body.data.token;

  // Admin checks stats
  const statsRes = await apiGet("/admin/stats", adminToken);
  assert(
    "Admin checks stats (200)",
    statsRes.status === 200 && statsRes.body.data?.stats?.patients >= 1,
    JSON.stringify(statsRes.body)
  );

  // Doctor registers with medical credentials
  const docReg = await apiPost("/auth/register", {
    name: "Dr. Evelyn Reed",
    email: "evelyn.doctor.p8@medichain.local",
    password: "Password123!",
    role: "doctor",
    walletAddress: doctorWallet.address.toLowerCase(),
    licenseNumber: "LIC-EVELYN-P8",
    specialization: "Neurology",
    hospital: "Apex Medical Center",
    experienceYears: 12
  });
  assert(
    "Doctor registers with credentials (201, status: pending)",
    docReg.status === 201 &&
    docReg.body.data?.user?.role === "doctor" &&
    docReg.body.data?.user?.doctorStatus === "pending",
    JSON.stringify(docReg.body)
  );

  // Doctor logs in — returns pending status
  const docLogin = await apiPost("/auth/login", {
    email: "evelyn.doctor.p8@medichain.local",
    password: "Password123!"
  });
  assert(
    "Doctor logs in (200, status: pending)",
    docLogin.status === 200 && docLogin.body.data?.user?.doctorStatus === "pending",
    JSON.stringify(docLogin.body)
  );
  doctorToken = docLogin.body.data.token;

  // Pending doctor cannot search patient yet (403)
  const searchBefore = await apiGet(`/doctor/patients/search?patientId=${testPatientId}`, doctorToken);
  assert(
    "Pending doctor is blocked from searching patients (403)",
    searchBefore.status === 403,
    JSON.stringify(searchBefore.body)
  );
}

async function testAdminListsAndApprovesDoctorOnChain() {
  console.log("\n--- 2. Admin Lists & Approves Doctor On-Chain ---");

  // Admin lists pending doctors
  const pendingDocsRes = await apiGet("/admin/doctors?status=pending", adminToken);
  assert(
    "Admin lists pending doctors (200)",
    pendingDocsRes.status === 200 &&
    pendingDocsRes.body.data?.doctors?.some((d) => d.licenseNumber === "LIC-EVELYN-P8"),
    JSON.stringify(pendingDocsRes.body)
  );

  const doctorTarget = pendingDocsRes.body.data.doctors.find((d) => d.licenseNumber === "LIC-EVELYN-P8");
  registeredDoctorId = doctorTarget._id;

  // Check smart contract ownership on Polygon Amoy
  const contractAsAdmin = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, adminWallet);
  const owner = await contractAsAdmin.owner();
  assert(
    "Admin wallet is contract owner on Polygon Amoy",
    owner.toLowerCase() === adminWallet.address.toLowerCase(),
    `Owner: ${owner}, Admin: ${adminWallet.address}`
  );

  // Admin executes verifyDoctor(doctorWallet) on Polygon Amoy
  console.log(`     Admin signing verifyDoctor(${doctorWallet.address}) on Amoy...`);
  const tx = await contractAsAdmin.verifyDoctor(doctorWallet.address);
  console.log(`     Tx submitted: ${tx.hash}`);
  const receipt = await tx.wait(1);
  console.log(`     Confirmed in block: ${receipt.blockNumber}`);

  // Admin calls POST /admin/doctors/:id/approve with txHash
  const approveRes = await apiPost(`/admin/doctors/${registeredDoctorId}/approve`, {
    txHash: receipt.hash
  }, adminToken);

  assert(
    "Admin POST /approve with valid on-chain verifyDoctor tx approves doctor (200)",
    approveRes.status === 200 && approveRes.body.data?.doctor?.status === "approved",
    JSON.stringify(approveRes.body)
  );

  // Doctor status is now approved
  const docStatusRes = await apiGet("/doctor/status", doctorToken);
  assert(
    "Doctor GET /status reflects approved & chainVerified=true",
    docStatusRes.status === 200 &&
    docStatusRes.body.data?.status === "approved" &&
    docStatusRes.body.data?.chainVerified === true,
    JSON.stringify(docStatusRes.body)
  );
}

async function testDoctorSearchAndRequestAccessFlow() {
  console.log("\n--- 3. Approved Doctor Searches Patient & Requests Access On-Chain ---");

  // Doctor searches patient by ID
  const searchRes = await apiGet(`/doctor/patients/search?patientId=${testPatientId}`, doctorToken);
  assert(
    "Approved doctor searches patient by MC-P-XXXXXX ID (200)",
    searchRes.status === 200 &&
    searchRes.body.data?.patient?.patientId === testPatientId &&
    searchRes.body.data?.patient?.name === "Alice Patient",
    JSON.stringify(searchRes.body)
  );

  const patientWallet = searchRes.body.data.patient.walletAddress;

  // Doctor signs requestAccess(patientWallet) on Polygon Amoy
  const contractAsDoctor = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, doctorWallet);
  console.log(`     Doctor signing requestAccess(${patientWallet}) on Amoy...`);
  const reqTx = await contractAsDoctor.requestAccess(patientWallet);
  console.log(`     Tx submitted: ${reqTx.hash}`);
  const reqReceipt = await reqTx.wait(1);
  console.log(`     Confirmed in block: ${reqReceipt.blockNumber}`);

  // Doctor posts request to backend API
  const requestApiRes = await apiPost("/access/request", {
    patientId: testPatientId,
    reason: "Neurological examination and MRI review",
    txHash: reqReceipt.hash
  }, doctorToken);

  assert(
    "Doctor POST /access/request with on-chain tx creates pending access request (201)",
    requestApiRes.status === 201 &&
    requestApiRes.body.data?.request?.status === "pending" &&
    requestApiRes.body.data?.request?.reason === "Neurological examination and MRI review",
    JSON.stringify(requestApiRes.body)
  );

  // Doctor tracks request in /doctor/requests
  const myRequestsRes = await apiGet("/doctor/requests", doctorToken);
  assert(
    "Doctor GET /doctor/requests displays newly created pending request with txHash",
    myRequestsRes.status === 200 &&
    myRequestsRes.body.data?.requests?.some(
      (r) => r.requestTxHash === reqReceipt.hash && r.status === "pending"
    ),
    JSON.stringify(myRequestsRes.body)
  );

  // Check DB directly
  const dbRequest = await AccessRequest.findOne({ requestTxHash: reqReceipt.hash });
  assert(
    "Pending request is visible in database with matching txHash",
    dbRequest !== null && dbRequest.status === "pending"
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Run suite
// ──────────────────────────────────────────────────────────────────────────────
async function run() {
  console.log("\n=========================================================");
  console.log("   MEDICHAIN PHASE 8: ADMIN & DOCTOR FLOWS TEST SUITE");
  console.log("=========================================================");

  try {
    await setup();
    await testAdminStatsAndDoctorRegistration();
    await testAdminListsAndApprovesDoctorOnChain();
    await testDoctorSearchAndRequestAccessFlow();
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
