import mongoose from "mongoose";
import { DoctorProfile } from "../models/DoctorProfile.js";
import { User } from "../models/User.js";
import { MedicalRecord } from "../models/MedicalRecord.js";
import { AccessRequest } from "../models/AccessRequest.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  getReceiptOrThrow,
  findEvent,
  isDoctorVerified,
  assertTxSignedBy
} from "../services/chain.service.js";
import { logAudit } from "../services/audit.service.js";
import { env } from "../config/env.js";

/**
 * Helper to find a doctor profile by either DoctorProfile._id or User._id
 */
const findDoctorProfileByIdOrUser = async (id) => {
  if (!mongoose.isValidObjectId(id)) {
    throw ApiError.badRequest("Invalid ID format");
  }

  let profile = await DoctorProfile.findById(id)
    .populate("user", "name email walletAddress role isActive createdAt")
    .populate("verifiedBy", "name email");

  if (!profile) {
    profile = await DoctorProfile.findOne({ user: id })
      .populate("user", "name email walletAddress role isActive createdAt")
      .populate("verifiedBy", "name email");
  }

  return profile;
};

/**
 * GET /api/admin/doctors?status=pending
 * List doctors optionally filtered by status
 */
export const getDoctors = asyncHandler(async (req, res) => {
  const { status } = req.query;

  const filter = {};
  if (status) {
    if (!["pending", "approved", "rejected"].includes(status)) {
      throw ApiError.badRequest("Invalid status query parameter. Expected pending, approved, or rejected.");
    }
    filter.status = status;
  }

  const doctors = await DoctorProfile.find(filter)
    .populate("user", "name email walletAddress role isActive createdAt")
    .populate("verifiedBy", "name email")
    .sort({ createdAt: -1 });

  res.json({
    success: true,
    count: doctors.length,
    data: {
      doctors
    }
  });
});

/**
 * GET /api/admin/doctors/:id
 * Retrieve doctor profile detail and verify live on-chain status
 */
export const getDoctorById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const doctor = await findDoctorProfileByIdOrUser(id);
  if (!doctor) {
    throw ApiError.notFound("Doctor profile not found");
  }

  let chainVerified = false;
  if (doctor.user && doctor.user.walletAddress) {
    try {
      chainVerified = await isDoctorVerified(doctor.user.walletAddress);
    } catch {
      chainVerified = false;
    }
  }

  res.json({
    success: true,
    data: {
      doctor,
      chainVerified
    }
  });
});

/**
 * POST /api/admin/doctors/:id/approve
 * Approves a doctor after verifying on-chain verifyDoctor transaction receipt and event
 */
export const approveDoctor = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { txHash } = req.body;

  if (!txHash) {
    throw ApiError.badRequest("Transaction hash (txHash) is required for doctor approval");
  }

  const doctor = await findDoctorProfileByIdOrUser(id);
  if (!doctor) {
    throw ApiError.notFound("Doctor profile not found");
  }

  if (!doctor.user || !doctor.user.walletAddress) {
    throw ApiError.badRequest("Doctor does not have a wallet address linked to verify on-chain");
  }


  // 1. Fetch & validate receipt (status === 1, to === CONTRACT_ADDRESS)
  const receipt = await getReceiptOrThrow(txHash);

  // 2. Assert transaction was signed by the admin's wallet
  const expectedAdminWallet = req.user.walletAddress || env.ADMIN_WALLET;
  await assertTxSignedBy(receipt, expectedAdminWallet);

  // 3. Find DoctorVerified event emitted by MediChain contract
  const event = findEvent(receipt, "DoctorVerified");
  if (!event) {
    throw ApiError.badRequest("Transaction does not contain the DoctorVerified event from MediChain contract");
  }

  // 4. Assert the event matches this doctor's wallet address
  const verifiedDoctorWallet = (event.args.doctor || event.args[0] || "").toLowerCase();
  const expectedDoctorWallet = doctor.user.walletAddress.toLowerCase();

  if (verifiedDoctorWallet !== expectedDoctorWallet) {
    throw ApiError.badRequest(
      `Transaction event verified doctor ${verifiedDoctorWallet}, but this doctor's wallet is ${expectedDoctorWallet}`
    );
  }

  // 5. Double-check verifiedDoctors(wallet) in contract state
  const isVerified = await isDoctorVerified(doctor.user.walletAddress);
  if (!isVerified) {
    throw ApiError.badRequest("On-chain verification check failed: doctor is not marked verified in contract");
  }

  // 6. Update database record
  doctor.status = "approved";
  doctor.verifiedBy = req.user._id;
  doctor.verifiedAt = new Date();
  doctor.verifyTxHash = txHash;
  doctor.rejectionReason = undefined;
  await doctor.save();

  // 7. Audit log
  await logAudit({
    actor: req.user._id,
    actorRole: "admin",
    action: "DOCTOR_APPROVED",
    doctor: doctor.user._id,
    txHash,
    metadata: {
      licenseNumber: doctor.licenseNumber,
      walletAddress: doctor.user.walletAddress,
      blockNumber: receipt.blockNumber
    }
  });

  res.json({
    success: true,
    message: "Doctor approved successfully and verified on-chain",
    data: {
      doctor
    }
  });
});

