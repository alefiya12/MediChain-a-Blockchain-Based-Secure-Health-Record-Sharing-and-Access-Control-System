import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import app from "../src/app.js";
import { User } from "../src/models/User.js";
import { DoctorProfile } from "../src/models/DoctorProfile.js";
import { AuditLog } from "../src/models/AuditLog.js";
import { env } from "../src/config/env.js";
import {
  getReceiptOrThrow,
  assertTxSignedBy,
  findEvent,
  isDoctorVerified
} from "../src/services/chain.service.js";

// Real on-chain deployment & verification details from Polygon Amoy
const REAL_AMOY_VERIFY_TX = "0xf8872df7a483e3c93105c952b24ebc07a708888a79ad321e3acfa578973a260d";
const REAL_AMOY_DEPLOYMENT_TX = "0x44dc7f633605c11a2d349026ccd7e75ab8d7e471edf14313e0e402f8fefe18ac";
const VERIFIED_DOCTOR_WALLET = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const BOGUS_TX_HASH = "0x1111111111111111111111111111111111111111111111111111111111111111";

let mongod;
let server;
let baseUrl;

let adminToken;
let doctor1Token;
let doctor2Token;
let patientToken;

let adminUser;
let doctor1Profile;
let doctor2Profile;
let doctorWithoutWalletProfile;

const passedTests = [];
const failedTests = [];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || "Assertion failed");
  }
}

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✅ PASS: ${name}`);
    passedTests.push(name);
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     Error: ${err.message}`);
    failedTests.push({ name, error: err.message });
  }
}

