import { ethers } from "ethers";
import mediChainArtifact from "./MediChain.json" with { type: "json" };
import { toast } from "react-toastify";

export const CONTRACT_ADDRESS =
  import.meta.env?.VITE_CONTRACT_ADDRESS ||
  (typeof process !== "undefined" && process.env?.VITE_CONTRACT_ADDRESS) ||
  mediChainArtifact.address;

export const CONTRACT_ABI = mediChainArtifact.abi;

/**
 * Returns an ethers Contract instance connected to the given signer or provider.
 */
export function getContract(signerOrProvider) {
  if (!CONTRACT_ADDRESS) {
    throw new Error("Contract address is not configured.");
  }
  return new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signerOrProvider);
}

/**
 * Executes a transaction promise function, awaits confirmation,
 * and maps MetaMask / blockchain errors into user-friendly messages.
 *
 * @param {Function} txPromiseFn - Function returning an ethers TransactionResponse
 * @returns {Promise<{ txHash: string, receipt: ethers.TransactionReceipt }>}
 */
export async function sendTx(txPromiseFn) {
  try {
    const tx = await txPromiseFn();
    const receipt = await tx.wait(1);
    return {
      txHash: tx.hash || receipt.hash,
      receipt
    };
  } catch (error) {
    const errorMsg = parseContractError(error);
    toast.error(errorMsg);
    throw new Error(errorMsg);
  }
}

/**
 * Helper to map common ethers / MetaMask errors to human-friendly strings
 */
export function parseContractError(error) {
  if (!error) return "Transaction failed.";

  // User rejected transaction in MetaMask
  if (
    error.code === 4001 ||
    error.code === "ACTION_REJECTED" ||
    error.message?.includes("user rejected") ||
    error.message?.includes("User denied transaction")
  ) {
    return "Transaction was cancelled / rejected by the user.";
  }

  // Insufficient funds for gas
  if (
    error.code === "INSUFFICIENT_FUNDS" ||
    error.message?.toLowerCase().includes("insufficient funds")
  ) {
    return "Insufficient POL tokens for transaction gas. Please get test POL from the Polygon Amoy faucet.";
  }

  // Network / RPC connection error
  if (
    error.message?.includes("could not coalesce error") ||
    error.shortMessage?.includes("could not coalesce error") ||
    error.message?.includes("failed to fetch") ||
    error.message?.includes("network error") ||
    error.code === "NETWORK_ERROR"
  ) {
    return "MetaMask cannot connect to the Polygon Amoy network (RPC unreachable). Please update your Amoy RPC URL in MetaMask to https://polygon-amoy-bor-rpc.publicnode.com";
  }

  // Smart contract revert reason
  if (error.reason) {
    return `Blockchain error: ${error.reason}`;
  }
  if (error.data?.message) {
    return `Blockchain error: ${error.data.message}`;
  }
  if (error.shortMessage) {
    return error.shortMessage;
  }

  return error.message || "Blockchain transaction failed.";
}