/**
 * POST /api/admin/doctors/:id/reject
 * Rejects a doctor with reason, and optional txHash if rejected on-chain
 */
export const rejectDoctor = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reason, txHash } = req.body;

  if (!reason || typeof reason !== "string" || !reason.trim()) {
    throw ApiError.badRequest("Rejection reason is required");
  }

  const doctor = await findDoctorProfileByIdOrUser(id);
  if (!doctor) {
    throw ApiError.notFound("Doctor profile not found");
  }

  // If txHash is provided, verify on-chain rejectDoctor transaction
  if (txHash) {
    const receipt = await getReceiptOrThrow(txHash);
    const expectedAdminWallet = req.user.walletAddress || env.ADMIN_WALLET;
    await assertTxSignedBy(receipt, expectedAdminWallet);

    const event = findEvent(receipt, "DoctorRejected");
    if (!event) {
      throw ApiError.badRequest("Transaction does not contain the DoctorRejected event from MediChain contract");
    }

    if (doctor.user && doctor.user.walletAddress) {
      const rejectedDoctorWallet = (event.args.doctor || event.args[0] || "").toLowerCase();
      const expectedDoctorWallet = doctor.user.walletAddress.toLowerCase();
      if (rejectedDoctorWallet !== expectedDoctorWallet) {
        throw ApiError.badRequest(
          `Transaction event rejected doctor ${rejectedDoctorWallet}, expected ${expectedDoctorWallet}`
        );
      }
    }
    doctor.verifyTxHash = txHash;
  }

  doctor.status = "rejected";
  doctor.rejectionReason = reason.trim();
  doctor.verifiedBy = req.user._id;
  doctor.verifiedAt = new Date();
  await doctor.save();

  await logAudit({
    actor: req.user._id,
    actorRole: "admin",
    action: "DOCTOR_REJECTED",
    doctor: doctor.user._id,
    txHash: txHash || undefined,
    metadata: {
      reason: reason.trim(),
      licenseNumber: doctor.licenseNumber
    }
  });

  res.json({
    success: true,
    message: "Doctor rejected successfully",
    data: {
      doctor
    }
  });
});

/**
 * GET /api/admin/stats
 * Returns counts for dashboard: patients, doctors (by status), records, access requests
 */
export const getStats = asyncHandler(async (req, res) => {
  const [
    patientsCount,
    totalDoctors,
    pendingDoctors,
    approvedDoctors,
    rejectedDoctors,
    recordsCount,
    accessRequestsCount
  ] = await Promise.all([
    User.countDocuments({ role: "patient" }),
    DoctorProfile.countDocuments({}),
    DoctorProfile.countDocuments({ status: "pending" }),
    DoctorProfile.countDocuments({ status: "approved" }),
    DoctorProfile.countDocuments({ status: "rejected" }),
    MedicalRecord.countDocuments({}),
    AccessRequest.countDocuments({})
  ]);

  res.json({
    success: true,
    data: {
      stats: {
        patients: patientsCount,
        doctors: {
          total: totalDoctors,
          pending: pendingDoctors,
          approved: approvedDoctors,
          rejected: rejectedDoctors
        },
        records: recordsCount,
        accessRequests: accessRequestsCount
      }
    }
  });
});

export default {
  getDoctors,
  getDoctorById,
  approveDoctor,
  rejectDoctor,
  getStats
};
