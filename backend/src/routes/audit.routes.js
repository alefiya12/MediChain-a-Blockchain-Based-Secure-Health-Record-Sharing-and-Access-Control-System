import { Router } from "express";
import { getAuditLogs } from "../controllers/audit.controller.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();

// GET /api/audit (accessible to any authenticated user with role-scoped output)
router.get("/", authenticate, getAuditLogs);

export default router;
