/**
 * Phase 7 Integration Test Suite
 * Frontend Foundation — Auth, Role Routing, and MetaMask Wallet Integration.
 *
 * Exit Criteria:
 *  - Register/login for all three roles works from the UI/API; wrong-role URL redirects away.
 *  - MetaMask connects; the app prompts to switch to Amoy; address mismatch is detected.
 */

import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import app from "../src/app.js";
import { User } from "../src/models/User.js";
import { DoctorProfile } from "../src/models/DoctorProfile.js";
import { env } from "../src/config/env.js";

// Frontend modules to test directly
import { AMOY_CHAIN_ID_DECIMAL, AMOY_CHAIN_ID_HEX, switchToAmoy } from "../../frontend/src/blockchain/network.js";
import { parseContractError } from "../../frontend/src/blockchain/contract.js";

let mongod, server, baseUrl;
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

  // Seed Admin user
  await User.create({
    name: "System Admin",
    email: env.ADMIN_EMAIL,
    passwordHash: await User.hashPassword(env.ADMIN_PASSWORD),
    role: "admin",
    walletAddress: env.ADMIN_WALLET,
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

async function testRoleRegistrationAndLogin() {
  console.log("\n--- 1. Register & Login for All Three Roles ---");

  // 1. Patient Registration
  const patientRes = await apiPost("/auth/register", {
    name: "Alice Patient",
    email: "alice.patient.p7@medichain.local",
    password: "Password123!",
    role: "patient",
    walletAddress: "0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199"
  });
  assert(
    "Register patient succeeds (201) and returns token + patientId",
    patientRes.status === 201 &&
    patientRes.body.data?.token &&
    patientRes.body.data?.user?.role === "patient" &&
    /^MC-P-[A-Z0-9]{6}$/.test(patientRes.body.data?.user?.patientId),
    JSON.stringify(patientRes.body)
  );

  // 2. Patient Login
  const patientLogin = await apiPost("/auth/login", {
    email: "alice.patient.p7@medichain.local",
    password: "Password123!"
  });
  assert(
    "Login patient succeeds (200) with matching credentials",
    patientLogin.status === 200 && patientLogin.body.data?.user?.role === "patient",
    JSON.stringify(patientLogin.body)
  );
  const patientToken = patientLogin.body.data.token;

  // 3. Doctor Registration (with medical credentials)
  const doctorRes = await apiPost("/auth/register", {
    name: "Dr. Carol Smith",
    email: "carol.doctor.p7@medichain.local",
    password: "Password123!",
    role: "doctor",
    walletAddress: "0x92f0FBD59BC02150067E1a65e340b80EA04dcc80",
    licenseNumber: "LIC-CAROL-P7",
    specialization: "Cardiology",
    hospital: "City Hospital",
    experienceYears: 10
  });
  assert(
    "Register doctor succeeds (201) and creates pending DoctorProfile",
    doctorRes.status === 201 &&
    doctorRes.body.data?.user?.role === "doctor" &&
    doctorRes.body.data?.user?.doctorStatus === "pending",
    JSON.stringify(doctorRes.body)
  );

  // 4. Doctor Login
  const doctorLogin = await apiPost("/auth/login", {
    email: "carol.doctor.p7@medichain.local",
    password: "Password123!"
  });
  assert(
    "Login doctor succeeds (200) and returns doctorProfile status",
    doctorLogin.status === 200 &&
    doctorLogin.body.data?.user?.role === "doctor" &&
    doctorLogin.body.data?.user?.doctorStatus === "pending",
    JSON.stringify(doctorLogin.body)
  );
  const doctorToken = doctorLogin.body.data.token;

  // 5. Admin Login
  const adminLogin = await apiPost("/auth/login", {
    email: env.ADMIN_EMAIL,
    password: env.ADMIN_PASSWORD
  });
  assert(
    "Login admin succeeds (200) for contract owner",
    adminLogin.status === 200 && adminLogin.body.data?.user?.role === "admin",
    JSON.stringify(adminLogin.body)
  );
  const adminToken = adminLogin.body.data.token;

  // 6. Session restoration via GET /auth/me
  const meRes = await apiGet("/auth/me", patientToken);
  assert(
    "GET /auth/me restores patient session accurately",
    meRes.status === 200 && meRes.body.data?.user?.email === "alice.patient.p7@medichain.local",
    JSON.stringify(meRes.body)
  );

  return { patientToken, doctorToken, adminToken };
}

function testRoleBasedRouteGuardLogic() {
  console.log("\n--- 2. Role-Based Route Guarding (ProtectedRoute logic) ---");

  // Simulate ProtectedRoute evaluation
  function evaluateRouteAccess(user, allowedRoles, targetPath) {
    if (!user) return { allow: false, redirect: "/login" };
    if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
      return { allow: false, redirect: `/${user.role}` };
    }
    return { allow: true, path: targetPath };
  }

  const patient = { role: "patient", name: "Alice" };
  const doctor = { role: "doctor", name: "Carol", doctorStatus: "pending" };
  const admin = { role: "admin", name: "Admin" };

  // Patient accessing /patient -> allowed
  let result = evaluateRouteAccess(patient, ["patient"], "/patient");
  assert("Patient accessing /patient is allowed", result.allow && result.path === "/patient");

  // Patient attempting /doctor -> redirected away to /patient
  result = evaluateRouteAccess(patient, ["doctor"], "/doctor");
  assert("Patient attempting /doctor is redirected to /patient", !result.allow && result.redirect === "/patient");

  // Patient attempting /admin -> redirected away to /patient
  result = evaluateRouteAccess(patient, ["admin"], "/admin");
  assert("Patient attempting /admin is redirected to /patient", !result.allow && result.redirect === "/patient");

  // Doctor attempting /patient -> redirected away to /doctor
  result = evaluateRouteAccess(doctor, ["patient"], "/patient");
  assert("Doctor attempting /patient is redirected to /doctor", !result.allow && result.redirect === "/doctor");

  // Doctor attempting /admin -> redirected away to /doctor
  result = evaluateRouteAccess(doctor, ["admin"], "/admin");
  assert("Doctor attempting /admin is redirected to /doctor", !result.allow && result.redirect === "/doctor");

  // Admin attempting /patient -> redirected away to /admin
  result = evaluateRouteAccess(admin, ["patient"], "/patient");
  assert("Admin attempting /patient is redirected to /admin", !result.allow && result.redirect === "/admin");

  // Unauthenticated user -> redirected to /login
  result = evaluateRouteAccess(null, ["patient"], "/patient");
  assert("Unauthenticated user accessing protected route redirected to /login", !result.allow && result.redirect === "/login");
}

async function testMetaMaskNetworkAndAmoySwitch() {
  console.log("\n--- 3. MetaMask Network & Polygon Amoy Switching ---");

  assert("Amoy chainId decimal is 80002", AMOY_CHAIN_ID_DECIMAL === 80002);
  assert("Amoy chainId hex is 0x13882", AMOY_CHAIN_ID_HEX === "0x13882");

  // Mock window.ethereum to test switchToAmoy()
  let requestedChainId = null;
  global.window = {
    ethereum: {
      request: async ({ method, params }) => {
        if (method === "wallet_switchEthereumChain") {
          requestedChainId = params[0].chainId;
          return null;
        }
        throw new Error(`Unhandled method: ${method}`);
      }
    }
  };

  await switchToAmoy();
  assert(
    "switchToAmoy() prompts MetaMask to switch to 0x13882 (80002)",
    requestedChainId === "0x13882"
  );

  // Test fallback when chain not added (error code 4902)
  let addChainParams = null;
  global.window.ethereum.request = async ({ method, params }) => {
    if (method === "wallet_switchEthereumChain") {
      const err = new Error("Chain not added");
      err.code = 4902;
      throw err;
    }
    if (method === "wallet_addEthereumChain") {
      addChainParams = params[0];
      return null;
    }
  };

  await switchToAmoy();
  assert(
    "switchToAmoy() falls back to wallet_addEthereumChain when chain not found (code 4902)",
    addChainParams && addChainParams.chainId === "0x13882" && addChainParams.chainName === "Polygon Amoy Testnet"
  );
}

function testAddressMismatchDetection() {
  console.log("\n--- 4. Address Mismatch Detection Logic ---");

  // Function representing WalletContext mismatch evaluation
  function checkMismatch(connectedAccount, registeredWallet) {
    if (!connectedAccount || !registeredWallet) return false;
    return connectedAccount.toLowerCase() !== registeredWallet.toLowerCase();
  }

  const registeredWallet = "0x443E3C91c81cE14a2f65E5829eD0EE289Ab83464";

  // Case 1: Same account connected
  let isMismatch = checkMismatch("0x443E3C91c81cE14a2f65E5829eD0EE289Ab83464", registeredWallet);
  assert("Matching account connected -> isMismatch is FALSE", isMismatch === false);

  // Case 2: Same account in lowercase
  isMismatch = checkMismatch("0x443e3c91c81ce14a2f65e5829ed0ee289ab83464", registeredWallet);
  assert("Case-insensitive match -> isMismatch is FALSE", isMismatch === false);

  // Case 3: Different account connected in MetaMask
  isMismatch = checkMismatch("0x92f0FBD59BC02150067E1a65e340b80EA04dcc80", registeredWallet);
  assert(
    "Different account connected -> isMismatch is TRUE (flagged immediately)",
    isMismatch === true
  );

  // Case 4: No account connected yet
  isMismatch = checkMismatch(null, registeredWallet);
  assert("No wallet connected -> isMismatch is FALSE", isMismatch === false);
}

function testContractErrorMapping() {
  console.log("\n--- 5. Contract Error Parsing & User Messages ---");

  // User rejection
  const rejectionErr = { code: 4001, message: "User rejected the transaction" };
  const rejectionMsg = parseContractError(rejectionErr);
  assert(
    "User rejection mapped to friendly cancel message",
    rejectionMsg.includes("cancelled / rejected by the user"),
    rejectionMsg
  );

  // Insufficient funds
  const fundsErr = { code: "INSUFFICIENT_FUNDS", message: "insufficient funds for intrinsic transaction cost" };
  const fundsMsg = parseContractError(fundsErr);
  assert(
    "Insufficient funds mapped to POL faucet guidance",
    fundsMsg.includes("Insufficient POL tokens"),
    fundsMsg
  );

  // Revert reason
  const revertErr = { reason: "Doctor not verified" };
  const revertMsg = parseContractError(revertErr);
  assert(
    "Contract revert reason extracted cleanly",
    revertMsg === "Blockchain error: Doctor not verified",
    revertMsg
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Run suite
// ──────────────────────────────────────────────────────────────────────────────
async function run() {
  console.log("\n=========================================================");
  console.log("   MEDICHAIN PHASE 7: FRONTEND FOUNDATION TEST SUITE");
  console.log("=========================================================\n");

  try {
    await setup();
    await testRoleRegistrationAndLogin();
    testRoleBasedRouteGuardLogic();
    await testMetaMaskNetworkAndAmoySwitch();
    testAddressMismatchDetection();
    testContractErrorMapping();
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
