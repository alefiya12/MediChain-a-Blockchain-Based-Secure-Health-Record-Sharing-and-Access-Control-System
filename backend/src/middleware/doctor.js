import { DoctorProfile } from "../models/DoctorProfile.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";

/**
 * Middleware ensuring the authenticated user is a doctor with 'approved' status.
 * Attaches req.doctorProfile upon successful check.
 */
export const requireApprovedDoctor = asyncHandler(async (req, res, next) => {
  if (!req.user) {
    throw ApiError.unauthorized("Authentication required");
  }

  if (req.user.role !== "doctor") {
    throw ApiError.forbidden("Access restricted to doctors only");
  }

  const profile = await DoctorProfile.findOne({ user: req.user._id });
  if (!profile) {
    throw ApiError.forbidden("Doctor profile not found");
  }

  if (profile.status !== "approved") {
    throw ApiError.forbidden(
      `Doctor account is currently '${profile.status}'. Only approved doctors can access this resource.`
    );
  }

  req.doctorProfile = profile;
  next();
});

export default requireApprovedDoctor;
