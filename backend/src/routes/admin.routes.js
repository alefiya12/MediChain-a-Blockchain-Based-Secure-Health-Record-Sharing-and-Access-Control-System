import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { requireRole } from "../middleware/roles.js";
import {
  getDoctors,
  getDoctorById,
  approveDoctor,
  rejectDoctor,
  getStats
} from "../controllers/admin.controller.js";

const router = Router();

// Protect all admin routes with authentication and requireRole('admin')
router.use(authenticate, requireRole("admin"));

// Doctor management endpoints
router.get("/doctors", getDoctors);
router.get("/doctors/:id", getDoctorById);
router.post("/doctors/:id/approve", approveDoctor);
router.post("/doctors/:id/reject", rejectDoctor);

// Admin dashboard statistics
router.get("/stats", getStats);

export default router;
