import mongoose from "mongoose";

export const AUDIT_ACTIONS = [
  "USER_REGISTERED",
  "DOCTOR_REGISTERED",
  "DOCTOR_APPROVED",
  "DOCTOR_REJECTED",
  "RECORD_UPLOADED",
  "RECORD_CHAIN_CONFIRMED",
  "RECORD_VERIFIED",
  "RECORD_TAMPER_DETECTED",
  "RECORD_VIEWED",
  "ACCESS_REQUESTED",
  "ACCESS_GRANTED",
  "ACCESS_REJECTED",
  "ACCESS_REVOKED"
];

const auditLogSchema = new mongoose.Schema(
  {
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    actorRole: {
      type: String,
      required: true,
      enum: ["patient", "doctor", "admin"]
    },
    action: {
      type: String,
      required: true,
      enum: AUDIT_ACTIONS,
      index: true
    },
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true
    },
    doctor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true
    },
    record: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MedicalRecord"
    },
    txHash: {
      type: String,
      trim: true
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  {
    timestamps: { createdAt: true, updatedAt: false }
  }
);

export const AuditLog = mongoose.model("AuditLog", auditLogSchema);
export default AuditLog;
