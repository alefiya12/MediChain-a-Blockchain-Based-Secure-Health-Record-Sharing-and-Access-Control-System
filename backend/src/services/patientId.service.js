import crypto from "crypto";
import { User } from "../models/User.js";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/**
 * Generate a random 6-character code using the defined unambiguous alphabet
 */
const generateRandomCode = () => {
  const bytes = crypto.randomBytes(6);
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return code;
};

/**
 * Generates a unique patient ID in the format MC-P-XXXXXX
 * Retries automatically on collision
 */
export const generateUniquePatientId = async (maxRetries = 10) => {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const candidateId = `MC-P-${generateRandomCode()}`;
    const existing = await User.findOne({ patientId: candidateId });
    if (!existing) {
      return candidateId;
    }
  }
  throw new Error("Failed to generate unique patient ID after multiple attempts");
};

export default {
  generateUniquePatientId
};
