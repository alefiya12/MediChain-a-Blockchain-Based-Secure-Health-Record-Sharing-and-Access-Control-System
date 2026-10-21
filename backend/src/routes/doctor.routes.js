import { Router } from "express";
import rateLimit from "express-rate-limit";
import { authenticate } from "../middleware/auth.js";
import { requireRole } from "../middleware/roles.js";
import { requireApprovedDoctor } from "../middleware/doctor.js";
import {
  getProfile,
  getStatus,
  searchPatient,
  getMyRequests,
  getAuthorizedPatients,
  getPatientRecords
} from "../controllers/doctor.controller.js";

const router = Router();

// Rate limiter for patient search — 20 req / 15 min per IP
const isTest = process.env.NODE_ENV === "test";
const searchLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  skip: () => isTest,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many patient searches. Please wait 15 minutes before trying again."
  }
});

// Protect all doctor routes with auth + role check
router.use(authenticate, requireRole("doctor"));

// Profile and status — accessible to any doctor (even pending/rejected)
router.get("/profile", getProfile);
router.get("/status", getStatus);

// Routes below require approved doctor status ────────────────────────────

// Patient search (exact patientId, rate-limited)
router.get("/patients/search", searchLimiter, requireApprovedDoctor, searchPatient);

// Doctor's own access requests
router.get("/requests", requireApprovedDoctor, getMyRequests);

// Live-checked list of authorized patients
router.get("/authorized-patients", requireApprovedDoctor, getAuthorizedPatients);

// Patient's record metadata — live on-chain hasAccess enforced inside handler
router.get("/patients/:patientId/records", requireApprovedDoctor, getPatientRecords);

// Legacy: approved-access test endpoint (from Phase 4)
router.get("/approved-access", requireApprovedDoctor, (req, res) => {
  res.json({
    success: true,
    message: "Welcome approved doctor",
    doctorProfile: req.doctorProfile
  });
});

export default router;
