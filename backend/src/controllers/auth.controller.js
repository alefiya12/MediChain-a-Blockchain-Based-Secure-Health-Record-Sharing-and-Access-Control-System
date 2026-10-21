import jwt from "jsonwebtoken";
import { ethers } from "ethers";
import { env } from "../config/env.js";
import { User } from "../models/User.js";
import { DoctorProfile } from "../models/DoctorProfile.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { generateUniquePatientId } from "../services/patientId.service.js";
import { logAudit } from "../services/audit.service.js";

const generateToken = (userId, role) => {
  return jwt.sign({ id: userId, role }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN
  });
};

/**
 * POST /api/auth/register
 */
export const register = asyncHandler(async (req, res) => {
  const {
    name,
    email,
    password,
    role,
    walletAddress,
    licenseNumber,
    specialization,
    hospital,
    experienceYears
  } = req.body;

  // Admin cannot be registered via public endpoint
  if (role === "admin") {
    throw ApiError.badRequest("Admin accounts cannot be registered via this endpoint");
  }

  // Check email uniqueness
  const existingUser = await User.findOne({ email: email.toLowerCase() });
  if (existingUser) {
    throw ApiError.conflict("An account with this email already exists");
  }

  // Check wallet uniqueness if provided
  if (walletAddress) {
    const existingWallet = await User.findOne({
      walletAddress: walletAddress.toLowerCase()
    });
    if (existingWallet) {
      throw ApiError.conflict("This wallet address is already linked to another account");
    }
  }

  // Doctor-specific license uniqueness check
  if (role === "doctor") {
    const existingLicense = await DoctorProfile.findOne({ licenseNumber });
    if (existingLicense) {
      throw ApiError.conflict("A doctor profile with this license number already exists");
    }
  }

  const passwordHash = await User.hashPassword(password);

  let patientId = undefined;
  if (role === "patient") {
    patientId = await generateUniquePatientId();
  }

  // Create User
  const user = await User.create({
    name,
    email: email.toLowerCase(),
    passwordHash,
    role,
    walletAddress: walletAddress ? walletAddress.toLowerCase() : undefined,
    patientId
  });

  let doctorProfile = null;
  if (role === "doctor") {
    doctorProfile = await DoctorProfile.create({
      user: user._id,
      licenseNumber,
      specialization,
      hospital,
      experienceYears: experienceYears !== undefined && experienceYears !== "" ? Number(experienceYears) : 0,
      status: "pending"
    });

    await logAudit({
      actor: user._id,
      actorRole: "doctor",
      action: "DOCTOR_REGISTERED",
      doctor: user._id,
      metadata: { licenseNumber, specialization, hospital }
    });
  } else {
    await logAudit({
      actor: user._id,
      actorRole: "patient",
      action: "USER_REGISTERED",
      patient: user._id,
      metadata: { patientId }
    });
  }

  const token = generateToken(user._id, user.role);

  const userData = user.toJSON();
  if (doctorProfile) {
    userData.doctorProfile = doctorProfile;
    userData.doctorStatus = doctorProfile.status;
  }

  res.status(201).json({
    success: true,
    message: "Registration successful",
    data: {
      token,
      user: userData
    }
  });
});

/**
 * POST /api/auth/login
 */
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email: email.toLowerCase() }).select("+passwordHash");
  if (!user) {
    throw ApiError.unauthorized("Invalid email or password");
  }

  const isPasswordMatch = await user.comparePassword(password);
  if (!isPasswordMatch) {
    throw ApiError.unauthorized("Invalid email or doctor/patient credentials");
  }

  if (!user.isActive) {
    throw ApiError.forbidden("Your account has been deactivated. Please contact support.");
  }

  const token = generateToken(user._id, user.role);
  const userData = user.toJSON();

  if (user.role === "doctor") {
    const doctorProfile = await DoctorProfile.findOne({ user: user._id });
    userData.doctorProfile = doctorProfile;
    userData.doctorStatus = doctorProfile ? doctorProfile.status : "pending";
  }

  res.json({
    success: true,
    message: "Login successful",
    data: {
      token,
      user: userData
    }
  });
});

/**
 * GET /api/auth/me
 */
export const getMe = asyncHandler(async (req, res) => {
  const userData = req.user.toJSON();

  if (req.user.role === "doctor") {
    const doctorProfile = await DoctorProfile.findOne({ user: req.user._id });
    userData.doctorProfile = doctorProfile;
    userData.doctorStatus = doctorProfile ? doctorProfile.status : "pending";
  }

  res.json({
    success: true,
    data: {
      user: userData
    }
  });
});

/**
 * PUT /api/auth/wallet
 */
export const updateWallet = asyncHandler(async (req, res) => {
  const { walletAddress } = req.body;

  if (!walletAddress || !ethers.isAddress(walletAddress)) {
    throw ApiError.badRequest("Invalid Ethereum/Polygon wallet address");
  }

  const normalizedAddress = walletAddress.toLowerCase();

  // Check if wallet is used by another user
  const existingUser = await User.findOne({
    walletAddress: normalizedAddress,
    _id: { $ne: req.user._id }
  });

  if (existingUser) {
    throw ApiError.conflict("Wallet address is already linked to another account");
  }

  req.user.walletAddress = normalizedAddress;
  await req.user.save();

  res.json({
    success: true,
    message: "Wallet address updated successfully",
    data: {
      user: req.user.toJSON()
    }
  });
});

export default {
  register,
  login,
  getMe,
  updateWallet
};
