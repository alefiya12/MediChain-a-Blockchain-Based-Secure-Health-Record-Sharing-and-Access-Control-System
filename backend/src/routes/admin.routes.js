import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { requireRole } from "../middleware/roles.js";

const router = Router();

// Test route to verify admin protection in Phase 3 exit criteria
router.get("/doctors", authenticate, requireRole("admin"), (req, res) => {
  res.json({ success: true, data: { doctors: [] } });
});

export default router;
