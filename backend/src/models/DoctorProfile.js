import mongoose from "mongoose";

const doctorProfileSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true
    },
    licenseNumber: {
      type: String,
      required: [true, "License number is required"],
      unique: true,
      trim: true
    },
    specialization: {
      type: String,
      required: [true, "Specialization is required"],
      trim: true
    },
    hospital: {
      type: String,
      required: [true, "Hospital is required"],
      trim: true
    },
    experienceYears: {
      type: Number,
      required: [true, "Experience in years is required"],
      min: [0, "Experience years cannot be negative"]
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending"
    },
    rejectionReason: {
      type: String,
      trim: true
    },
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },
    verifiedAt: {
      type: Date
    },
    verifyTxHash: {
      type: String,
      trim: true
    }
  },
  {
    timestamps: true
  }
);

export const DoctorProfile = mongoose.model("DoctorProfile", doctorProfileSchema);
export default DoctorProfile;
