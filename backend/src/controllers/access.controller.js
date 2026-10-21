import { User } from "../models/User.js";
import { DoctorProfile } from "../models/DoctorProfile.js";
import { AccessRequest } from "../models/AccessRequest.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  getReceiptOrThrow,
  findEvent,
  assertTxSignedBy
} from "../services/chain.service.js";
import { logAudit } from "../services/audit.service.js";

/**
 * POST /api/access/request
 * Approved doctor requests access to a patient's records.
 *
 * Body: { patientId, reason, txHash }
 *   - patientId: the patient's MC-P-XXXXXX identifier
 *   - reason: plain-text reason
 *   - txHash: the on-chain requestAccess(patientWallet) tx hash
 *
 * Verifications:
 *   1. Doctor is approved (DB status + wallet linked)
 *   2. Receipt exists, was sent to MediChain contract, and reverted? → 400
 *   3. Tx was signed by the doctor's wallet
 *   4. AccessRequested(patient, doctor) event found and matches
 *   5. No active (pending or granted) request already exists in DB
 */
export const requestAccess = asyncHandler(async (req, res) => {
  const { patientId, reason, txHash } = req.body;

  if (!patientId) throw ApiError.badRequest("patientId is required.");
  if (!reason || !reason.trim()) throw ApiError.badRequest("reason is required.");
  if (!txHash) throw ApiError.badRequest("txHash is required.");

  // Doctor must be approved in DB
  const doctorProfile = await DoctorProfile.findOne({ user: req.user._id });
  if (!doctorProfile || doctorProfile.status !== "approved") {
    throw ApiError.forbidden(
      "Only approved doctors can request access to patient records."
    );
  }

  if (!req.user.walletAddress) {
    throw ApiError.badRequest("Doctor wallet address is not linked. Please update your profile.");
  }

  // Resolve patient by patientId
  const patient = await User.findOne({ patientId, role: "patient" });
  if (!patient) throw ApiError.notFound(`Patient with patientId '${patientId}' not found.`);

  if (!patient.walletAddress) {
    throw ApiError.badRequest("Patient has not linked a wallet address yet.");
  }

  // Verify on-chain receipt
  const receipt = await getReceiptOrThrow(txHash);

  // Assert tx signed by doctor
  await assertTxSignedBy(receipt, req.user.walletAddress);

  // Locate AccessRequested(patient, doctor) event
  const event = findEvent(receipt, "AccessRequested");
  if (!event) {
    throw ApiError.badRequest(
      "Transaction does not contain an AccessRequested event from the MediChain contract."
    );
  }

  const eventPatient = (event.args.patient || event.args[0]).toLowerCase();
  const eventDoctor = (event.args.doctor || event.args[1]).toLowerCase();

  if (eventPatient !== patient.walletAddress.toLowerCase()) {
    throw ApiError.badRequest(
      `Event patient address (${eventPatient}) does not match patient's wallet (${patient.walletAddress.toLowerCase()}).`
    );
  }
  if (eventDoctor !== req.user.walletAddress.toLowerCase()) {
    throw ApiError.badRequest(
      `Event doctor address (${eventDoctor}) does not match your wallet (${req.user.walletAddress.toLowerCase()}).`
    );
  }

  // Check for active (pending/granted) request in DB — partial unique index enforces this too,
  // but we give a clear 409 response here
  const existing = await AccessRequest.findOne({
    patient: patient._id,
    doctor: req.user._id,
    status: { $in: ["pending", "granted"] }
  });
  if (existing) {
    throw ApiError.conflict(
      `An active access request already exists with status '${existing.status}'.`
    );
  }

  // Create AccessRequest
  const request = await AccessRequest.create({
    patient: patient._id,
    doctor: req.user._id,
    reason: reason.trim(),
    status: "pending",
    requestTxHash: txHash
  });

  // Audit
  await logAudit({
    actor: req.user._id,
    actorRole: "doctor",
    action: "ACCESS_REQUESTED",
    patient: patient._id,
    doctor: req.user._id,
    txHash,
    metadata: { patientId, reason: reason.trim() }
  });

  res.status(201).json({
    success: true,
    message: "Access request submitted successfully.",
    data: { request }
  });
});

/**
 * POST /api/access/:id/respond
 * Patient grants or rejects an access request.
 *
 * Body: { approve: boolean, txHash }
 *   - approve: true → grant, false → reject
 *   - txHash: on-chain respondToRequest(doctorWallet, approve) tx hash
 *
 * Verifications:
 *   1. Patient owns the request
 *   2. Request is pending
 *   3. Receipt valid; signer = patient wallet
 *   4. AccessGranted or AccessRejected event matches
 */
