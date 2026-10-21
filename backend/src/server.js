import app from "./app.js";
import { env } from "./config/env.js";
import { connectDB, closeDB } from "./config/db.js";
import { ensureAdminUser } from "./scripts/seedAdmin.js";
import { startDbViewer } from "./scripts/dbViewer.js";

let httpServer = null;
let viewerServer = null;

const listenWithFallback = (port, maxRetries = 10) => {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, () => {
      console.log(`🚀 MediChain backend listening on port ${port}`);
      httpServer = server;
      resolve(server);
    });

    server.on("error", (err) => {
      if (err.code === "EADDRINUSE" && maxRetries > 0) {
        console.warn(`⚠️ Port ${port} is in use. Attempting port ${port + 1}...`);
        resolve(listenWithFallback(port + 1, maxRetries - 1));
      } else {
        reject(err);
      }
    });
  });
};

const startServer = async () => {
  try {
    await connectDB();
    await ensureAdminUser();
    await listenWithFallback(env.PORT);

    // Launch Web Database Explorer on port 8081
    try {
      viewerServer = await startDbViewer(8081);
    } catch (viewerErr) {
      console.warn("⚠️ Web Database Explorer notice:", viewerErr.message);
    }
  } catch (error) {
    console.error("Failed to start MediChain backend:", error.message);
    process.exit(1);
  }
};

const handleShutdown = async (signal) => {
  console.log(`\n🛑 Received ${signal}. Shutting down MediChain gracefully...`);
  if (httpServer) {
    httpServer.close();
  }
  if (viewerServer) {
    viewerServer.close();
  }
  await closeDB();
  process.exit(0);
};

// Process lifecycle event handlers
process.on("SIGINT", () => handleShutdown("SIGINT"));
process.on("SIGTERM", () => handleShutdown("SIGTERM"));
process.once("SIGUSR2", async () => {
  if (httpServer) {
    httpServer.close();
  }
  if (viewerServer) {
    viewerServer.close();
  }
  await closeDB();
  process.kill(process.pid, "SIGUSR2");
});

startServer();
