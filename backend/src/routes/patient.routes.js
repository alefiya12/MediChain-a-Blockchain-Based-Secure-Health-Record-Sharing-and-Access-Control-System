import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { requireRole } from "../middleware/roles.js";
import {
  getDashboard,
  getAccessRequests,
  getGrantedAccess
} from "../controllers/patient.controller.js";

const router = Router();

// All patient routes require authentication and 'patient' role
router.use(authenticate, requireRole("patient"));

router.get("/dashboard", getDashboard);
router.get("/access-requests", getAccessRequests);
router.get("/granted", getGrantedAccess);

export default router;
