import mongoose from "mongoose";

const accessRequestSchema = new mongoose.Schema(
  {
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    doctor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    reason: {
      type: String,
      required: [true, "Reason for requesting access is required"],
      trim: true
    },
    status: {
      type: String,
      enum: ["pending", "granted", "rejected", "revoked"],
      default: "pending",
      required: true
    },
    requestTxHash: {
      type: String,
      trim: true
    },
    responseTxHash: {
      type: String,
      trim: true
    },
    revokeTxHash: {
      type: String,
      trim: true
    },
    respondedAt: {
      type: Date
    },
    revokedAt: {
      type: Date
    }
  },
  {
    timestamps: true
  }
);

// Partial unique index: only one active (pending or granted) request between patient and doctor
accessRequestSchema.index(
  { patient: 1, doctor: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: ["pending", "granted"] } }
  }
);

export const AccessRequest = mongoose.model("AccessRequest", accessRequestSchema);
export default AccessRequest;
