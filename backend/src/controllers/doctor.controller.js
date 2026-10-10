import { DoctorProfile } from "../models/DoctorProfile.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { isDoctorVerified } from "../services/chain.service.js";

/**
 * GET /api/doctor/profile
 * Returns profile details for the authenticated doctor, including on-chain verification status
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
 * Returns the current verification status, rejection reason (if rejected), and on-chain status
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

export default {
  getProfile,
  getStatus
};
