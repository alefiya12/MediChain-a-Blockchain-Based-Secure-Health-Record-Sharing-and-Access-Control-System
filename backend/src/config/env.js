import dotenv from "dotenv";
dotenv.config();

const requiredEnv = [
  "PORT",
  "MONGO_URI",
  "JWT_SECRET",
  "JWT_EXPIRES_IN",
  "AMOY_RPC_URL",
  "CONTRACT_ADDRESS",
  "FILE_ENCRYPTION_KEY",
  "FRONTEND_URL",
  "ADMIN_EMAIL",
  "ADMIN_PASSWORD",
  "ADMIN_WALLET"
];

for (const key of requiredEnv) {
  if (!process.env[key] || process.env[key].trim() === "") {
    throw new Error(`Environment validation failed: Missing required variable "${key}"`);
  }
}

if (process.env.FILE_ENCRYPTION_KEY.length !== 64) {
  throw new Error(
    `Environment validation failed: FILE_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes). Found length ${process.env.FILE_ENCRYPTION_KEY.length}`
  );
}

export const env = {
  PORT: parseInt(process.env.PORT, 10) || 5001,
  MONGO_URI: process.env.MONGO_URI,
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "7d",
  AMOY_RPC_URL: process.env.AMOY_RPC_URL,
  CONTRACT_ADDRESS: process.env.CONTRACT_ADDRESS.toLowerCase(),
  FILE_ENCRYPTION_KEY: process.env.FILE_ENCRYPTION_KEY,
  FRONTEND_URL: process.env.FRONTEND_URL,
  ADMIN_EMAIL: process.env.ADMIN_EMAIL.toLowerCase(),
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
  ADMIN_WALLET: process.env.ADMIN_WALLET.toLowerCase()
};

export default env;
