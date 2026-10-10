/**
 * Phase 5 Integration Test Suite
 * Medical Records — Upload, Encrypt, Hash, Confirm, Download, Verify, Tamper Detection
 *
 * Uses:
 *  - mongodb-memory-server (in-process DB)
 *  - Real Polygon Amoy chain for on-chain confirmation
 *  - Real registerRecord tx signed by patient wallet via ethers.js
 */

import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ethers } from "ethers";
import app from "../src/app.js";
import { User } from "../src/models/User.js";
import { DoctorProfile } from "../src/models/DoctorProfile.js";
import { MedicalRecord } from "../src/models/MedicalRecord.js";
import { AuditLog } from "../src/models/AuditLog.js";
import { env } from "../src/config/env.js";
import { sha256Hex, encryptBuffer, decryptBuffer } from "../src/services/crypto.service.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORAGE_DIR = path.join(__dirname, "../storage");

// --- Test state ---
let mongod;
let server;
let baseUrl;
let patientToken;
let patient2Token;
let doctorToken;
let adminToken;
let patientUser;
let patient2User;
let testRecordId;
let testRecordFileHash;
let testRecordIdOnChain;
let uploadedEncFilePath;
const passedTests = [];
const failedTests = [];

// --- Utilities ---
function assert(cond, msg) {
  if (!cond) throw new Error(msg || "Assertion failed");
}

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✅ PASS: ${name}`);
    passedTests.push(name);
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     ${err.message}`);
    failedTests.push({ name, error: err.message });
  }
}

/** Create minimal PDF-like buffer for testing */
function makeFakePdf(content = "MediChain test record content") {
  // Minimal valid PDF header so MIME detection is consistent
  return Buffer.from(`%PDF-1.4\n%test\n${content}\n%%EOF`);
}

/** Minimal multipart/form-data builder */
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

