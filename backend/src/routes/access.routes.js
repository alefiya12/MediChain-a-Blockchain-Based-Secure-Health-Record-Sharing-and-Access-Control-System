import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { requireRole } from "../middleware/roles.js";
import { requireApprovedDoctor } from "../middleware/doctor.js";
import { requestAccess, respondToRequest, revokeAccess } from "../controllers/access.controller.js";

const router = Router();

// POST /api/access/request — approved doctor only
router.post(
  "/request",
  authenticate,
  requireRole("doctor"),
  requireApprovedDoctor,
  requestAccess
);

// POST /api/access/:id/respond — patient only
router.post(
  "/:id/respond",
  authenticate,
  requireRole("patient"),
  respondToRequest
);

// POST /api/access/:id/revoke — patient only
router.post(
  "/:id/revoke",
  authenticate,
  requireRole("patient"),
  revokeAccess
);

export default router;
