import { promises as fs } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { v4 as uuidv4 } from "uuid";
import { ethers } from "ethers";
import { MedicalRecord } from "../models/MedicalRecord.js";
import { User } from "../models/User.js";
import { DoctorProfile } from "../models/DoctorProfile.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sha256Hex, encryptBuffer, decryptBuffer } from "../services/crypto.service.js";
import {
  getReceiptOrThrow,
  findEvent,
  assertTxSignedBy,
  getRecordOnChain,
  hasAccess
} from "../services/chain.service.js";
import { logAudit } from "../services/audit.service.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STORAGE_DIR = join(__dirname, "../../storage");

/** Ensure storage directory exists */
const ensureStorageDir = async () => {
  await fs.mkdir(STORAGE_DIR, { recursive: true });
};

/**
 * POST /api/records
 * Patient uploads a medical record:
 *   1. Hash plaintext buffer → sha256Hex
 *   2. Encrypt buffer → AES-256-GCM
 *   3. Write ciphertext to storage/<uuid>.enc
 *   4. Create MedicalRecord document (chainStatus: pending)
 *   5. Compute recordIdOnChain = ethers.id(record._id.toString())
 *   6. Respond with { record, fileHash, recordIdOnChain }
 */
export const uploadRecord = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw ApiError.badRequest("No file uploaded. Use multipart/form-data with field name 'file'.");
  }

  if (!req.user.walletAddress) {
    throw ApiError.badRequest(
      "Wallet address required to upload records. Please link your wallet via PUT /api/auth/wallet first."
    );
  }

  const { title, category, description } = req.body;
  if (!title || !title.trim()) throw ApiError.badRequest("Record title is required.");
  if (!category) throw ApiError.badRequest("Record category is required.");

  const plaintext = req.file.buffer;

  // 1. Hash the plaintext file
  const fileHash = sha256Hex(plaintext);

  // 2. Encrypt the buffer
  const { encrypted, iv, authTag } = encryptBuffer(plaintext);

  // 3. Write encrypted file to disk
  await ensureStorageDir();
  const storedName = uuidv4() + ".enc";
  const storedPath = join(STORAGE_DIR, storedName);
  await fs.writeFile(storedPath, encrypted);

  // 4. Create MedicalRecord (without recordIdOnChain yet — we need the _id first)
  const record = await MedicalRecord.create({
    patient: req.user._id,
    title: title.trim(),
    category,
    description: description ? description.trim() : undefined,
    originalName: req.file.originalname,
    mimeType: req.file.mimetype,
    sizeBytes: req.file.size,
    storedName,
    iv,
    authTag,
    fileHash,
    recordIdOnChain: "pending", // placeholder — set below
    chainStatus: "pending"
  });

  // 5. Compute recordIdOnChain = keccak256(record._id.toString())
  const recordIdOnChain = ethers.id(record._id.toString());
  record.recordIdOnChain = recordIdOnChain;
  await record.save();

  // 6. Return metadata so frontend can sign registerRecord(recordIdOnChain, fileHash)
  res.status(201).json({
    success: true,
    message: "File uploaded and encrypted. Sign the registerRecord transaction to confirm on-chain.",
    data: {
      record: {
        _id: record._id,
        title: record.title,
        category: record.category,
        description: record.description,
        originalName: record.originalName,
        mimeType: record.mimeType,
        sizeBytes: record.sizeBytes,
        fileHash: record.fileHash,
        recordIdOnChain: record.recordIdOnChain,
        chainStatus: record.chainStatus,
        createdAt: record.createdAt
      },
      fileHash,
      recordIdOnChain
    }
  });
});

/**
 * POST /api/records/:id/confirm
 * Patient confirms the on-chain registerRecord transaction:
 *   - Validate ownership
 *   - getReceiptOrThrow + assertTxSignedBy(patient wallet)
 *   - Find RecordRegistered event; validate recordId and fileHash
 *   - Update chainStatus → confirmed, txHash, blockNumber
 *   - Audit RECORD_UPLOADED + RECORD_CHAIN_CONFIRMED
 */
