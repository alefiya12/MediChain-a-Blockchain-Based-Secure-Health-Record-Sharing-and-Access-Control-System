import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { requireRole } from "../middleware/roles.js";
import { requireApprovedDoctor } from "../middleware/doctor.js";
import { getProfile, getStatus } from "../controllers/doctor.controller.js";

const router = Router();

// Protect all doctor routes with authentication and role 'doctor'
router.use(authenticate, requireRole("doctor"));

// Doctor profile and status (accessible to pending, approved, and rejected doctors)
router.get("/profile", getProfile);
router.get("/status", getStatus);

// Gated route requiring approved doctor status
router.get("/approved-access", requireApprovedDoctor, (req, res) => {
  res.json({
    success: true,
    message: "Welcome approved doctor",
    doctorProfile: req.doctorProfile
  });
});

export default router;

