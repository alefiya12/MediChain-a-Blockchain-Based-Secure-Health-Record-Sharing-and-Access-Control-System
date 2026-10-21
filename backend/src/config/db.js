import mongoose from "mongoose";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { env } from "./env.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DB_STORAGE_PATH = path.resolve(__dirname, "../../data/db");

let memoryServerInstance = null;

export const connectDB = async () => {
  // 1. Attempt connection to system or external MongoDB instance
  try {
    const conn = await mongoose.connect(env.MONGO_URI, {
      serverSelectionTimeoutMS: 2000,
      dbName: "medichain"
    });
    console.log(`✅ MongoDB Connected: ${conn.connection.host}/${conn.connection.name}`);
    return conn;
  } catch (error) {
    console.warn(`⚠️ External MongoDB (${env.MONGO_URI}) not reachable: ${error.message}`);
    console.log(`⚡ Initializing persistent local MongoDB engine at: ${DB_STORAGE_PATH}`);

    try {
      // Ensure persistent storage directory exists
      if (!fs.existsSync(DB_STORAGE_PATH)) {
        fs.mkdirSync(DB_STORAGE_PATH, { recursive: true });
      }

      const { MongoMemoryServer } = await import("mongodb-memory-server");

      // Try preferred port 27017 first; fallback to dynamic port if 27017 is in TIME_WAIT
      let mms = null;
      try {
        mms = await MongoMemoryServer.create({
          instance: {
            dbPath: DB_STORAGE_PATH,
            port: 27017,
            dbName: "medichain",
            storageEngine: "wiredTiger"
          }
        });
      } catch (portErr) {
        console.warn(`⚠️ Port 27017 busy (${portErr.message}), initializing on free port with persistent storage...`);
        mms = await MongoMemoryServer.create({
          instance: {
            dbPath: DB_STORAGE_PATH,
            dbName: "medichain",
            storageEngine: "wiredTiger"
          }
        });
      }

      memoryServerInstance = mms;
      const uri = memoryServerInstance.getUri("medichain");
      const conn = await mongoose.connect(uri, {
        dbName: "medichain"
      });

      console.log(`✅ Persistent MongoDB active at: ${uri} (Database: "${conn.connection.name}")`);
      return conn;
    } catch (engineErr) {
      console.error(`❌ Failed to start persistent MongoDB engine: ${engineErr.message}`);
      process.exit(1);
    }
  }
};

export const closeDB = async () => {
  try {
    await mongoose.disconnect();
  } catch (err) {
    console.warn("Notice during mongoose disconnect:", err.message);
  }

  if (memoryServerInstance) {
    try {
      // doCleanup: false guarantees database files on disk are preserved across restarts
      await memoryServerInstance.stop({ doCleanup: false });
    } catch (err) {
      console.warn("Notice during database engine stop:", err.message);
    }
    memoryServerInstance = null;
  }
};

export default connectDB;
