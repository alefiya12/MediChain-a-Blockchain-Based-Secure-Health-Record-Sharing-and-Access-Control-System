import mongoose from "mongoose";
import { env } from "./env.js";

let memoryServerInstance = null;

export const connectDB = async () => {
  try {
    const conn = await mongoose.connect(env.MONGO_URI, {
      serverSelectionTimeoutMS: 2000
    });
    console.log(`✅ MongoDB Connected: ${conn.connection.host}/${conn.connection.name}`);
    return conn;
  } catch (error) {
    console.warn(`⚠️ Local MongoDB (${env.MONGO_URI}) not reachable (${error.message}).`);
    console.log(`⚡ Initializing local development MongoDB engine on port 27017...`);
    try {
      const { MongoMemoryServer } = await import("mongodb-memory-server");
      memoryServerInstance = await MongoMemoryServer.create({
        instance: { port: 27017, dbName: "medichain" }
      });
      const uri = memoryServerInstance.getUri();
      const conn = await mongoose.connect(uri);
      console.log(`✅ Development MongoDB running at: ${uri}`);
      return conn;
    } catch (memErr) {
      console.error(`❌ Failed to start development MongoDB: ${memErr.message}`);
      process.exit(1);
    }
  }
};

export const closeDB = async () => {
  await mongoose.disconnect();
  if (memoryServerInstance) {
    await memoryServerInstance.stop();
  }
};

export default connectDB;
