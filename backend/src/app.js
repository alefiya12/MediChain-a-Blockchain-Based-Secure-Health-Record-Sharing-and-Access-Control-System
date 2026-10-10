import express from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import mongoSanitize from "express-mongo-sanitize";
import morgan from "morgan";
import { env } from "./config/env.js";
import { errorHandler } from "./middleware/errorHandler.js";

// Routes
import authRoutes from "./routes/auth.routes.js";
import auditRoutes from "./routes/audit.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import patientRoutes from "./routes/patient.routes.js";
import doctorRoutes from "./routes/doctor.routes.js";
import recordRoutes from "./routes/record.routes.js";
import accessRoutes from "./routes/access.routes.js";

const app = express();

// Trust reverse proxy if any
app.set("trust proxy", 1);

// 1. Helmet security headers
app.use(helmet());

// 2. CORS configuration (origin = FRONTEND_URL)
app.use(
  cors({
    origin: env.FRONTEND_URL,
    credentials: true
  })
);

// 3. Rate limiters
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many requests from this IP, please try again after 15 minutes"
  }
});
app.use(globalLimiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 requests per 15 minutes on login/register
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many authentication attempts, please try again after 15 minutes"
  }
});

// 4. Morgan HTTP logger in dev
if (process.env.NODE_ENV !== "production") {
  app.use(morgan("dev"));
}

// 5. Body parser with 1mb limit
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// 6. express-mongo-sanitize (configured for Express 5 compatibility)
app.use((req, res, next) => {
  if (req.body) mongoSanitize.sanitize(req.body);
  if (req.params) mongoSanitize.sanitize(req.params);
  next();
});

// Health check endpoint
app.get("/api/health", (_req, res) => {
  res.json({
    success: true,
    message: "MediChain backend up and running",
    timestamp: new Date().toISOString()
  });
});

// Auth routes (with authLimiter applied to /register and /login)
app.use("/api/auth/register", authLimiter);
app.use("/api/auth/login", authLimiter);
app.use("/api/auth", authRoutes);

// Audit routes
app.use("/api/audit", auditRoutes);

// Mount placeholder routes for other phases
app.use("/api/admin", adminRoutes);
app.use("/api/patient", patientRoutes);
app.use("/api/doctor", doctorRoutes);
app.use("/api/records", recordRoutes);
app.use("/api/access", accessRoutes);

// Error handler middleware (must be last)
app.use(errorHandler);

export default app;
