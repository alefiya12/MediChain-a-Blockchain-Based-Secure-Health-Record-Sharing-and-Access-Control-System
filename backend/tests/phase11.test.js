/**
 * Phase 11 Exit Criteria Test Suite
 * Hardening, UX Polish, Error Handling
 *
 * Exit Criteria: a non-developer can run through the entire flow without
 * hitting an unhandled error.
 *
 * Automated checks (30 tests):
 *  1-5.   Security middleware: Helmet, health, 404 JSON, JWT_SECRET, ENC_KEY
 *  6-14.  Form validation: password rules, required fields, wallet, admin block, doctor optional
 *  15-16. Login: non-existent / wrong-password → 401 JSON
 *  17-19. passwordHash NEVER returned (register / login / /me)
 *  20-24. Auth guards: 401 no-token, 401 bad-token, 403 patient→admin, 403 doctor→admin, 403 patient→doctor
 *  25-28. Upload validation: no file, .exe file, no title, patient→access-request
 *  29.    Mongo sanitize: NoSQL $gt injection does not crash (not 500)
 *  30.    CORS allows configured FRONTEND_URL
 */

import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import app from "../src/app.js";
import { env } from "../src/config/env.js";

let mongod, server, baseUrl;
let passed = 0;
let failed = 0;

function check(name, condition, detail = "") {
  if (condition) {
    console.log(`  ✅ PASS: ${name}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${name}${detail ? " — " + detail : ""}`);
    failed++;
  }
}

