import app from "./app.js";
import { env } from "./config/env.js";
import { connectDB } from "./config/db.js";

const startServer = async () => {
  try {
    await connectDB();

    app.listen(env.PORT, () => {
      console.log(`🚀 MediChain backend listening on port ${env.PORT}`);
    });
  } catch (error) {
    console.error("Failed to start MediChain backend:", error.message);
    process.exit(1);
  }
};

startServer();