// --- Setup / Teardown ---
async function setup() {
  process.env.NODE_ENV = "test";
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  server = app.listen(0);
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}/api`;

  await fs.mkdir(STORAGE_DIR, { recursive: true });

  // --- Seed Users ---
  const hash = (pw) => User.hashPassword(pw);

  // Admin — no wallet in test (the deployer key is also the admin wallet in .env,
  // but we assign that wallet to the patient signer; admin doesn't need wallet in DB for these tests)
  const adminUser = await User.create({
    name: "Admin",
    email: env.ADMIN_EMAIL,
    passwordHash: await hash(env.ADMIN_PASSWORD),
    role: "admin",
    isActive: true
  });


  // Patient 1 — the patient who will sign registerRecord on Amoy.
  // We use the DEPLOYER_PRIVATE_KEY as the patient signer for on-chain tests.
  // The admin is seeded with env.ADMIN_WALLET; patient must use a DIFFERENT wallet.
  const PATIENT_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;
  let patientWallet;
  if (PATIENT_PRIVATE_KEY) {
    const signerWallet = new ethers.Wallet(PATIENT_PRIVATE_KEY);
    // Derive a deterministic second account from the deployer key so it is unique
    // and we know the private key for signing on Amoy.
    // Use the 2nd HD child (m/44'/60'/0'/0/1) derived from a fixed mnemonic equivalent.
    // Simplest: use the deployer itself as patient — but admin already uses that wallet.
    // Resolution: patient gets the deployer wallet; admin is seeded WITHOUT a wallet
    // (admin never signs on-chain in our system — only admins approve via UI).
    patientWallet = signerWallet.address.toLowerCase();
  } else {
    patientWallet = "0x15d34aaf54267db7d7c367839aaf71a00a2c6a65"; // Hardhat account #4 fallback
  }


  patientUser = await User.create({
    name: "Alice Patient",
    email: "alice.patient@medichain.local",
    passwordHash: await hash("Password123!"),
    role: "patient",
    walletAddress: patientWallet,
    patientId: "MC-P-ALICE1",
    isActive: true
  });

  // Patient 2 — different wallet
  patient2User = await User.create({
    name: "Bob Patient",
    email: "bob.patient@medichain.local",
    passwordHash: await hash("Password123!"),
    role: "patient",
    walletAddress: "0x70997970c51812dc3a010c7d01b50e0d17dc79c8",
    patientId: "MC-P-BOB123",
    isActive: true
  });

  // Doctor — approved
  const docUser = await User.create({
    name: "Dr. Carol",
    email: "carol.doctor@medichain.local",
    passwordHash: await hash("Password123!"),
    role: "doctor",
    walletAddress: "0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc",
    isActive: true
  });
  await DoctorProfile.create({
    user: docUser._id,
    licenseNumber: "MD-CAROL-001",
    specialization: "Radiology",
    hospital: "Test Hospital",
    experienceYears: 8,
    status: "approved"
  });

  // --- Get tokens ---
  const login = async (email, pw) => {
    const res = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: pw })
    });
    return (await res.json()).data.token;
  };

  patientToken = await login("alice.patient@medichain.local", "Password123!");
  patient2Token = await login("bob.patient@medichain.local", "Password123!");
  doctorToken = await login("carol.doctor@medichain.local", "Password123!");
  adminToken = await login(env.ADMIN_EMAIL, env.ADMIN_PASSWORD);
}

async function teardown() {
  if (server) server.close();
  if (mongoose.connection) await mongoose.disconnect();
  if (mongod) await mongod.stop();
}

// --- Test Groups ---
async function runTests() {
  console.log("\n=========================================================");
  console.log("   MEDICHAIN PHASE 5: MEDICAL RECORDS TEST SUITE");
  console.log("=========================================================\n");

  await setup();

  // =========================================================
  console.log("--- 1. Crypto Service Unit Tests ---");
  // =========================================================
  await test("sha256Hex returns 0x-prefixed 64-char hex", () => {
    const buf = Buffer.from("medichain test");
    const h = sha256Hex(buf);
    assert(h.startsWith("0x"), "Must start with 0x");
    assert(h.length === 66, `Expected 66 chars, got ${h.length}`);
    assert(/^0x[0-9a-f]{64}$/.test(h), "Must be lowercase hex");
  });

  await test("sha256Hex is deterministic for same input", () => {
    const buf = Buffer.from("same input");
    assert(sha256Hex(buf) === sha256Hex(buf), "Must be deterministic");
  });

  await test("encryptBuffer + decryptBuffer roundtrip produces identical plaintext", () => {
    const original = Buffer.from("Medical record plaintext content for AES-GCM test");
    const { encrypted, iv, authTag } = encryptBuffer(original);
    assert(!original.equals(encrypted), "Ciphertext must differ from plaintext");
    const decrypted = decryptBuffer(encrypted, iv, authTag);
    assert(original.equals(decrypted), "Decrypted must equal original");
  });

  await test("Flipping a ciphertext byte causes decryptBuffer to throw (GCM auth tag)", () => {
    const buf = Buffer.from("tamper test");
    const { encrypted, iv, authTag } = encryptBuffer(buf);
    encrypted[0] ^= 0xFF; // flip first byte
    let threw = false;
    try { decryptBuffer(encrypted, iv, authTag); } catch { threw = true; }
    assert(threw, "Must throw on tampered ciphertext");
  });

  await test("rehash after decrypt equals original hash", () => {
    const original = Buffer.from("rehash roundtrip test");
    const originalHash = sha256Hex(original);
    const { encrypted, iv, authTag } = encryptBuffer(original);
    const decrypted = decryptBuffer(encrypted, iv, authTag);
    const rehash = sha256Hex(decrypted);
    assert(rehash === originalHash, "Rehash must equal original hash");
  });

  // =========================================================
  console.log("\n--- 2. Upload Middleware Validation ---");
  // =========================================================
  await test("Upload rejects missing file (400)", async () => {
    const res = await fetch(`${baseUrl}/records`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${patientToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ title: "Test", category: "prescription" })
    });
    assert(res.status === 400, `Expected 400, got ${res.status}`);
  });

  await test("Upload rejects .exe file (400 — wrong MIME and extension)", async () => {
    const buf = Buffer.from("MZ executable");
    const { body, contentType } = buildFormData(
      { title: "Bad file", category: "prescription" },
      buf,
      "malware.exe",
      "application/octet-stream"
    );
    const res = await fetch(`${baseUrl}/records`, {
      method: "POST",
      headers: { Authorization: `Bearer ${patientToken}`, "Content-Type": contentType },
      body
    });
    assert(res.status === 400, `Expected 400 for .exe, got ${res.status}`);
    const json = await res.json();
    assert(json.message.toLowerCase().includes("invalid file type"), json.message);
  });

  await test("Upload rejects file > 10 MB (400)", async () => {
    const bigBuf = Buffer.alloc(11 * 1024 * 1024, 0x41); // 11 MB of 'A'
    const { body, contentType } = buildFormData(
      { title: "Big file", category: "prescription" },
      bigBuf,
      "big.pdf",
      "application/pdf"
    );
    const res = await fetch(`${baseUrl}/records`, {
      method: "POST",
      headers: { Authorization: `Bearer ${patientToken}`, "Content-Type": contentType },
      body
    });
    assert(res.status === 400, `Expected 400 for > 10 MB, got ${res.status}`);
    const json = await res.json();
    assert(json.message.toLowerCase().includes("10 mb"), json.message);
  });

  await test("Upload rejects unauthenticated request (401)", async () => {
    const buf = makeFakePdf();
    const { body, contentType } = buildFormData(
      { title: "Test", category: "prescription" },
      buf,
      "test.pdf",
      "application/pdf"
    );
    const res = await fetch(`${baseUrl}/records`, {
      method: "POST",
      headers: { "Content-Type": contentType },
      body
    });
    assert(res.status === 401, `Expected 401, got ${res.status}`);
  });

  await test("Upload rejects non-patient role (admin token) (403)", async () => {
    const buf = makeFakePdf();
    const { body, contentType } = buildFormData(
      { title: "Test", category: "prescription" },
      buf,
      "test.pdf",
      "application/pdf"
    );
    const res = await fetch(`${baseUrl}/records`, {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": contentType },
      body
    });
    assert(res.status === 403, `Expected 403, got ${res.status}`);
  });

  // =========================================================
  console.log("\n--- 3. Upload — Encrypt & Store ---");
  // =========================================================
  await test("POST /api/records — encrypts file, stores .enc, returns fileHash and recordIdOnChain", async () => {
    const originalContent = "This is a test medical PDF for MediChain Phase 5 exit criteria";
    const buf = makeFakePdf(originalContent);
    const expectedHash = sha256Hex(buf);

    const { body, contentType } = buildFormData(
      { title: "Phase 5 Test Record", category: "lab_report", description: "Test description" },
      buf,
      "report.pdf",
      "application/pdf"
    );

    const res = await fetch(`${baseUrl}/records`, {
      method: "POST",
      headers: { Authorization: `Bearer ${patientToken}`, "Content-Type": contentType },
      body
    });

    assert(res.status === 201, `Expected 201, got ${res.status}`);
    const json = await res.json();
    assert(json.success === true, "success must be true");

    const { record, fileHash, recordIdOnChain } = json.data;
    assert(fileHash === expectedHash, `fileHash mismatch: ${fileHash} vs ${expectedHash}`);
    assert(/^0x[0-9a-f]{64}$/.test(recordIdOnChain), "recordIdOnChain must be bytes32 hex");
    assert(record.chainStatus === "pending", "chainStatus must start as pending");
    assert(record.originalName === "report.pdf", "originalName must be report.pdf");
    assert(record.mimeType === "application/pdf", "mimeType must be application/pdf");

    // Verify encrypted file is on disk
    const dbRecord = await MedicalRecord.findById(record._id);
    assert(dbRecord, "Record must exist in DB");
    uploadedEncFilePath = path.join(STORAGE_DIR, dbRecord.storedName);

    const encData = await fs.readFile(uploadedEncFilePath);
    assert(encData.length > 0, ".enc file must exist and be non-empty");
    assert(!encData.equals(buf), "On-disk data must NOT equal plaintext — must be ciphertext");

    // Attempt to read ciphertext as UTF-8 — should not contain original text
    const rawText = encData.toString("utf8");
    assert(!rawText.includes(originalContent), "Ciphertext must not contain readable original text");

    // Store for subsequent tests
    testRecordId = record._id;
    testRecordFileHash = fileHash;
    testRecordIdOnChain = recordIdOnChain;

    console.log(`     Record ID: ${testRecordId}`);
    console.log(`     fileHash : ${testRecordFileHash}`);
    console.log(`     idOnChain: ${testRecordIdOnChain}`);
    console.log(`     .enc file: ${dbRecord.storedName}`);
  });

  // =========================================================
  console.log("\n--- 4. Mine Route ---");
  // =========================================================
  await test("GET /api/records/mine returns patient's records without storedName/iv/authTag", async () => {
    const res = await fetch(`${baseUrl}/records/mine`, {
      headers: { Authorization: `Bearer ${patientToken}` }
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const json = await res.json();
    assert(json.data.records.length >= 1, "Should have at least 1 record");
    const r = json.data.records[0];
    assert(!("storedName" in r), "storedName must not be exposed");
    assert(!("iv" in r), "iv must not be exposed");
    assert(!("authTag" in r), "authTag must not be exposed");
    assert(r.fileHash !== undefined, "fileHash should be present");
  });

  await test("GET /api/records/mine rejects patient2 from seeing alice's records", async () => {
    const res = await fetch(`${baseUrl}/records/mine`, {
      headers: { Authorization: `Bearer ${patient2Token}` }
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const json = await res.json();
    // patient2 has no records uploaded
    assert(json.data.records.length === 0, "Patient2 should have 0 records");
  });

  // =========================================================
  console.log("\n--- 5. On-Chain Confirm (uses Polygon Amoy) ---");
  // =========================================================
  await test("POST /api/records/:id/confirm — verifies on-chain receipt and event, sets chainStatus=confirmed", async () => {
    const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;
    if (!DEPLOYER_PRIVATE_KEY) {
      throw new Error("DEPLOYER_PRIVATE_KEY env not set — cannot sign registerRecord on Amoy");
    }

    // Sign and submit registerRecord on Polygon Amoy
    const provider = new ethers.JsonRpcProvider(env.AMOY_RPC_URL);
    const signer = new ethers.Wallet(DEPLOYER_PRIVATE_KEY, provider);
    const contractJson = JSON.parse(
      await fs.readFile(
        path.join(__dirname, "../src/contracts/MediChain.json"),
        "utf-8"
      )
    );
    const contract = new ethers.Contract(
      env.CONTRACT_ADDRESS,
      contractJson.abi,
      signer
    );

    console.log(`     Signing registerRecord on Amoy (signer: ${signer.address})...`);
    const tx = await contract.registerRecord(testRecordIdOnChain, testRecordFileHash);
    console.log(`     Tx submitted: ${tx.hash}`);
    const receipt = await tx.wait(1);
    console.log(`     Confirmed in block: ${receipt.blockNumber}`);

    // Now confirm via API
    const res = await fetch(`${baseUrl}/records/${testRecordId}/confirm`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${patientToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ txHash: receipt.hash })
    });

    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const json = await res.json();
    assert(json.data.record.chainStatus === "confirmed", "chainStatus must be confirmed");
    assert(json.data.record.txHash === receipt.hash, "txHash must be stored");
    assert(json.data.record.blockNumber === receipt.blockNumber, "blockNumber must be stored");

    // Check DB
    const dbRecord = await MedicalRecord.findById(testRecordId);
    assert(dbRecord.chainStatus === "confirmed", "DB must show confirmed");

    // Check audit logs
    const uploadAudit = await AuditLog.findOne({ record: testRecordId, action: "RECORD_UPLOADED" });
    const confirmAudit = await AuditLog.findOne({ record: testRecordId, action: "RECORD_CHAIN_CONFIRMED" });
    assert(uploadAudit !== null, "RECORD_UPLOADED audit log must exist");
    assert(confirmAudit !== null, "RECORD_CHAIN_CONFIRMED audit log must exist");
    assert(confirmAudit.txHash === receipt.hash, "Confirm audit must store txHash");
  });

  await test("POST /api/records/:id/confirm — rejects duplicate confirmation (400)", async () => {
    const res = await fetch(`${baseUrl}/records/${testRecordId}/confirm`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${patientToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ txHash: "0x" + "a".repeat(64) })
    });
    assert(res.status === 400, `Expected 400, got ${res.status}`);
    const json = await res.json();
    assert(json.message.includes("already confirmed"), json.message);
  });

  await test("POST /api/records/:id/confirm — rejects wrong owner (403)", async () => {
    // Create a record owned by patient1, then try to confirm as patient2
    const buf = makeFakePdf("patient2 cannot confirm this");
    const { body, contentType } = buildFormData(
      { title: "Ownership Test", category: "prescription" },
      buf,
      "test.pdf",
      "application/pdf"
    );
    const uploadRes = await fetch(`${baseUrl}/records`, {
      method: "POST",
      headers: { Authorization: `Bearer ${patientToken}`, "Content-Type": contentType },
      body
    });
    const uploadJson = await uploadRes.json();
    const newId = uploadJson.data.record._id;

    const confirmRes = await fetch(`${baseUrl}/records/${newId}/confirm`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${patient2Token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ txHash: "0x" + "b".repeat(64) })
    });
    assert(confirmRes.status === 403, `Expected 403, got ${confirmRes.status}`);
  });

  // =========================================================
  console.log("\n--- 6. Download ---");
  // =========================================================
  await test("GET /api/records/:id/download — owner decrypts and downloads correctly", async () => {
    const res = await fetch(`${baseUrl}/records/${testRecordId}/download`, {
      headers: { Authorization: `Bearer ${patientToken}` }
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(
      res.headers.get("content-type")?.includes("application/pdf"),
      `Expected PDF content-type, got ${res.headers.get("content-type")}`
    );
    const disposition = res.headers.get("content-disposition");
    assert(disposition?.includes("attachment"), "Must have attachment Content-Disposition");
    assert(disposition?.includes("report.pdf"), "Must include original filename");
    assert(!disposition?.includes(".enc"), "Must NOT expose storedName");

    const body = await res.arrayBuffer();
    const downloaded = Buffer.from(body);
    assert(downloaded.length > 0, "Downloaded file must be non-empty");
    // Verify content hash matches stored hash
    const downloadedHash = sha256Hex(downloaded);
    assert(downloadedHash === testRecordFileHash, "Downloaded file hash must match stored fileHash");
  });

  await test("GET /api/records/:id/download — wrong patient gets 403", async () => {
    const res = await fetch(`${baseUrl}/records/${testRecordId}/download`, {
      headers: { Authorization: `Bearer ${patient2Token}` }
    });
    assert(res.status === 403, `Expected 403, got ${res.status}`);
  });

  await test("GET /api/records/:id/download — unapproved doctor without on-chain access gets 403", async () => {
    const res = await fetch(`${baseUrl}/records/${testRecordId}/download`, {
      headers: { Authorization: `Bearer ${doctorToken}` }
    });
    // Doctor has no on-chain access (hasAccess returns false since patient wallets don't grant it)
    assert(res.status === 403, `Expected 403, got ${res.status}`);
  });

  // =========================================================
  console.log("\n--- 7. Verify — VERIFIED case ---");
  // =========================================================
  await test("POST /api/records/:id/verify — returns VERIFIED for untampered confirmed record", async () => {
    const res = await fetch(`${baseUrl}/records/${testRecordId}/verify`, {
      method: "POST",
      headers: { Authorization: `Bearer ${patientToken}` }
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const json = await res.json();
    assert(json.data.status === "VERIFIED", `Expected VERIFIED, got ${json.data.status}`);
    assert(json.data.localHash === testRecordFileHash, "localHash must match fileHash");
    assert(json.data.localMatchesDb === true, "localMatchesDb must be true");

    // Audit log
    const audit = await AuditLog.findOne({ record: testRecordId, action: "RECORD_VERIFIED" });
    assert(audit !== null, "RECORD_VERIFIED audit log must exist");
  });

  // =========================================================
  console.log("\n--- 8. Verify — TAMPERED case (flip byte in .enc file) ---");
  // =========================================================
  await test("POST /api/records/:id/verify — returns TAMPERED after flipping a byte in .enc file", async () => {
    // Flip a byte in the .enc file on disk
    const encData = await fs.readFile(uploadedEncFilePath);
    const tampered = Buffer.from(encData);
    tampered[0] ^= 0xFF;
    await fs.writeFile(uploadedEncFilePath, tampered);

    const res = await fetch(`${baseUrl}/records/${testRecordId}/verify`, {
      method: "POST",
      headers: { Authorization: `Bearer ${patientToken}` }
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const json = await res.json();
    assert(json.data.status === "TAMPERED", `Expected TAMPERED, got ${json.data.status}`);

    // Audit log
    const audit = await AuditLog.findOne({ record: testRecordId, action: "RECORD_TAMPER_DETECTED" });
    assert(audit !== null, "RECORD_TAMPER_DETECTED audit log must exist");

    // Restore the file for further tests
    await fs.writeFile(uploadedEncFilePath, encData);
  });

  await test("POST /api/records/:id/verify — returns TAMPERED after corrupting DB fileHash", async () => {
    // Corrupt the DB hash
    const original = await MedicalRecord.findById(testRecordId);
    const origHash = original.fileHash;
    await MedicalRecord.findByIdAndUpdate(testRecordId, { fileHash: "0x" + "0".repeat(64) });

    const res = await fetch(`${baseUrl}/records/${testRecordId}/verify`, {
      method: "POST",
      headers: { Authorization: `Bearer ${patientToken}` }
    });
    const json = await res.json();
    assert(json.data.status === "TAMPERED", `Expected TAMPERED, got ${json.data.status}`);
    assert(json.data.localMatchesDb === false, "localMatchesDb must be false");

    // Restore the hash
    await MedicalRecord.findByIdAndUpdate(testRecordId, { fileHash: origHash });
  });

  // =========================================================
  console.log("\n--- 9. Patient Dashboard ---");
  // =========================================================
  await test("GET /api/patient/dashboard returns correct counts", async () => {
    const res = await fetch(`${baseUrl}/patient/dashboard`, {
      headers: { Authorization: `Bearer ${patientToken}` }
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const json = await res.json();
    assert(json.data.counts.records.total >= 2, "Should have at least 2 records (upload + ownership test)");
    assert(json.data.counts.records.confirmed >= 1, "Should have at least 1 confirmed record");
    assert(Array.isArray(json.data.recentActivity), "recentActivity must be array");
  });

  await test("GET /api/patient/dashboard rejects non-patient role (403)", async () => {
    const res = await fetch(`${baseUrl}/patient/dashboard`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(res.status === 403, `Expected 403, got ${res.status}`);
  });

  // =========================================================
  console.log("\n--- 10. JPEG and PNG Upload ---");
  // =========================================================
  await test("Upload accepts .jpg file (image/jpeg)", async () => {
    // Minimal JPEG magic bytes
    const jpegBuf = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, ...Buffer.from("JFIF test image content")]);
    const { body, contentType } = buildFormData(
      { title: "X-ray image", category: "scan_report" },
      jpegBuf,
      "xray.jpg",
      "image/jpeg"
    );
    const res = await fetch(`${baseUrl}/records`, {
      method: "POST",
      headers: { Authorization: `Bearer ${patientToken}`, "Content-Type": contentType },
      body
    });
    assert(res.status === 201, `Expected 201 for .jpg upload, got ${res.status}`);
    const json = await res.json();
    assert(json.data.record.mimeType === "image/jpeg", "mimeType must be image/jpeg");
  });

  await test("Upload accepts .png file (image/png)", async () => {
    // Minimal PNG magic bytes
    const pngBuf = Buffer.from([0x89, 0x50, 0x4E, 0x47, ...Buffer.from("PNG test content")]);
    const { body, contentType } = buildFormData(
      { title: "CT scan", category: "scan_report" },
      pngBuf,
      "scan.png",
      "image/png"
    );
    const res = await fetch(`${baseUrl}/records`, {
      method: "POST",
      headers: { Authorization: `Bearer ${patientToken}`, "Content-Type": contentType },
      body
    });
    assert(res.status === 201, `Expected 201 for .png upload, got ${res.status}`);
    const json = await res.json();
    assert(json.data.record.mimeType === "image/png", "mimeType must be image/png");
  });

  await teardown();

  console.log("\n=========================================================");
  console.log(`TEST SUMMARY: ${passedTests.length} PASSED, ${failedTests.length} FAILED`);
  console.log("=========================================================\n");

  if (failedTests.length > 0) {
    failedTests.forEach(({ name, error }) => {
      console.error(`  ❌ ${name}: ${error}`);
    });
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Fatal test error:", err);
  process.exit(1);
});