export const confirmRecord = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { txHash } = req.body;

  if (!txHash) {
    throw ApiError.badRequest("Transaction hash (txHash) is required to confirm record.");
  }

  const record = await MedicalRecord.findById(id);
  if (!record) throw ApiError.notFound("Medical record not found.");
  if (record.patient.toString() !== req.user._id.toString()) {
    throw ApiError.forbidden("You do not own this record.");
  }
  if (record.chainStatus === "confirmed") {
    throw ApiError.badRequest("Record is already confirmed on-chain.");
  }
  if (!req.user.walletAddress) {
    throw ApiError.badRequest("No wallet linked to your account.");
  }

  // 1. Validate receipt
  const receipt = await getReceiptOrThrow(txHash);

  // 2. Assert tx was signed by the patient's wallet
  await assertTxSignedBy(receipt, req.user.walletAddress);

  // 3. Find RecordRegistered event
  const event = findEvent(receipt, "RecordRegistered");
  if (!event) {
    throw ApiError.badRequest(
      "Transaction does not contain a RecordRegistered event from the MediChain contract."
    );
  }

  // 4. Validate event args against DB values
  const eventRecordId = (event.args.recordId || event.args[0]).toLowerCase();
  const eventFileHash = (event.args.fileHash || event.args[2]).toLowerCase();
  const expectedRecordId = record.recordIdOnChain.toLowerCase();
  const expectedFileHash = record.fileHash.toLowerCase();

  if (eventRecordId !== expectedRecordId) {
    throw ApiError.badRequest(
      `Event recordId ${eventRecordId} does not match expected ${expectedRecordId}.`
    );
  }
  if (eventFileHash !== expectedFileHash) {
    throw ApiError.badRequest(
      `Event fileHash ${eventFileHash} does not match stored hash ${expectedFileHash}.`
    );
  }

  // 5. Update record
  record.chainStatus = "confirmed";
  record.txHash = txHash;
  record.blockNumber = receipt.blockNumber;
  await record.save();

  // 6. Audit logs
  await logAudit({
    actor: req.user._id,
    actorRole: "patient",
    action: "RECORD_UPLOADED",
    patient: req.user._id,
    record: record._id,
    metadata: { title: record.title, category: record.category, fileHash: record.fileHash }
  });
  await logAudit({
    actor: req.user._id,
    actorRole: "patient",
    action: "RECORD_CHAIN_CONFIRMED",
    patient: req.user._id,
    record: record._id,
    txHash,
    metadata: { blockNumber: receipt.blockNumber, recordIdOnChain: record.recordIdOnChain }
  });

  res.json({
    success: true,
    message: "Record confirmed on-chain successfully.",
    data: { record }
  });
});

/**
 * GET /api/records/mine
 * Returns all medical records belonging to the authenticated patient.
 */
export const getMyRecords = asyncHandler(async (req, res) => {
  const records = await MedicalRecord.find({ patient: req.user._id })
    .select("-storedName -iv -authTag") // Never expose encryption internals
    .sort({ createdAt: -1 });

  res.json({
    success: true,
    count: records.length,
    data: { records }
  });
});

/**
 * GET /api/records/:id/download
 * Decrypt and stream the file to:
 *   - The owning patient, or
 *   - An approved doctor with on-chain access (checked via hasAccess).
 * Sets Content-Type and Content-Disposition (original name). Never exposes storedName.
 * Logs RECORD_VIEWED for doctor access.
 */
export const downloadRecord = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const record = await MedicalRecord.findById(id);
  if (!record) throw ApiError.notFound("Medical record not found.");

  const isOwner = record.patient.toString() === req.user._id.toString();
  let isDoctorWithAccess = false;

  if (!isOwner) {
    // Must be a doctor with approved status and on-chain access
    if (req.user.role !== "doctor") {
      throw ApiError.forbidden("Access denied.");
    }

    const doctorProfile = await DoctorProfile.findOne({ user: req.user._id });
    if (!doctorProfile || doctorProfile.status !== "approved") {
      throw ApiError.forbidden("Only approved doctors can access patient records.");
    }

    if (!req.user.walletAddress) {
      throw ApiError.forbidden("Doctor wallet address not linked.");
    }

    // Fetch patient to get their wallet
    const patient = await User.findById(record.patient);
    if (!patient || !patient.walletAddress) {
      throw ApiError.forbidden("Patient wallet address not found; access check failed.");
    }

    const chainAccess = await hasAccess(patient.walletAddress, req.user.walletAddress);
    if (!chainAccess) {
      throw ApiError.forbidden(
        "Access denied: on-chain access grant not found or has been revoked."
      );
    }

    isDoctorWithAccess = true;
  }

  // Read encrypted file from disk
  const storedPath = join(STORAGE_DIR, record.storedName);
  let encryptedData;
  try {
    encryptedData = await fs.readFile(storedPath);
  } catch {
    throw ApiError.internal("Encrypted file not found on disk. Please contact support.");
  }

  // Decrypt
  let plaintext;
  try {
    plaintext = decryptBuffer(encryptedData, record.iv, record.authTag);
  } catch {
    throw ApiError.internal("Failed to decrypt file. Encryption data may be corrupted.");
  }

  // Audit for doctor access
  if (isDoctorWithAccess) {
    await logAudit({
      actor: req.user._id,
      actorRole: "doctor",
      action: "RECORD_VIEWED",
      patient: record.patient,
      doctor: req.user._id,
      record: record._id,
      metadata: { title: record.title }
    });
  }

  // Stream plaintext with correct headers (never expose storedName)
  res.set("Content-Type", record.mimeType);
  res.set(
    "Content-Disposition",
    `attachment; filename="${encodeURIComponent(record.originalName)}"`
  );
  res.set("Content-Length", plaintext.length);
  res.send(plaintext);
});

