import { Router } from "express";
import { getAuditLogs, getOnChainEvents } from "../controllers/audit.controller.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();

// GET /api/audit (role-scoped database audit logs)
router.get("/", authenticate, getAuditLogs);

// GET /api/audit/on-chain (role-scoped live blockchain events from MediChain contract)
router.get("/on-chain", authenticate, getOnChainEvents);

export default router;
