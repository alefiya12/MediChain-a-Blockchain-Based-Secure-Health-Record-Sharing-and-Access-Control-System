import { AuditLog } from "../models/AuditLog.js";
import { provider, contract } from "../config/blockchain.js";
import { asyncHandler } from "../utils/asyncHandler.js";

/**
 * GET /api/audit
 * Role-scoped paginated logs:
 * - patient -> own (patient == req.user._id OR actor == req.user._id)
 * - doctor -> own actions (actor == req.user._id OR doctor == req.user._id)
 * - admin -> all
 * Supports ?action=&page=&limit=
 */
export const getAuditLogs = asyncHandler(async (req, res) => {
  const { action, page = 1, limit = 20 } = req.query;
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (pageNum - 1) * limitNum;

  const query = {};

  // Action filter
  if (action) {
    query.action = action;
  }

  // Role scoping
  if (req.user.role === "patient") {
    query.$or = [{ patient: req.user._id }, { actor: req.user._id }];
  } else if (req.user.role === "doctor") {
    query.$or = [{ doctor: req.user._id }, { actor: req.user._id }];
  }
  // admin gets all (no query.$or filter)

  const [logs, total] = await Promise.all([
    AuditLog.find(query)
      .populate("actor", "name email role walletAddress")
      .populate("patient", "name email patientId walletAddress")
      .populate("doctor", "name email walletAddress")
      .populate("record", "title category originalName chainStatus fileHash")
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(limitNum),
    AuditLog.countDocuments(query)
  ]);

  res.json({
    success: true,
    data: {
      logs,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      }
    }
  });
});

/**
 * GET /api/audit/on-chain
 * Queries on-chain events from the MediChain smart contract for the authenticated user:
 * - patient: RecordRegistered, AccessGranted, AccessRevoked, AccessRequested for patient
 * - doctor: DoctorVerified, AccessRequested, AccessGranted, AccessRevoked for doctor
 * - admin: recent platform events (DoctorVerified, RecordRegistered, AccessGranted, AccessRevoked)
 */
export const getOnChainEvents = asyncHandler(async (req, res) => {
  const user = req.user;
  const userWallet = user.walletAddress ? user.walletAddress.toLowerCase() : null;

  try {
    const currentBlock = await provider.getBlockNumber();
    // Polygon Amoy RPCs limit eth_getLogs to ~10,000 blocks per request
    const fromBlock = Math.max(0, currentBlock - 9990);

    const eventList = [];

    if (user.role === "patient" && userWallet) {
      const [records, granted, revoked, requested] = await Promise.all([
        contract.queryFilter(contract.filters.RecordRegistered(null, userWallet), fromBlock, currentBlock).catch(() => []),
        contract.queryFilter(contract.filters.AccessGranted(userWallet, null), fromBlock, currentBlock).catch(() => []),
        contract.queryFilter(contract.filters.AccessRevoked(userWallet, null), fromBlock, currentBlock).catch(() => []),
        contract.queryFilter(contract.filters.AccessRequested(userWallet, null), fromBlock, currentBlock).catch(() => [])
      ]);
      eventList.push(...records, ...granted, ...revoked, ...requested);
    } else if (user.role === "doctor" && userWallet) {
      const [verified, requested, granted, revoked] = await Promise.all([
        contract.queryFilter(contract.filters.DoctorVerified(userWallet, null), fromBlock, currentBlock).catch(() => []),
        contract.queryFilter(contract.filters.AccessRequested(null, userWallet), fromBlock, currentBlock).catch(() => []),
        contract.queryFilter(contract.filters.AccessGranted(null, userWallet), fromBlock, currentBlock).catch(() => []),
        contract.queryFilter(contract.filters.AccessRevoked(null, userWallet), fromBlock, currentBlock).catch(() => [])
      ]);
      eventList.push(...verified, ...requested, ...granted, ...revoked);
    } else if (user.role === "admin") {
      const [docVer, docRej, recReg, accGrant, accRev] = await Promise.all([
        contract.queryFilter(contract.filters.DoctorVerified(), fromBlock, currentBlock).catch(() => []),
        contract.queryFilter(contract.filters.DoctorRejected(), fromBlock, currentBlock).catch(() => []),
        contract.queryFilter(contract.filters.RecordRegistered(), fromBlock, currentBlock).catch(() => []),
        contract.queryFilter(contract.filters.AccessGranted(), fromBlock, currentBlock).catch(() => []),
        contract.queryFilter(contract.filters.AccessRevoked(), fromBlock, currentBlock).catch(() => [])
      ]);
      eventList.push(...docVer, ...docRej, ...recReg, ...accGrant, ...accRev);
    }

    const formatted = eventList.map((evt) => {
      const argsObj = {};
      if (evt.args) {
        for (const [key, val] of Object.entries(evt.args)) {
          if (isNaN(key)) {
            argsObj[key] = typeof val === "bigint" ? val.toString() : val;
          }
        }
      }
      return {
        eventName: evt.fragment?.name || evt.eventName || "ContractEvent",
        txHash: evt.transactionHash,
        blockNumber: evt.blockNumber,
        args: argsObj
      };
    });

    formatted.sort((a, b) => b.blockNumber - a.blockNumber);

    res.json({
      success: true,
      data: {
        events: formatted,
        fromBlock,
        toBlock: currentBlock
      }
    });
  } catch (err) {
    res.json({
      success: true,
      data: {
        events: [],
        notice: "On-chain logs retrieval temporarily unavailable from RPC"
      }
    });
  }
});

export default {
  getAuditLogs,
  getOnChainEvents
};