async function setup() {
  process.env.NODE_ENV = "test";
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  await mongoose.connect(uri);

  // Start server on an ephemeral port
  server = app.listen(0);
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}/api`;

  // Seed Admin
  const adminPasswordHash = await User.hashPassword(env.ADMIN_PASSWORD);
  adminUser = await User.create({
    name: "Admin User",
    email: env.ADMIN_EMAIL,
    passwordHash: adminPasswordHash,
    role: "admin",
    walletAddress: env.ADMIN_WALLET,
    isActive: true
  });

  // Seed Doctor 1 (with wallet matching real verified tx)
  const doc1PasswordHash = await User.hashPassword("Password123!");
  const doc1User = await User.create({
    name: "Dr. Alice Smith",
    email: "alice.doctor@medichain.local",
    passwordHash: doc1PasswordHash,
    role: "doctor",
    walletAddress: VERIFIED_DOCTOR_WALLET.toLowerCase(),
    isActive: true
  });
  doctor1Profile = await DoctorProfile.create({
    user: doc1User._id,
    licenseNumber: "MED-DOC-001",
    specialization: "Cardiology",
    hospital: "City Heart Hospital",
    experienceYears: 10,
    status: "pending"
  });

  // Seed Doctor 2 (pending, to test rejection)
  const doc2PasswordHash = await User.hashPassword("Password123!");
  const doc2User = await User.create({
    name: "Dr. Bob Miller",
    email: "bob.doctor@medichain.local",
    passwordHash: doc2PasswordHash,
    role: "doctor",
    walletAddress: "0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc",
    isActive: true
  });
  doctor2Profile = await DoctorProfile.create({
    user: doc2User._id,
    licenseNumber: "MED-DOC-002",
    specialization: "Neurology",
    hospital: "Central Hospital",
    experienceYears: 6,
    status: "pending"
  });

  // Seed Doctor without wallet
  const docNoWalletUser = await User.create({
    name: "Dr. No Wallet",
    email: "nowallet.doctor@medichain.local",
    passwordHash: doc2PasswordHash,
    role: "doctor",
    isActive: true
  });
  doctorWithoutWalletProfile = await DoctorProfile.create({
    user: docNoWalletUser._id,
    licenseNumber: "MED-DOC-003",
    specialization: "Pediatrics",
    hospital: "Children Care",
    experienceYears: 4,
    status: "pending"
  });

  // Seed Patient
  const patPasswordHash = await User.hashPassword("Password123!");
  const patUser = await User.create({
    name: "John Patient",
    email: "john.patient@medichain.local",
    passwordHash: patPasswordHash,
    role: "patient",
    walletAddress: "0x90f79bf6eb2c4f870365e785982e1f101e93b906",
    patientId: "MC-P-TEST01",
    isActive: true
  });

  // Log in and get tokens
  const login = async (email, password) => {
    const res = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    const json = await res.json();
    return json.data.token;
  };

  adminToken = await login(env.ADMIN_EMAIL, env.ADMIN_PASSWORD);
  doctor1Token = await login("alice.doctor@medichain.local", "Password123!");
  doctor2Token = await login("bob.doctor@medichain.local", "Password123!");
  patientToken = await login("john.patient@medichain.local", "Password123!");
}

async function teardown() {
  if (server) server.close();
  if (mongoose.connection) await mongoose.disconnect();
  if (mongod) await mongod.stop();
}

async function runTests() {
  console.log("\n========================================================");
  console.log("   MEDICHAIN PHASE 4: VERIFICATION TEST SUITE");
  console.log("========================================================\n");

  await setup();

  console.log("--- 1. Chain Service Functionality ---");
  await test("getReceiptOrThrow throws for invalid txHash format", async () => {
    let threw = false;
    try {
      await getReceiptOrThrow("not-a-tx-hash");
    } catch (err) {
      threw = true;
      assert(err.message.includes("Invalid transaction hash format"), err.message);
    }
    assert(threw, "Expected error on malformed txHash");
  });

  await test("getReceiptOrThrow throws for non-existent / bogus txHash", async () => {
    let threw = false;
    try {
      await getReceiptOrThrow(BOGUS_TX_HASH);
    } catch (err) {
      threw = true;
      assert(err.message.includes("not found or not yet confirmed"), err.message);
    }
    assert(threw, "Expected error on bogus txHash");
  });

  await test("getReceiptOrThrow throws when receipt.to does not match contract address", async () => {
    let threw = false;
    try {
      // Deployment tx has receipt.to = null
      await getReceiptOrThrow(REAL_AMOY_DEPLOYMENT_TX);
    } catch (err) {
      threw = true;
      assert(err.message.includes("expected MediChain contract"), err.message);
    }
    assert(threw, "Expected error on non-contract transaction");
  });

  await test("assertTxSignedBy verifies sender and rejects wrong signer", async () => {
    const receipt = await getReceiptOrThrow(REAL_AMOY_VERIFY_TX);
    // Real tx was signed by env.ADMIN_WALLET
    await assertTxSignedBy(receipt, env.ADMIN_WALLET);

    let threw = false;
    try {
      await assertTxSignedBy(receipt, "0x0000000000000000000000000000000000000001");
    } catch (err) {
      threw = true;
      assert(err.message.includes("Transaction was signed by"), err.message);
    }
    assert(threw, "Expected error on non-admin signer");
  });

  await test("findEvent parses DoctorVerified event correctly", async () => {
    const receipt = await getReceiptOrThrow(REAL_AMOY_VERIFY_TX);
    const event = findEvent(receipt, "DoctorVerified");
    assert(event !== null, "DoctorVerified event not found");
    const docArg = (event.args.doctor || event.args[0]).toLowerCase();
    assert(docArg === VERIFIED_DOCTOR_WALLET.toLowerCase(), `Expected ${VERIFIED_DOCTOR_WALLET}, got ${docArg}`);
  });

  await test("isDoctorVerified accurately reads smart contract state on Amoy", async () => {
    const isVerified = await isDoctorVerified(VERIFIED_DOCTOR_WALLET);
    assert(isVerified === true, "Doctor should be verified on-chain");

    const unverified = await isDoctorVerified("0x0000000000000000000000000000000000000001");
    assert(unverified === false, "Random address should not be verified on-chain");
  });

  console.log("\n--- 2. Admin API Authentication & Role RBAC ---");
  await test("GET /api/admin/doctors requires authentication (401)", async () => {
    const res = await fetch(`${baseUrl}/admin/doctors`);
    assert(res.status === 401, `Expected 401, got ${res.status}`);
  });

  await test("GET /api/admin/doctors rejects non-admin roles (403 for doctor & patient)", async () => {
    const resDoc = await fetch(`${baseUrl}/admin/doctors`, {
      headers: { Authorization: `Bearer ${doctor1Token}` }
    });
    assert(resDoc.status === 403, `Expected 403 for doctor, got ${resDoc.status}`);

    const resPat = await fetch(`${baseUrl}/admin/doctors`, {
      headers: { Authorization: `Bearer ${patientToken}` }
    });
    assert(resPat.status === 403, `Expected 403 for patient, got ${resPat.status}`);
  });

  await test("GET /api/admin/doctors succeeds for admin and supports ?status filtering", async () => {
    const resAll = await fetch(`${baseUrl}/admin/doctors`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(resAll.status === 200, `Expected 200, got ${resAll.status}`);
    const dataAll = await resAll.json();
    assert(dataAll.success === true, "Expected success: true");
    assert(dataAll.data.doctors.length >= 3, `Expected at least 3 doctors, got ${dataAll.data.doctors.length}`);

    const resPending = await fetch(`${baseUrl}/admin/doctors?status=pending`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const dataPending = await resPending.json();
    assert(dataPending.data.doctors.every((d) => d.status === "pending"), "All returned doctors must be pending");

    const resInvalid = await fetch(`${baseUrl}/admin/doctors?status=unknown`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(resInvalid.status === 400, `Expected 400 for invalid status, got ${resInvalid.status}`);
  });

  await test("GET /api/admin/doctors/:id returns doctor detail and live chainVerified flag", async () => {
    const res = await fetch(`${baseUrl}/admin/doctors/${doctor1Profile._id}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const json = await res.json();
    assert(json.data.doctor._id === doctor1Profile._id.toString(), "Doctor ID should match");
    assert(json.data.chainVerified === true, "Doctor 1 is verified on Amoy chain");
  });

  await test("GET /api/admin/doctors/:id returns 404 for non-existent doctor", async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await fetch(`${baseUrl}/admin/doctors/${fakeId}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(res.status === 404, `Expected 404, got ${res.status}`);
  });

  console.log("\n--- 3. Exit Criteria: Bogus & Non-Admin Tx Rejection ---");
  await test("POST /api/admin/doctors/:id/approve rejects missing txHash (400)", async () => {
    const res = await fetch(`${baseUrl}/admin/doctors/${doctor1Profile._id}/approve`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({})
    });
    assert(res.status === 400, `Expected 400, got ${res.status}`);
    const json = await res.json();
    assert(json.message.includes("txHash"), json.message);
  });

  await test("POST /api/admin/doctors/:id/approve rejects bogus txHash (400)", async () => {
    const res = await fetch(`${baseUrl}/admin/doctors/${doctor1Profile._id}/approve`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ txHash: BOGUS_TX_HASH })
    });
    assert(res.status === 400, `Expected 400, got ${res.status}`);
    const json = await res.json();
    assert(json.message.includes("not found or not yet confirmed"), json.message);
  });

  await test("POST /api/admin/doctors/:id/approve rejects other-contract txHash (400)", async () => {
    const res = await fetch(`${baseUrl}/admin/doctors/${doctor1Profile._id}/approve`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ txHash: REAL_AMOY_DEPLOYMENT_TX })
    });
    assert(res.status === 400, `Expected 400, got ${res.status}`);
    const json = await res.json();
    assert(json.message.includes("expected MediChain contract"), json.message);
  });

  await test("POST /api/admin/doctors/:id/approve rejects doctor without wallet linked (400)", async () => {
    const res = await fetch(`${baseUrl}/admin/doctors/${doctorWithoutWalletProfile._id}/approve`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ txHash: REAL_AMOY_VERIFY_TX })
    });
    assert(res.status === 400, `Expected 400, got ${res.status}`);
    const json = await res.json();
    assert(json.message.includes("wallet address linked"), json.message);
  });

  await test("POST /api/admin/doctors/:id/approve rejects tx if event wallet does not match doctor (400)", async () => {
    // Calling approve on doctor 2 with the txHash that verified doctor 1
    const res = await fetch(`${baseUrl}/admin/doctors/${doctor2Profile._id}/approve`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ txHash: REAL_AMOY_VERIFY_TX })
    });
    assert(res.status === 400, `Expected 400, got ${res.status}`);
    const json = await res.json();
    assert(json.message.includes("Transaction event verified doctor"), json.message);
  });

  console.log("\n--- 4. Exit Criteria: Doctor Approval with Valid On-Chain Tx ---");
  await test("POST /api/admin/doctors/:id/approve with valid on-chain verifyDoctor tx sets status to approved and writes AuditLog", async () => {
    const res = await fetch(`${baseUrl}/admin/doctors/${doctor1Profile._id}/approve`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ txHash: REAL_AMOY_VERIFY_TX })
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const json = await res.json();
    assert(json.success === true, "Expected success: true");
    assert(json.data.doctor.status === "approved", "Doctor status should be approved");
    assert(json.data.doctor.verifyTxHash === REAL_AMOY_VERIFY_TX, "TxHash should be stored");

    // Verify DB update
    const updated = await DoctorProfile.findById(doctor1Profile._id);
    assert(updated.status === "approved", "DoctorProfile in DB should be approved");
    assert(updated.verifiedBy.toString() === adminUser._id.toString(), "verifiedBy should be admin ID");
    assert(updated.verifiedAt !== undefined, "verifiedAt should be set");

    // Verify AuditLog
    const audit = await AuditLog.findOne({
      action: "DOCTOR_APPROVED",
      doctor: updated.user
    });
    assert(audit !== null, "AuditLog for DOCTOR_APPROVED must exist");
    assert(audit.actorRole === "admin", "Audit actorRole must be admin");
    assert(audit.txHash === REAL_AMOY_VERIFY_TX, "Audit txHash must match");
  });

  console.log("\n--- 5. Doctor Rejection Flow ---");
  await test("POST /api/admin/doctors/:id/reject validates reason and updates status to rejected", async () => {
    // Missing reason check
    const badRes = await fetch(`${baseUrl}/admin/doctors/${doctor2Profile._id}/reject`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({})
    });
    assert(badRes.status === 400, `Expected 400 for missing reason, got ${badRes.status}`);

    // Valid rejection
    const reasonText = "Incomplete license documentation provided";
    const res = await fetch(`${baseUrl}/admin/doctors/${doctor2Profile._id}/reject`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ reason: reasonText })
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const json = await res.json();
    assert(json.data.doctor.status === "rejected", "Doctor status should be rejected");
    assert(json.data.doctor.rejectionReason === reasonText, "Rejection reason must match");

    // Verify DB
    const updated = await DoctorProfile.findById(doctor2Profile._id);
    assert(updated.status === "rejected", "DoctorProfile in DB should be rejected");
    assert(updated.rejectionReason === reasonText, "Rejection reason in DB must match");

    // Verify AuditLog
    const audit = await AuditLog.findOne({
      action: "DOCTOR_REJECTED",
      doctor: updated.user
    });
    assert(audit !== null, "AuditLog for DOCTOR_REJECTED must exist");
    assert(audit.actorRole === "admin", "Audit actorRole must be admin");
    assert(audit.metadata.reason === reasonText, "Audit metadata must include rejection reason");
  });

  console.log("\n--- 6. Admin Stats Endpoint ---");
  await test("GET /api/admin/stats returns correct counts", async () => {
    const res = await fetch(`${baseUrl}/admin/stats`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const json = await res.json();
    assert(json.success === true, "Expected success: true");
    const { stats } = json.data;
    assert(stats.patients === 1, `Expected 1 patient, got ${stats.patients}`);
    assert(stats.doctors.total >= 3, `Expected >= 3 total doctors, got ${stats.doctors.total}`);
    assert(stats.doctors.approved === 1, `Expected 1 approved doctor, got ${stats.doctors.approved}`);
    assert(stats.doctors.rejected === 1, `Expected 1 rejected doctor, got ${stats.doctors.rejected}`);
    assert(stats.records === 0, `Expected 0 records, got ${stats.records}`);
    assert(stats.accessRequests === 0, `Expected 0 access requests, got ${stats.accessRequests}`);
  });

  console.log("\n--- 7. Doctor Endpoints & requireApprovedDoctor Middleware ---");
  await test("GET /api/doctor/profile returns authenticated doctor profile and on-chain status", async () => {
    const res = await fetch(`${baseUrl}/doctor/profile`, {
      headers: { Authorization: `Bearer ${doctor1Token}` }
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const json = await res.json();
    assert(json.data.profile.licenseNumber === "MED-DOC-001", "License number should match");
    assert(json.data.chainVerified === true, "Chain verification should be true");
  });

  await test("GET /api/doctor/status returns doctor status and rejectionReason", async () => {
    const res1 = await fetch(`${baseUrl}/doctor/status`, {
      headers: { Authorization: `Bearer ${doctor1Token}` }
    });
    const json1 = await res1.json();
    assert(json1.data.status === "approved", "Doctor 1 status should be approved");

    const res2 = await fetch(`${baseUrl}/doctor/status`, {
      headers: { Authorization: `Bearer ${doctor2Token}` }
    });
    const json2 = await res2.json();
    assert(json2.data.status === "rejected", "Doctor 2 status should be rejected");
    assert(json2.data.rejectionReason === "Incomplete license documentation provided", "Rejection reason must match");
  });

  await test("requireApprovedDoctor middleware allows approved doctor and blocks unapproved doctors (403)", async () => {
    // Approved doctor should succeed (200)
    const resApproved = await fetch(`${baseUrl}/doctor/approved-access`, {
      headers: { Authorization: `Bearer ${doctor1Token}` }
    });
    assert(resApproved.status === 200, `Expected 200 for approved doctor, got ${resApproved.status}`);
    const jsonApproved = await resApproved.json();
    assert(jsonApproved.success === true, "Expected success: true");

    // Rejected doctor should fail (403)
    const resRejected = await fetch(`${baseUrl}/doctor/approved-access`, {
      headers: { Authorization: `Bearer ${doctor2Token}` }
    });
    assert(resRejected.status === 403, `Expected 403 for rejected doctor, got ${resRejected.status}`);

    // Patient should fail (403)
    const resPatient = await fetch(`${baseUrl}/doctor/approved-access`, {
      headers: { Authorization: `Bearer ${patientToken}` }
    });
    assert(resPatient.status === 403, `Expected 403 for patient, got ${resPatient.status}`);
  });


  await teardown();

  console.log("\n========================================================");
  console.log(`TEST SUMMARY: ${passedTests.length} PASSED, ${failedTests.length} FAILED`);
  console.log("========================================================\n");

  if (failedTests.length > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Fatal test runner error:", err);
  process.exit(1);
});
