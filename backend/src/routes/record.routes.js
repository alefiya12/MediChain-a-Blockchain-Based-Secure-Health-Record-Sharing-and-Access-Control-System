import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { requireRole } from "../middleware/roles.js";
import { uploadSingle } from "../middleware/upload.js";
import {
  uploadRecord,
  confirmRecord,
  getMyRecords,
  downloadRecord,
  verifyRecord
} from "../controllers/record.controller.js";

const router = Router();

// All record routes require authentication
router.use(authenticate);

// Patient-only routes
router.post("/", requireRole("patient"), uploadSingle, uploadRecord);
router.post("/:id/confirm", requireRole("patient"), confirmRecord);
router.get("/mine", requireRole("patient"), getMyRecords);

// Download and verify — accessible to owner patient OR approved doctor with on-chain access
// Access enforcement is handled inside the controller
router.get("/:id/download", downloadRecord);
router.post("/:id/verify", verifyRecord);

export default router;
