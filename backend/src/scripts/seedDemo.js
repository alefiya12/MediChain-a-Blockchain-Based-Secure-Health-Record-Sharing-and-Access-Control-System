import mongoose from "mongoose";
import { env } from "../config/env.js";
import { connectDB } from "../config/db.js";
import { User } from "../models/User.js";
import { DoctorProfile } from "../models/DoctorProfile.js";

export const seedDemo = async () => {
  try {
    await connectDB();
    console.log("\n=======================================================");
    console.log("   MediChain Demo Account Seeder                     ");
    console.log("=======================================================\n");

    // 1. Seed Admin
    let admin = await User.findOne({ email: env.ADMIN_EMAIL });
    if (!admin) {
      admin = await User.create({
        name: "MediChain Administrator",
        email: env.ADMIN_EMAIL,
        passwordHash: await User.hashPassword(env.ADMIN_PASSWORD),
        role: "admin",
        walletAddress: env.ADMIN_WALLET?.toLowerCase(),
        isActive: true
      });
      console.log(`✅ Admin seeded:   ${admin.email}`);
    } else {
      console.log(`ℹ️ Admin exists:   ${admin.email}`);
    }

    // 2. Seed Patient
    const patientEmail = "patient.demo@medichain.local";
    let patient = await User.findOne({ email: patientEmail });
    if (!patient) {
      patient = await User.create({
        name: "John Doe (Demo Patient)",
        email: patientEmail,
        passwordHash: await User.hashPassword("PatientPass123!"),
        role: "patient",
        patientId: "MC-P-000001",
        isActive: true
      });
      console.log(`✅ Patient seeded: ${patient.email} (ID: ${patient.patientId})`);
    } else {
      console.log(`ℹ️ Patient exists: ${patient.email} (ID: ${patient.patientId})`);
    }

    // 3. Seed Doctor
    const doctorEmail = "doctor.demo@medichain.local";
    let doctor = await User.findOne({ email: doctorEmail });
    if (!doctor) {
      doctor = await User.create({
        name: "Dr. Sarah Chen (Demo Doctor)",
        email: doctorEmail,
        passwordHash: await User.hashPassword("DoctorPass123!"),
        role: "doctor",
        isActive: true
      });

      await DoctorProfile.create({
        user: doctor._id,
        licenseNumber: "LIC-DEMO-001",
        specialization: "Cardiology",
        hospital: "Metro Health Center",
        experienceYears: 10,
        status: "approved"
      });
      console.log(`✅ Doctor seeded:  ${doctor.email} (Status: approved)`);
    } else {
      console.log(`ℹ️ Doctor exists:  ${doctor.email}`);
    }

    console.log("\n---------------- Demo Login Credentials ----------------");
    console.log("ADMIN  : admin@medichain.local       | AdminPassword123!");
    console.log("PATIENT: patient.demo@medichain.local | PatientPass123!");
    console.log("DOCTOR : doctor.demo@medichain.local  | DoctorPass123!");
    console.log("--------------------------------------------------------\n");

    process.exit(0);
  } catch (error) {
    console.error("❌ Failed to seed demo accounts:", error.message);
    process.exit(1);
  }
};

// If run directly from CLI
import { fileURLToPath } from "url";
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  seedDemo();
}

