import { fileURLToPath } from "url";
import { env } from "../config/env.js";
import { connectDB } from "../config/db.js";
import { User } from "../models/User.js";

/**
 * Ensures the administrator user exists in the database.
 * Does NOT call process.exit() so it can be called safely during server boot.
 */
export const ensureAdminUser = async () => {
  const existingAdmin = await User.findOne({ email: env.ADMIN_EMAIL.toLowerCase() });

  if (existingAdmin) {
    console.log(`ℹ️ Admin account verified: ${existingAdmin.email} (${existingAdmin._id})`);
    return existingAdmin;
  }

  const passwordHash = await User.hashPassword(env.ADMIN_PASSWORD);

  const admin = await User.create({
    name: "MediChain Administrator",
    email: env.ADMIN_EMAIL.toLowerCase(),
    passwordHash,
    role: "admin",
    walletAddress: env.ADMIN_WALLET ? env.ADMIN_WALLET.toLowerCase() : undefined,
    isActive: true
  });

  console.log(`✅ Admin user seeded successfully!`);
  console.log(`   Email : ${admin.email}`);
  console.log(`   Wallet: ${admin.walletAddress}`);
  console.log(`   Role  : ${admin.role}`);
  return admin;
};

export const seedAdmin = async () => {
  await connectDB();
  return ensureAdminUser();
};

// If run directly from CLI (e.g. npm run seed:admin)
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  seedAdmin()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("❌ Failed to seed admin user:", error.message);
      process.exit(1);
    });
}

export default seedAdmin;