export const respondToRequest = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { approve, txHash } = req.body;

  if (approve === undefined || approve === null) {
    throw ApiError.badRequest("'approve' (boolean) is required.");
  }
  if (!txHash) throw ApiError.badRequest("txHash is required.");

  const accessRequest = await AccessRequest.findById(id)
    .populate("patient", "walletAddress")
    .populate("doctor", "walletAddress");

  if (!accessRequest) throw ApiError.notFound("Access request not found.");
  if (accessRequest.patient._id.toString() !== req.user._id.toString()) {
    throw ApiError.forbidden("You are not the patient associated with this request.");
  }
  if (accessRequest.status !== "pending") {
    throw ApiError.badRequest(
      `Request is not pending (current status: '${accessRequest.status}').`
    );
  }

  if (!req.user.walletAddress) {
    throw ApiError.badRequest("Patient wallet address is not linked.");
  }

  // On-chain verification
  const receipt = await getReceiptOrThrow(txHash);
  await assertTxSignedBy(receipt, req.user.walletAddress);

  const expectedEvent = approve ? "AccessGranted" : "AccessRejected";
  const event = findEvent(receipt, expectedEvent);
  if (!event) {
    throw ApiError.badRequest(
      `Transaction does not contain an ${expectedEvent} event from the MediChain contract.`
    );
  }

  const eventPatient = (event.args.patient || event.args[0]).toLowerCase();
  const eventDoctor = (event.args.doctor || event.args[1]).toLowerCase();
  const doctorWallet = accessRequest.doctor.walletAddress;

  if (eventPatient !== req.user.walletAddress.toLowerCase()) {
    throw ApiError.badRequest(
      `Event patient address (${eventPatient}) does not match your wallet (${req.user.walletAddress.toLowerCase()}).`
    );
  }
  if (doctorWallet && eventDoctor !== doctorWallet.toLowerCase()) {
    throw ApiError.badRequest(
      `Event doctor address (${eventDoctor}) does not match doctor's wallet (${doctorWallet.toLowerCase()}).`
    );
  }

  // Update request
  const newStatus = approve ? "granted" : "rejected";
  accessRequest.status = newStatus;
  accessRequest.responseTxHash = txHash;
  accessRequest.respondedAt = new Date();
  await accessRequest.save();

  const auditAction = approve ? "ACCESS_GRANTED" : "ACCESS_REJECTED";
  await logAudit({
    actor: req.user._id,
    actorRole: "patient",
    action: auditAction,
    patient: req.user._id,
    doctor: accessRequest.doctor._id,
    txHash,
    metadata: { approve, requestId: id }
  });

  res.json({
    success: true,
    message: `Access request ${newStatus}.`,
    data: { request: accessRequest }
  });
});

/**
 * POST /api/access/:id/revoke
 * Patient revokes a previously granted access.
 *
 * Body: { txHash }
 *   - txHash: on-chain revokeAccess(doctorWallet) tx hash
 *
 * Verifications:
 *   1. Patient owns the request
 *   2. Request is currently granted
 *   3. Receipt valid; signer = patient wallet
 *   4. AccessRevoked event matches
 */
export const revokeAccess = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { txHash } = req.body;

  if (!txHash) throw ApiError.badRequest("txHash is required.");

  const accessRequest = await AccessRequest.findById(id)
    .populate("patient", "walletAddress")
    .populate("doctor", "walletAddress");

  if (!accessRequest) throw ApiError.notFound("Access request not found.");
  if (accessRequest.patient._id.toString() !== req.user._id.toString()) {
    throw ApiError.forbidden("You are not the patient associated with this request.");
  }
  if (accessRequest.status !== "granted") {
    throw ApiError.badRequest(
      `Cannot revoke: request is '${accessRequest.status}', expected 'granted'.`
    );
  }

  if (!req.user.walletAddress) {
    throw ApiError.badRequest("Patient wallet address is not linked.");
  }

  // On-chain verification
  const receipt = await getReceiptOrThrow(txHash);
  await assertTxSignedBy(receipt, req.user.walletAddress);

  const event = findEvent(receipt, "AccessRevoked");
  if (!event) {
    throw ApiError.badRequest(
      "Transaction does not contain an AccessRevoked event from the MediChain contract."
    );
  }

  const eventPatient = (event.args.patient || event.args[0]).toLowerCase();
  const eventDoctor = (event.args.doctor || event.args[1]).toLowerCase();
  const doctorWallet = accessRequest.doctor.walletAddress;

  if (eventPatient !== req.user.walletAddress.toLowerCase()) {
    throw ApiError.badRequest(
      `Event patient address (${eventPatient}) does not match your wallet (${req.user.walletAddress.toLowerCase()}).`
    );
  }
  if (doctorWallet && eventDoctor !== doctorWallet.toLowerCase()) {
    throw ApiError.badRequest(
      `Event doctor address (${eventDoctor}) does not match doctor's wallet (${doctorWallet.toLowerCase()}).`
    );
  }

  // Update request
  accessRequest.status = "revoked";
  accessRequest.revokeTxHash = txHash;
  accessRequest.revokedAt = new Date();
  await accessRequest.save();

  await logAudit({
    actor: req.user._id,
    actorRole: "patient",
    action: "ACCESS_REVOKED",
    patient: req.user._id,
    doctor: accessRequest.doctor._id,
    txHash,
    metadata: { requestId: id }
  });

  res.json({
    success: true,
    message: "Access revoked successfully.",
    data: { request: accessRequest }
  });
});

export default { requestAccess, respondToRequest, revokeAccess };
