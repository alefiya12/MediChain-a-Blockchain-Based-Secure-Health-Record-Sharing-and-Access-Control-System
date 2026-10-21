import { User } from "../models/User.js";
import { DoctorProfile } from "../models/DoctorProfile.js";
import { MedicalRecord } from "../models/MedicalRecord.js";
import { AccessRequest } from "../models/AccessRequest.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { isDoctorVerified, hasAccess } from "../services/chain.service.js";

/**
 * GET /api/doctor/profile
 * Returns profile details for the authenticated doctor,
 * including on-chain verification status.
 */
export const getProfile = asyncHandler(async (req, res) => {
  const profile = await DoctorProfile.findOne({ user: req.user._id })
    .populate("user", "name email walletAddress role isActive createdAt")
    .populate("verifiedBy", "name email");

  if (!profile) {
    throw ApiError.notFound("Doctor profile not found");
  }

  let chainVerified = false;
  if (profile.user && profile.user.walletAddress) {
    try {
      chainVerified = await isDoctorVerified(profile.user.walletAddress);
    } catch {
      chainVerified = false;
    }
  }

  res.json({
    success: true,
    data: {
      profile,
      chainVerified
    }
  });
});

/**
 * GET /api/doctor/status
 * Returns the current verification status, rejection reason (if rejected),
 * and on-chain status.
 */
export const getStatus = asyncHandler(async (req, res) => {
  const profile = await DoctorProfile.findOne({ user: req.user._id });

  if (!profile) {
    throw ApiError.notFound("Doctor profile not found");
  }

  let chainVerified = false;
  if (req.user.walletAddress) {
    try {
      chainVerified = await isDoctorVerified(req.user.walletAddress);
    } catch {
      chainVerified = false;
    }
  }

  res.json({
    success: true,
    data: {
      status: profile.status,
      rejectionReason: profile.rejectionReason,
      verifyTxHash: profile.verifyTxHash,
      verifiedAt: profile.verifiedAt,
      chainVerified
    }
  });
});

/**
 * GET /api/doctor/patients/search?patientId=MC-P-XXXXXX
 * Exact match only. Returns name, patientId, walletAddress — NO medical data.
 * Requires approved doctor.
 */
export const searchPatient = asyncHandler(async (req, res) => {
  const { patientId } = req.query;
  if (!patientId || !patientId.trim()) {
    throw ApiError.badRequest("patientId query parameter is required.");
  }

  const patient = await User.findOne(
    { patientId: patientId.trim(), role: "patient" },
    "name patientId walletAddress"  // Only safe, non-medical fields
  );

  if (!patient) {
    throw ApiError.notFound(`No patient found with patientId '${patientId}'.`);
  }

  res.json({
    success: true,
    data: {
      patient: {
        name: patient.name,
        patientId: patient.patientId,
        walletAddress: patient.walletAddress
      }
    }
  });
});

/**
 * GET /api/doctor/requests
 * Lists all access requests made by this doctor, with their current statuses.
 * Requires approved doctor.
 */
export const getMyRequests = asyncHandler(async (req, res) => {
  const requests = await AccessRequest.find({ doctor: req.user._id })
    .populate("patient", "name patientId walletAddress")
    .sort({ createdAt: -1 });

  res.json({
    success: true,
    count: requests.length,
    data: { requests }
  });
});

/**
 * GET /api/doctor/authorized-patients
 * Returns patients whose access is still granted to this doctor.
 * Each grant is live-checked against the chain (hasAccess).
 * Requires approved doctor.
 */
export const getAuthorizedPatients = asyncHandler(async (req, res) => {
  if (!req.user.walletAddress) {
    throw ApiError.badRequest("Doctor wallet address is not linked.");
  }

  // Get DB-granted requests for this doctor
  const grants = await AccessRequest.find({
    doctor: req.user._id,
    status: "granted"
  }).populate("patient", "name patientId walletAddress email");

  // Live-verify each grant against the chain
  const liveGrants = await Promise.all(
    grants.map(async (g) => {
      let liveAccess = false;
      if (g.patient && g.patient.walletAddress) {
        try {
          liveAccess = await hasAccess(g.patient.walletAddress, req.user.walletAddress);
        } catch {
          liveAccess = false;
        }
      }
      return {
        requestId: g._id,
        patient: {
          _id: g.patient._id,
          name: g.patient.name,
          patientId: g.patient.patientId,
          walletAddress: g.patient.walletAddress,
          email: g.patient.email
        },
        grantedAt: g.respondedAt,
        requestTxHash: g.requestTxHash,
        responseTxHash: g.responseTxHash,
        liveChainAccess: liveAccess
      };
    })
  );

  // Only surface grants that are still live on-chain
  const activeGrants = liveGrants.filter((g) => g.liveChainAccess);

  res.json({
    success: true,
    count: activeGrants.length,
    data: { authorizedPatients: activeGrants }
  });
});

/**
 * GET /api/doctor/patients/:patientId/records
 * Returns the medical record metadata for a patient.
 * REQUIRES live on-chain hasAccess check — DB grant alone is not enough.
 * Requires approved doctor.
 */
export const getPatientRecords = asyncHandler(async (req, res) => {
  const { patientId } = req.params;

  if (!req.user.walletAddress) {
    throw ApiError.badRequest("Doctor wallet address is not linked.");
  }

  // Resolve patient
  const patient = await User.findOne({ patientId, role: "patient" });
  if (!patient) {
    throw ApiError.notFound(`No patient found with patientId '${patientId}'.`);
  }

  if (!patient.walletAddress) {
    throw ApiError.forbidden("Patient has not linked a wallet address; access check cannot be performed.");
  }

  // Live chain access check — never trust DB alone
  const chainAccess = await hasAccess(patient.walletAddress, req.user.walletAddress);
  if (!chainAccess) {
    throw ApiError.forbidden(
      "Access denied: you do not have active on-chain access to this patient's records."
    );
  }

  // Return record metadata (never storedName, iv, authTag)
  const records = await MedicalRecord.find({ patient: patient._id })
    .select("-storedName -iv -authTag")
    .sort({ createdAt: -1 });

  res.json({
    success: true,
    count: records.length,
    data: {
      patient: {
        name: patient.name,
        patientId: patient.patientId
      },
      records
    }
  });
});

export default {
  getProfile,
  getStatus,
  searchPatient,
  getMyRequests,
  getAuthorizedPatients,
  getPatientRecords
};
