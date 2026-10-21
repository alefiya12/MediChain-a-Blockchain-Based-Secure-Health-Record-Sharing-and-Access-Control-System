import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_DIR = path.resolve(__dirname, "..");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForBackend(url, maxRetries = 30) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(`${url}/health`);
      if (res.ok) return true;
    } catch {
      // not ready yet
    }
    await sleep(500);
  }
  throw new Error(`Backend at ${url} did not become ready in time`);
}

async function testAuthCycle() {
  console.log("==================================================================");
  console.log("   MediChain Persistent Registration & Multi-Restart Test Suite   ");
  console.log("==================================================================\n");

  const baseUrl = "http://127.0.0.1:5050/api";

  // Check health of currently running backend
  console.log("1. Checking running backend health...");
  await waitForBackend(baseUrl);
  console.log("   Backend is healthy on port 5050.");

  // Test credentials
  const patientEmail = `patient.persist.${Date.now()}@medichain.local`;
  const doctorEmail = `doctor.persist.${Date.now()}@medichain.local`;
  const testPassword = "Password123!";

  // 1. Register Patient
  console.log(`\n2. Registering Patient (${patientEmail})...`);
  const regPatRes = await fetch(`${baseUrl}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Persistent Patient",
      email: patientEmail,
      password: testPassword,
      role: "patient"
    })
  });
  const regPatData = await regPatRes.json();
  if (regPatRes.status !== 201 || !regPatData.data?.token) {
    throw new Error(`Patient registration failed: ${JSON.stringify(regPatData)}`);
  }
  console.log(`   ✅ Patient registered successfully! (Patient ID: ${regPatData.data.user.patientId})`);

  // 2. Register Doctor
  console.log(`\n3. Registering Doctor (${doctorEmail})...`);
  const regDocRes = await fetch(`${baseUrl}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Dr. Persistent",
      email: doctorEmail,
      password: testPassword,
      role: "doctor",
      licenseNumber: `LIC-PERSIST-${Date.now()}`,
      specialization: "Neurology",
      hospital: "City Central Hospital",
      experienceYears: 7
    })
  });
  const regDocData = await regDocRes.json();
  if (regDocRes.status !== 201 || !regDocData.data?.token) {
    throw new Error(`Doctor registration failed: ${JSON.stringify(regDocData)}`);
  }
  console.log(`   ✅ Doctor registered successfully! (Status: ${regDocData.data.user.doctorStatus})`);

  // 3. Test initial login
  console.log("\n4. Verifying initial login before restart...");
  const loginPat1 = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: patientEmail, password: testPassword })
  });
  const loginPatData1 = await loginPat1.json();
  if (loginPat1.status !== 200 || !loginPatData1.data?.token) {
    throw new Error(`Initial patient login failed: ${JSON.stringify(loginPatData1)}`);
  }
  console.log("   ✅ Initial Patient login: SUCCESS");

  const loginDoc1 = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: doctorEmail, password: testPassword })
  });
  const loginDocData1 = await loginDoc1.json();
  if (loginDoc1.status !== 200 || !loginDocData1.data?.token) {
    throw new Error(`Initial doctor login failed: ${JSON.stringify(loginDocData1)}`);
  }
  console.log("   ✅ Initial Doctor login: SUCCESS");

  const loginAdmin1 = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@medichain.local", password: "AdminPassword123!" })
  });
  const loginAdminData1 = await loginAdmin1.json();
  if (loginAdmin1.status !== 200 || !loginAdminData1.data?.token) {
    throw new Error(`Initial admin login failed: ${JSON.stringify(loginAdminData1)}`);
  }
  console.log("   ✅ Initial Admin login: SUCCESS");

  // 4. Simulate Restart 1: Touch server.js to trigger nodemon restart
  console.log("\n5. Restarting project (Restart 1 via server reload)...");
  // Update timestamp on server.js to trigger nodemon
  const fs = await import("fs");
  const serverPath = path.resolve(BACKEND_DIR, "src/server.js");
  const now = new Date();
  fs.utimesSync(serverPath, now, now);

  await sleep(2500); // Wait for nodemon restart
  await waitForBackend(baseUrl);
  console.log("   Backend is back up after Restart 1.");

  // 5. Verify logins after Restart 1
  console.log("\n6. Verifying logins after Restart 1...");
  const loginPat2 = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: patientEmail, password: testPassword })
  });
  const loginPatData2 = await loginPat2.json();
  if (loginPat2.status !== 200 || !loginPatData2.data?.token) {
    throw new Error(`Post-restart 1 patient login failed! Error: ${JSON.stringify(loginPatData2)}`);
  }
  console.log(`   ✅ Patient (${patientEmail}) login after Restart 1: SUCCESS (Token granted)`);

  const loginDoc2 = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: doctorEmail, password: testPassword })
  });
  const loginDocData2 = await loginDoc2.json();
  if (loginDoc2.status !== 200 || !loginDocData2.data?.token) {
    throw new Error(`Post-restart 1 doctor login failed! Error: ${JSON.stringify(loginDocData2)}`);
  }
  console.log(`   ✅ Doctor (${doctorEmail}) login after Restart 1: SUCCESS (Token granted)`);

  const loginAdmin2 = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@medichain.local", password: "AdminPassword123!" })
  });
  const loginAdminData2 = await loginAdmin2.json();
  if (loginAdmin2.status !== 200 || !loginAdminData2.data?.token) {
    throw new Error(`Post-restart 1 admin login failed! Error: ${JSON.stringify(loginAdminData2)}`);
  }
  console.log("   ✅ Admin login after Restart 1: SUCCESS (Token granted)");

  // 6. Simulate Restart 2: Multi-restart verification
  console.log("\n7. Restarting project again (Restart 2)...");
  fs.utimesSync(serverPath, new Date(Date.now() + 1000), new Date(Date.now() + 1000));
  await sleep(2500);
  await waitForBackend(baseUrl);
  console.log("   Backend is back up after Restart 2.");

  // 7. Verify logins after Restart 2
  console.log("\n8. Verifying logins after Restart 2...");
  const loginPat3 = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: patientEmail, password: testPassword })
  });
  const loginPatData3 = await loginPat3.json();
  if (loginPat3.status !== 200 || !loginPatData3.data?.token) {
    throw new Error(`Post-restart 2 patient login failed! Error: ${JSON.stringify(loginPatData3)}`);
  }
  console.log(`   ✅ Patient (${patientEmail}) login after Restart 2: SUCCESS`);

  const loginDoc3 = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: doctorEmail, password: testPassword })
  });
  const loginDocData3 = await loginDoc3.json();
  if (loginDoc3.status !== 200 || !loginDocData3.data?.token) {
    throw new Error(`Post-restart 2 doctor login failed! Error: ${JSON.stringify(loginDocData3)}`);
  }
  console.log(`   ✅ Doctor (${doctorEmail}) login after Restart 2: SUCCESS`);

  const loginAdmin3 = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@medichain.local", password: "AdminPassword123!" })
  });
  const loginAdminData3 = await loginAdmin3.json();
  if (loginAdmin3.status !== 200 || !loginAdminData3.data?.token) {
    throw new Error(`Post-restart 2 admin login failed! Error: ${JSON.stringify(loginAdminData3)}`);
  }
  console.log("   ✅ Admin login after Restart 2: SUCCESS");

  // 8. Verify GET /api/auth/me session persistence
  console.log("\n9. Verifying /api/auth/me token session persistence...");
  const meRes = await fetch(`${baseUrl}/auth/me`, {
    headers: { Authorization: `Bearer ${loginPatData3.data.token}` }
  });
  const meData = await meRes.json();
  if (meRes.status !== 200 || meData.data?.user?.email !== patientEmail) {
    throw new Error(`Session verify failed: ${JSON.stringify(meData)}`);
  }
  console.log(`   ✅ /api/auth/me returned correct persisted user profile for ${meData.data.user.email}`);

  console.log("\n==================================================================");
  console.log("   🎉 ALL PERSISTENCE AND RESTART TESTS PASSED 100%!             ");
  console.log("==================================================================");
}

testAuthCycle().catch((err) => {
  console.error("\n❌ Test execution failed:", err);
  process.exit(1);
});
