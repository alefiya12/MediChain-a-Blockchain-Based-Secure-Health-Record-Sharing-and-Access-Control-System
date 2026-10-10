import { provider, contract } from "../config/blockchain.js";
import { env } from "../config/env.js";
import { ApiError } from "../utils/ApiError.js";

const MAX_RECEIPT_POLL_RETRIES = 6;
const RECEIPT_POLL_INTERVAL_MS = 2500; // 2.5s interval, up to ~15s total
const CONTRACT_ADDRESS = env.CONTRACT_ADDRESS.toLowerCase();

/**
 * Validates a txHash and retrieves the transaction receipt.
 * Waits/polls briefly for recently broadcast transactions.
 * Throws ApiError if:
 * - txHash format is invalid
 * - receipt is not found after polling
 * - status !== 1 (reverted)
 * - receipt.to !== CONTRACT_ADDRESS
 *
 * @param {string} txHash
 * @returns {Promise<ethers.TransactionReceipt>}
 */
export const getReceiptOrThrow = async (txHash) => {
  if (!txHash || typeof txHash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
    throw ApiError.badRequest("Invalid transaction hash format. Expected 0x prefixed 64 hex characters.");
  }

  let receipt = null;
  for (let i = 0; i < MAX_RECEIPT_POLL_RETRIES; i++) {
    try {
      receipt = await provider.getTransactionReceipt(txHash);
      if (receipt) break;
    } catch (err) {
      // Temporary network or RPC glitch: continue retry
    }
    if (i < MAX_RECEIPT_POLL_RETRIES - 1) {
      await new Promise((resolve) => setTimeout(resolve, RECEIPT_POLL_INTERVAL_MS));
    }
  }

  if (!receipt) {
    throw ApiError.badRequest(
      `Transaction ${txHash} not found or not yet confirmed on Polygon Amoy. Please ensure the transaction is mined.`
    );
  }

  if (receipt.status !== 1) {
    throw ApiError.badRequest(
      `Transaction ${txHash} failed or was reverted on-chain (status 0).`
    );
  }

  if (!receipt.to || receipt.to.toLowerCase() !== CONTRACT_ADDRESS) {
    throw ApiError.badRequest(
      `Transaction ${txHash} was sent to ${receipt.to || "null"}, but expected MediChain contract at ${CONTRACT_ADDRESS}.`
    );
  }

  return receipt;
};

/**
 * Parses event logs from a transaction receipt using the MediChain contract interface.
 *
 * @param {ethers.TransactionReceipt} receipt
 * @param {string} eventName
 * @returns {ethers.LogDescription|null}
 */
export const findEvent = (receipt, eventName) => {
  if (!receipt || !Array.isArray(receipt.logs)) return null;

  for (const log of receipt.logs) {
    try {
      const parsed = contract.interface.parseLog({
        topics: [...log.topics],
        data: log.data
      });
      if (parsed && parsed.name === eventName) {
        return parsed;
      }
    } catch {
      // Log not defined in ABI or emitted by a different contract, skip
    }
  }
  return null;
};

/**
 * Checks whether a doctor's wallet address is verified in the smart contract.
 *
 * @param {string} address
 * @returns {Promise<boolean>}
 */
export const isDoctorVerified = async (address) => {
  try {
    return await contract.verifiedDoctors(address);
  } catch (err) {
    throw ApiError.internal(`Chain read failed (verifiedDoctors): ${err.message}`);
  }
};

/**
 * Checks whether a doctor has active access to a patient's records on-chain.
 *
 * @param {string} patientAddress
 * @param {string} doctorAddress
 * @returns {Promise<boolean>}
 */
export const hasAccess = async (patientAddress, doctorAddress) => {
  try {
    return await contract.hasAccess(patientAddress, doctorAddress);
  } catch (err) {
    throw ApiError.internal(`Chain read failed (hasAccess): ${err.message}`);
  }
};

export const hasAccessOnChain = hasAccess;

/**
 * Fetches record details from the smart contract by recordId.
 *
 * @param {string} recordId
 * @returns {Promise<{ fileHash: string, patient: string, timestamp: bigint }>}
 */
export const getRecordOnChain = async (recordId) => {
  try {
    const [fileHash, patient, timestamp] = await contract.getRecord(recordId);
    return { fileHash, patient, timestamp };
  } catch (err) {
    throw ApiError.internal(`Chain read failed (getRecord): ${err.message}`);
  }
};

/**
 * Asserts that a transaction or receipt was signed by expectedAddress.
 * Compares tx.from (lowercased) to expectedAddress (lowercased).
 *
 * @param {ethers.TransactionReceipt|ethers.TransactionResponse|string} receiptOrTxOrHash
 * @param {string} expectedAddress
 */
export const assertTxSignedBy = async (receiptOrTxOrHash, expectedAddress) => {
  if (!expectedAddress) {
    throw ApiError.internal("Expected signer address was not provided for verification.");
  }

  let from = null;

  if (typeof receiptOrTxOrHash === "object" && receiptOrTxOrHash !== null) {
    if (receiptOrTxOrHash.from) {
      from = receiptOrTxOrHash.from;
    }
  }

  if (!from && typeof receiptOrTxOrHash === "string") {
    try {
      const tx = await provider.getTransaction(receiptOrTxOrHash);
      if (tx && tx.from) {
        from = tx.from;
      }
    } catch (err) {
      throw ApiError.badRequest(`Failed to fetch transaction for signer check: ${err.message}`);
    }
  }

  if (!from) {
    throw ApiError.badRequest("Unable to verify transaction signer (sender address missing).");
  }

  if (from.toLowerCase() !== expectedAddress.toLowerCase()) {
    throw ApiError.badRequest(
      `Transaction was signed by ${from.toLowerCase()}, expected signature from ${expectedAddress.toLowerCase()}.`
    );
  }
};

export default {
  getReceiptOrThrow,
  findEvent,
  isDoctorVerified,
  hasAccess,
  hasAccessOnChain,
  getRecordOnChain,
  assertTxSignedBy
};
