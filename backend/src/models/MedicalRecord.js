import mongoose from "mongoose";

const medicalRecordSchema = new mongoose.Schema(
  {
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    title: {
      type: String,
      required: [true, "Record title is required"],
      trim: true
    },
    category: {
      type: String,
      required: [true, "Category is required"],
      enum: {
        values: [
          "prescription",
          "lab_report",
          "diagnosis_report",
          "scan_report",
          "discharge_summary"
        ],
        message: "{VALUE} is not a valid category"
      }
    },
    description: {
      type: String,
      trim: true
    },
    originalName: {
      type: String,
      required: true
    },
    mimeType: {
      type: String,
      required: true
    },
    sizeBytes: {
      type: Number,
      required: true
    },
    storedName: {
      type: String,
      required: true,
      unique: true
    },
    iv: {
      type: String,
      required: true
    },
    authTag: {
      type: String,
      required: true
    },
    fileHash: {
      type: String,
      required: true
    },
    recordIdOnChain: {
      type: String,
      required: true,
      index: true
    },
    chainStatus: {
      type: String,
      enum: ["pending", "confirmed"],
      default: "pending"
    },
    txHash: {
      type: String,
      trim: true
    },
    blockNumber: {
      type: Number
    }
  },
  {
    timestamps: true
  }
);

export const MedicalRecord = mongoose.model("MedicalRecord", medicalRecordSchema);
export default MedicalRecord;
