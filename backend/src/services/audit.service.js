import { AuditLog } from "../models/AuditLog.js";

/**
 * Log an event to AuditLog
 * @param {Object} params
 * @param {string|ObjectId} params.actor - ID of the user performing the action
 * @param {string} params.actorRole - 'patient' | 'doctor' | 'admin'
 * @param {string} params.action - One of the AUDIT_ACTIONS
 * @param {string|ObjectId} [params.patient] - Optional referenced patient ID
 * @param {string|ObjectId} [params.doctor] - Optional referenced doctor ID
 * @param {string|ObjectId} [params.record] - Optional referenced MedicalRecord ID
 * @param {string} [params.txHash] - Optional blockchain transaction hash
 * @param {Object} [params.metadata] - Optional additional context
 */
export const logAudit = async ({
  actor,
  actorRole,
  action,
  patient,
  doctor,
  record,
  txHash,
  metadata = {}
}) => {
  try {
    const entry = await AuditLog.create({
      actor,
      actorRole,
      action,
      patient,
      doctor,
      record,
      txHash,
      metadata
    });
    return entry;
  } catch (error) {
    console.error("Failed to write audit log entry:", error);
    // Don't crash the main flow if audit logging fails, but log the error
    return null;
  }
};

export default {
  logAudit
};