/**
 * POST /api/records/:id/verify
 * Tamper-detection:
 *   1. Read encrypted file from disk
 *   2. Decrypt → rehash → compare localHash with DB hash
 *   3. Fetch on-chain record via getRecordOnChain → compare chainHash with DB hash
 *   4. Return { status: "VERIFIED" | "TAMPERED", localHash, dbHash, chainHash }
 *   5. Audit RECORD_VERIFIED or RECORD_TAMPER_DETECTED
 */
export const verifyRecord = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const record = await MedicalRecord.findById(id);
  if (!record) throw ApiError.notFound("Medical record not found.");

  const isOwner = record.patient.toString() === req.user._id.toString();
  let isDoctorWithAccess = false;

  if (!isOwner) {
    if (req.user.role !== "doctor") throw ApiError.forbidden("Access denied.");

    const doctorProfile = await DoctorProfile.findOne({ user: req.user._id });
    if (!doctorProfile || doctorProfile.status !== "approved") {
      throw ApiError.forbidden("Only approved doctors can verify patient records.");
    }

    if (!req.user.walletAddress) throw ApiError.forbidden("Doctor wallet not linked.");

    const patient = await User.findById(record.patient);
    if (!patient || !patient.walletAddress) {
      throw ApiError.forbidden("Patient wallet not found; access check failed.");
    }

    const chainAccess = await hasAccess(patient.walletAddress, req.user.walletAddress);
    if (!chainAccess) throw ApiError.forbidden("On-chain access not granted.");
    isDoctorWithAccess = true;
  }

  // Read and decrypt
  const storedPath = join(STORAGE_DIR, record.storedName);
  let encryptedData;
  try {
    encryptedData = await fs.readFile(storedPath);
  } catch {
    throw ApiError.internal("Encrypted file not found on disk.");
  }

  let plaintext;
  try {
    plaintext = decryptBuffer(encryptedData, record.iv, record.authTag);
  } catch {
    // If decryption fails, the file is definitely tampered
    await logAudit({
      actor: req.user._id,
      actorRole: req.user.role,
      action: "RECORD_TAMPER_DETECTED",
      patient: record.patient,
      record: record._id,
      metadata: { reason: "Decryption failure — auth tag mismatch or corrupted ciphertext" }
    });
    return res.json({
      success: true,
      data: {
        status: "TAMPERED",
        reason: "Decryption failed: file ciphertext or auth tag has been tampered with.",
        localHash: null,
        dbHash: record.fileHash,
        chainHash: null
      }
    });
  }

  // Rehash the decrypted plaintext
  const localHash = sha256Hex(plaintext);
  const dbHash = record.fileHash;

  // Fetch on-chain record
  let chainHash = null;
  let onChainError = null;
  if (record.chainStatus === "confirmed" && record.recordIdOnChain !== "pending") {
    try {
      const onChain = await getRecordOnChain(record.recordIdOnChain);
      chainHash = onChain.fileHash.toLowerCase().startsWith("0x")
        ? onChain.fileHash.toLowerCase()
        : "0x" + onChain.fileHash.toLowerCase();
    } catch (e) {
      onChainError = e.message;
    }
  }

  // Determine verification status
  const localMatchesDb = localHash.toLowerCase() === dbHash.toLowerCase();
  const chainMatchesDb =
    chainHash === null ? null : chainHash.toLowerCase() === dbHash.toLowerCase();

  const isVerified = localMatchesDb && (chainHash === null || chainMatchesDb === true);
  const status = isVerified ? "VERIFIED" : "TAMPERED";

  // Audit
  await logAudit({
    actor: req.user._id,
    actorRole: req.user.role,
    action: status === "VERIFIED" ? "RECORD_VERIFIED" : "RECORD_TAMPER_DETECTED",
    patient: record.patient,
    record: record._id,
    metadata: {
      localMatchesDb,
      chainMatchesDb,
      title: record.title
    }
  });

  res.json({
    success: true,
    data: {
      status,
      localHash,
      dbHash,
      chainHash,
      localMatchesDb,
      chainMatchesDb,
      chainStatus: record.chainStatus,
      ...(onChainError && { onChainError })
    }
  });
});

export default {
  uploadRecord,
  confirmRecord,
  getMyRecords,
  downloadRecord,
  verifyRecord
};
