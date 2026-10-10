import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { ethers } from "ethers";

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true
    },
    passwordHash: {
      type: String,
      required: [true, "Password is required"]
    },
    role: {
      type: String,
      required: [true, "Role is required"],
      enum: {
        values: ["patient", "doctor", "admin"],
        message: "{VALUE} is not a valid role"
      }
    },
    walletAddress: {
      type: String,
      lowercase: true,
      trim: true,
      validate: {
        validator: function (v) {
          if (!v) return true;
          return ethers.isAddress(v);
        },
        message: "Invalid Ethereum/Polygon wallet address"
      }
    },
    patientId: {
      type: String,
      trim: true
    },
    isActive: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true
  }
);

// Indexes
userSchema.index({ walletAddress: 1 }, { unique: true, sparse: true });
userSchema.index({ patientId: 1 }, { unique: true, sparse: true });

// Password comparison method
userSchema.methods.comparePassword = async function (enteredPassword) {
  return bcrypt.compare(enteredPassword, this.passwordHash);
};

// Static helper to hash password
userSchema.statics.hashPassword = async function (plainPassword) {
  return bcrypt.hash(plainPassword, 12);
};

// Exclude passwordHash from JSON responses
userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.passwordHash;
  return obj;
};

export const User = mongoose.model("User", userSchema);
export default User;
