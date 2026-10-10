import mongoose from "mongoose";
import { env } from "../config/env.js";
import { connectDB } from "../config/db.js";
import { User } from "../models/User.js";

export const seedAdmin = async () => {
  try {
    await connectDB();

    const existingAdmin = await User.findOne({ email: env.ADMIN_EMAIL });

    if (existingAdmin) {
      console.log(`ℹ️ Admin user already exists: ${existingAdmin.email} (${existingAdmin._id})`);
      process.exit(0);
    }

    const passwordHash = await User.hashPassword(env.ADMIN_PASSWORD);

    const admin = await User.create({
      name: "MediChain Administrator",
      email: env.ADMIN_EMAIL,
      passwordHash,
      role: "admin",
      walletAddress: env.ADMIN_WALLET,
      isActive: true
    });

    console.log(`✅ Admin user seeded successfully!`);
    console.log(`   Email : ${admin.email}`);
    console.log(`   Wallet: ${admin.walletAddress}`);
    console.log(`   Role  : ${admin.role}`);
    process.exit(0);
  } catch (error) {
    console.error("❌ Failed to seed admin user:", error.message);
    process.exit(1);
  }
};

seedAdmin();
