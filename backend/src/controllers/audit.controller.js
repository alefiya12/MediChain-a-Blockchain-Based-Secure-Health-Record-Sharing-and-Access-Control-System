import { AuditLog } from "../models/AuditLog.js";
import { asyncHandler } from "../utils/asyncHandler.js";

/**
 * GET /api/audit
 * Role-scoped paginated logs:
 * - patient -> own (patient == req.user._id OR actor == req.user._id)
 * - doctor -> own actions (actor == req.user._id OR doctor == req.user._id)
 * - admin -> all
 * Supports ?action=&page=&limit=
 */
export const getAuditLogs = asyncHandler(async (req, res) => {
  const { action, page = 1, limit = 20 } = req.query;
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (pageNum - 1) * limitNum;

  const query = {};

  // Action filter
  if (action) {
    query.action = action;
  }

  // Role scoping
  if (req.user.role === "patient") {
    query.$or = [{ patient: req.user._id }, { actor: req.user._id }];
  } else if (req.user.role === "doctor") {
    query.$or = [{ doctor: req.user._id }, { actor: req.user._id }];
  }
  // admin gets all (no query.$or filter)

  const [logs, total] = await Promise.all([
    AuditLog.find(query)
      .populate("actor", "name email role")
      .populate("patient", "name email patientId")
      .populate("doctor", "name email")
      .populate("record", "title category originalName")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum),
    AuditLog.countDocuments(query)
  ]);

  res.json({
    success: true,
    data: {
      logs,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      }
    }
  });
});

export default {
  getAuditLogs
};