async function apiGet(path, token, extraHeaders = {}) {
  const headers = { ...extraHeaders };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${baseUrl}${path}`, {
    method: "GET",
    headers
  });
  const text = await res.text();
  let body = {};
  try {
    body = JSON.parse(text);
  } catch {}
  return { status: res.status, headers: res.headers, text, body };
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
  const text = await res.text();
  let json = {};
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, headers: res.headers, text, body: json };
}

async function run() {
  console.log("================================================================");
  console.log("   MediChain Phase 11 Test Suite — Hardening & Error Handling   ");
  console.log("================================================================\n");

  process.env.NODE_ENV = "test";
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  server = app.listen(0);
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}/api`;

  try {
    // ────────────────────────────────────────────────────────────────────────
    // GROUP 1 — Security Middleware & Config
    // ────────────────────────────────────────────────────────────────────────
    console.log("--- 1. Security Middleware & Environment Configuration ---");
    const healthRes = await apiGet("/health");
    check("1. Helmet: X-Content-Type-Options: nosniff present", healthRes.headers.get("x-content-type-options") === "nosniff");
    check("2. Health check returns 200 JSON", healthRes.status === 200 && healthRes.body?.success === true);

    const unknownRes = await fetch(`http://127.0.0.1:${port}/api/completely/unknown/route/xyz`);
    const unknownText = await unknownRes.text();
    let unknownBody = {};
    try { unknownBody = JSON.parse(unknownText); } catch {}
    check("3. Unknown API route returns 404 JSON (not HTML)", unknownRes.status === 404 && unknownBody?.success === false && !unknownText.startsWith("<!"));
    check("4. JWT_SECRET env var is set", Boolean(env.JWT_SECRET && env.JWT_SECRET.length > 0));
    check("5. FILE_ENCRYPTION_KEY env var is set", Boolean(env.FILE_ENCRYPTION_KEY && env.FILE_ENCRYPTION_KEY.length > 0));

    // ────────────────────────────────────────────────────────────────────────
    // GROUP 2 — Form Validation on Both Client & Server
    // ────────────────────────────────────────────────────────────────────────
    console.log("\n--- 2. Form & Field Validations ---");
    const shortPwRes = await apiPost("/auth/register", {
      name: "Test User", email: "short@example.com", password: "abc", role: "patient"
    });
    check("6. Password <8 chars rejected with clear 400 message", shortPwRes.status === 400 && shortPwRes.body?.success === false);

    const noLetterRes = await apiPost("/auth/register", {
      name: "Test User", email: "noletter@example.com", password: "12345678", role: "patient"
    });
    check("7. Password with no letter is rejected", noLetterRes.status === 400 && noLetterRes.body?.success === false);

    const noNumRes = await apiPost("/auth/register", {
      name: "Test User", email: "nonumber@example.com", password: "abcdefgh", role: "patient"
    });
    check("8. Password with no number is rejected", noNumRes.status === 400 && noNumRes.body?.success === false);

    const noNameRes = await apiPost("/auth/register", {
      email: "noname@example.com", password: "Password123!", role: "patient"
    });
    check("9. Missing name is rejected (400)", noNameRes.status === 400 && noNameRes.body?.success === false);

    const badEmailRes = await apiPost("/auth/register", {
      name: "Test User", email: "not-an-email", password: "Password123!", role: "patient"
    });
    check("10. Invalid email format is rejected (400)", badEmailRes.status === 400 && badEmailRes.body?.success === false);

    const badWalletRes = await apiPost("/auth/register", {
      name: "Test User", email: "badwallet@example.com", password: "Password123!",
      role: "patient", walletAddress: "not-an-eth-address"
    });
    check("11. Invalid wallet address is rejected (400)", badWalletRes.status === 400 && badWalletRes.body?.success === false);

    const fakeAdminRes = await apiPost("/auth/register", {
      name: "Fake Admin", email: "fakeadmin@example.com", password: "Password123!", role: "admin"
    });
    check("12. Admin role registration is blocked (400)", fakeAdminRes.status === 400 && fakeAdminRes.body?.success === false);

    const noLicDoctorRes = await apiPost("/auth/register", {
      name: "Dr Test", email: "nolic@example.com", password: "Password123!",
      role: "doctor", specialization: "Cardiology", hospital: "Test Hospital"
    });
    check("13. Doctor missing licenseNumber is rejected (400)", noLicDoctorRes.status === 400 && noLicDoctorRes.body?.success === false);

    const optExpRes = await apiPost("/auth/register", {
      name: "Dr Opt Exp", email: "noexp@example.com", password: "Password123!",
      role: "doctor", licenseNumber: "LIC-PHASE11-001",
      specialization: "Cardiology", hospital: "Test Hospital"
    });
    check("14. Doctor without experienceYears succeeds (201 optional)", optExpRes.status === 201 && Boolean(optExpRes.body?.data?.token));

    // ────────────────────────────────────────────────────────────────────────
    // GROUP 3 — Login Error Handling
    // ────────────────────────────────────────────────────────────────────────
    console.log("\n--- 3. Login Error Handling ---");
    await apiPost("/auth/register", {
      name: "Real User", email: "realuser11@example.com",
      password: "CorrectPass1", role: "patient"
    });

    const notFoundEmailRes = await apiPost("/auth/login", {
      email: "doesnotexist11@example.com", password: "Password123!"
    });
    check("15. Non-existent email returns 401 (not 500)", notFoundEmailRes.status === 401 && notFoundEmailRes.body?.success === false);

    const wrongPwRes = await apiPost("/auth/login", {
      email: "realuser11@example.com", password: "WrongPassword1"
    });
    check("16. Wrong password returns 401", wrongPwRes.status === 401 && wrongPwRes.body?.success === false);

    // ────────────────────────────────────────────────────────────────────────
    // GROUP 4 — passwordHash Never Returned
    // ────────────────────────────────────────────────────────────────────────
    console.log("\n--- 4. Password Protection & Exclusion ---");
    const regRes = await apiPost("/auth/register", {
      name: "No Hash User", email: "nohash11@example.com",
      password: "NoHash123!", role: "patient"
    });
    const pToken = regRes.body?.data?.token;

    const logRes = await apiPost("/auth/login", {
      email: "nohash11@example.com", password: "NoHash123!"
    });
    const meRes = await apiGet("/auth/me", pToken);

    check("17. Register response never contains passwordHash", regRes.status === 201 && !JSON.stringify(regRes.body).includes("passwordHash"));
    check("18. Login response never contains passwordHash", logRes.status === 200 && !JSON.stringify(logRes.body).includes("passwordHash"));
    check("19. GET /api/auth/me never contains passwordHash", meRes.status === 200 && !JSON.stringify(meRes.body).includes("passwordHash"));

    // ────────────────────────────────────────────────────────────────────────
    // GROUP 5 — Auth Guards & RBAC
    // ────────────────────────────────────────────────────────────────────────
    console.log("\n--- 5. RBAC & Route Access Guards ---");
    const docReg = await apiPost("/auth/register", {
      name: "RBAC Doctor", email: "rbac.d11@example.com",
      password: "Password123!", role: "doctor",
      licenseNumber: "LIC-RBAC-P11", specialization: "General", hospital: "RBAC Hospital"
    });
    const docToken = docReg.body?.data?.token;

    const noTokRes = await apiGet("/auth/me");
    check("20. Missing token returns 401 JSON", noTokRes.status === 401 && noTokRes.body?.success === false);

    const badTokRes = await apiGet("/auth/me", "garbage.token.here");
    check("21. Malformed token returns 401 JSON", badTokRes.status === 401 && badTokRes.body?.success === false);

    const patToAdmin = await apiGet("/admin/stats", pToken);
    check("22. Patient token on /api/admin/stats returns 403", patToAdmin.status === 403 && patToAdmin.body?.success === false);

    const docToAdmin = await apiGet("/admin/stats", docToken);
    check("23. Doctor token on /api/admin/stats returns 403", docToAdmin.status === 403 && docToAdmin.body?.success === false);

    const patToDoc = await apiGet("/doctor/dashboard", pToken);
    check("24. Patient token on /api/doctor/dashboard returns 403", patToDoc.status === 403 && patToDoc.body?.success === false);

    // ────────────────────────────────────────────────────────────────────────
    // GROUP 6 — Upload Validation
    // ────────────────────────────────────────────────────────────────────────
    console.log("\n--- 6. Upload Type, Size & Role Validation ---");
    const noFileRes = await apiPost("/records", { title: "Test Record", category: "prescription" }, pToken);
    check("25. Upload without file returns 400 JSON (not 500)", noFileRes.status === 400 && noFileRes.body?.success === false);

    // File with bad extension / mime (.exe)
    const badForm = new FormData();
    badForm.append("file", new Blob(["MZ executable code"], { type: "application/x-msdownload" }), "test.exe");
    badForm.append("title", "Malware Test");
    badForm.append("category", "prescription");

    const badFileRes = await fetch(`${baseUrl}/records`, {
      method: "POST",
      headers: { Authorization: `Bearer ${pToken}` },
      body: badForm
    });
    const badFileJson = await badFileRes.json().catch(() => ({}));
    check("26. Upload with .exe (bad MIME) is rejected with 400", badFileRes.status === 400 && badFileJson?.success === false);

    // Upload without title
    const noTitleForm = new FormData();
    noTitleForm.append("file", new Blob(["%PDF-1.4 test"], { type: "application/pdf" }), "record.pdf");
    noTitleForm.append("category", "prescription");

    const noTitleRes = await fetch(`${baseUrl}/records`, {
      method: "POST",
      headers: { Authorization: `Bearer ${pToken}` },
      body: noTitleForm
    });
    const noTitleJson = await noTitleRes.json().catch(() => ({}));
    check("27. Upload without title is rejected (400)", noTitleRes.status === 400 && noTitleJson?.success === false);

    // Patient cannot call doctor-only access request endpoint
    const patAccessReq = await apiPost("/access/request", {
      patientId: "MC-P-000001", reason: "Test", txHash: "0xabc"
    }, pToken);
    check("28. Patient cannot call /api/access/request (403)", patAccessReq.status === 403 && patAccessReq.body?.success === false);

    // ────────────────────────────────────────────────────────────────────────
    // GROUP 7 — Mongo Sanitization
    // ────────────────────────────────────────────────────────────────────────
    console.log("\n--- 7. Mongo Sanitization ---");
    const mongoInjectionRes = await apiPost("/auth/login", {
      email: { $gt: "" }, password: "anything"
    });
    check("29. $gt injection in email does not crash (not 500)", mongoInjectionRes.status !== 500);

    // ────────────────────────────────────────────────────────────────────────
    // GROUP 8 — CORS
    // ────────────────────────────────────────────────────────────────────────
    console.log("\n--- 8. CORS Configuration ---");
    const origin = env.FRONTEND_URL || "http://localhost:5173";
    const corsRes = await fetch(`http://127.0.0.1:${port}/api/health`, {
      method: "OPTIONS",
      headers: {
        Origin: origin,
        "Access-Control-Request-Method": "GET"
      }
    });
    const corsHeader = corsRes.headers.get("access-control-allow-origin");
    check("30. CORS allows configured FRONTEND_URL", corsHeader === origin || corsHeader === "*");

  } finally {
    if (server) server.close();
    if (mongoose.connection) await mongoose.disconnect();
    if (mongod) await mongod.stop();
  }

  console.log("\n================================================================");
  console.log(`RESULTS: ${passed} Passed, ${failed} Failed`);
  console.log("================================================================");

  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
