import { MedicalRecord } from "../models/MedicalRecord.js";
import { AccessRequest } from "../models/AccessRequest.js";
import { AuditLog } from "../models/AuditLog.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";

/**
 * GET /api/patient/dashboard
 * Returns counts and recent audit activity for the authenticated patient.
 */
export const getDashboard = asyncHandler(async (req, res) => {
  const patientId = req.user._id;

  const [
    totalRecords,
    confirmedRecords,
    pendingRecords,
    pendingRequests,
    grantedAccess,
    recentActivity
  ] = await Promise.all([
    MedicalRecord.countDocuments({ patient: patientId }),
    MedicalRecord.countDocuments({ patient: patientId, chainStatus: "confirmed" }),
    MedicalRecord.countDocuments({ patient: patientId, chainStatus: "pending" }),
    AccessRequest.countDocuments({ patient: patientId, status: "pending" }),
    AccessRequest.countDocuments({ patient: patientId, status: "granted" }),
    AuditLog.find({ patient: patientId })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate("actor", "name email role")
      .populate("record", "title category")
      .select("action createdAt txHash metadata")
  ]);

  res.json({
    success: true,
    data: {
      counts: {
        records: {
          total: totalRecords,
          confirmed: confirmedRecords,
          pending: pendingRecords
        },
        accessRequests: {
          pending: pendingRequests,
          granted: grantedAccess
        }
      },
      recentActivity
    }
  });
});

/**
 * GET /api/patient/access-requests?status=
 * Returns access requests addressed to this patient (optionally filtered by status).
 */
export const getAccessRequests = asyncHandler(async (req, res) => {
  const { status } = req.query;
  const filter = { patient: req.user._id };

  if (status) {
    const valid = ["pending", "granted", "rejected", "revoked"];
    if (!valid.includes(status)) {
      throw ApiError.badRequest(`Invalid status. Expected one of: ${valid.join(", ")}.`);
    }
    filter.status = status;
  }

  const requests = await AccessRequest.find(filter)
    .populate("doctor", "name email walletAddress")
    .sort({ createdAt: -1 });

  res.json({
    success: true,
    count: requests.length,
    data: { requests }
  });
});

/**
 * GET /api/patient/granted
 * Returns doctors with currently granted access to this patient's records.
 */
export const getGrantedAccess = asyncHandler(async (req, res) => {
  const grants = await AccessRequest.find({
    patient: req.user._id,
    status: "granted"
  })
    .populate("doctor", "name email walletAddress")
    .sort({ updatedAt: -1 });

  res.json({
    success: true,
    count: grants.length,
    data: { grants }
  });
});

export default { getDashboard, getAccessRequests, getGrantedAccess };
