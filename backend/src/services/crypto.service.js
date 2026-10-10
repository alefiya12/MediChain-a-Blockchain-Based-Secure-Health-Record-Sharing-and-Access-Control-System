import crypto from "crypto";
import { env } from "../config/env.js";

/**
 * Compute SHA-256 of a buffer and return as "0x" + hex string (64 chars after 0x).
 * @param {Buffer} buffer
 * @returns {string} e.g. "0xabc123..."
 */
export const sha256Hex = (buffer) => {
  const hash = crypto.createHash("sha256").update(buffer).digest("hex");
  return "0x" + hash;
};

/**
 * Encrypt a buffer using AES-256-GCM.
 * @param {Buffer} buffer  Plaintext bytes
 * @returns {{ encrypted: Buffer, iv: string, authTag: string }}
 *   iv and authTag are base64-encoded strings for storage.
 */
export const encryptBuffer = (buffer) => {
  const key = Buffer.from(env.FILE_ENCRYPTION_KEY, "hex"); // 32 bytes
  const iv = crypto.randomBytes(12); // 12-byte random IV for GCM
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const authTag = cipher.getAuthTag(); // 16-byte GCM auth tag

  return {
    encrypted,
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64")
  };
};

/**
 * Decrypt a buffer encrypted with AES-256-GCM.
 * @param {Buffer} encrypted      Ciphertext bytes
 * @param {string} iv             Base64-encoded 12-byte IV
 * @param {string} authTag        Base64-encoded 16-byte GCM auth tag
 * @returns {Buffer}              Plaintext bytes
 */
export const decryptBuffer = (encrypted, iv, authTag) => {
  const key = Buffer.from(env.FILE_ENCRYPTION_KEY, "hex");
  const ivBuf = Buffer.from(iv, "base64");
  const authTagBuf = Buffer.from(authTag, "base64");

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, ivBuf);
  decipher.setAuthTag(authTagBuf);

  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
};

export default { sha256Hex, encryptBuffer, decryptBuffer };
