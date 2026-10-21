import React, { useState, useEffect, useCallback } from "react";
import api, { getErrorMessage } from "../../api/axios";
import { useWallet } from "../../context/WalletContext";
import { getContract, sendTx } from "../../blockchain/contract";
import StatusBadge from "../../components/StatusBadge";
import TxLink from "../../components/TxLink";
import Loader from "../../components/Loader";
import ConfirmModal from "../../components/ConfirmModal";
import { formatDate, truncateAddress } from "../../utils/format";
import { toast } from "react-toastify";

export default function AccessRequests() {
  const { account, signer, isAmoy } = useWallet();

  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("pending"); // "pending" | "all"

  // Action states
  const [processingId, setProcessingId] = useState(null);
  const [actionType, setActionType] = useState(null); // "grant" | "reject"
  const [waitingForChain, setWaitingForChain] = useState(false);

  // Reject confirmation modal
  const [rejectModal, setRejectModal] = useState({
    show: false,
    request: null
  });

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      const url =
        activeTab === "pending"
          ? "/patient/access-requests?status=pending"
          : "/patient/access-requests";
      const res = await api.get(url);
      if (res.data?.success && Array.isArray(res.data?.data?.requests)) {
        setRequests(res.data.data.requests);
      }
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  // Handle Grant Access
  const handleGrant = async (request) => {
    if (!account) {
      toast.warn("Please connect MetaMask before granting consent.");
      return;
    }
    if (!isAmoy) {
      toast.warn("Please switch MetaMask network to Polygon Amoy.");
      return;
    }

    const doctorWallet = request.doctor?.walletAddress;
    if (!doctorWallet) {
      toast.error("Doctor does not have a linked wallet address.");
      return;
    }

    setProcessingId(request._id);
    setActionType("grant");
    setWaitingForChain(true);

    try {
      const contract = getContract(signer);
      toast.info("Waiting for blockchain confirmation… Please sign respondToRequest in MetaMask.");

      // On-chain call: respondToRequest(doctorWallet, true)
      const { txHash } = await sendTx(() =>
        contract.respondToRequest(doctorWallet, true)
      );

      toast.info("Transaction confirmed on Amoy! Syncing consent status with backend...");

      // Backend call: POST /api/access/:id/respond
      const res = await api.post(`/access/${request._id}/respond`, {
        approve: true,
        txHash
      });

      if (res.data?.success) {
        toast.success(`Access successfully granted to Dr. ${request.doctor?.name}!`);
        fetchRequests();
      }
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setProcessingId(null);
      setActionType(null);
      setWaitingForChain(false);
    }
  };

  // Open Reject confirmation modal
  const promptReject = (request) => {
    setRejectModal({
      show: true,
      request
    });
  };

  // Execute Reject Access
  const handleConfirmReject = async () => {
    const request = rejectModal.request;
    if (!request) return;

    if (!account) {
      toast.warn("Please connect MetaMask before rejecting access.");
      return;
    }
    if (!isAmoy) {
      toast.warn("Please switch MetaMask network to Polygon Amoy.");
      return;
    }

    const doctorWallet = request.doctor?.walletAddress;
    if (!doctorWallet) {
      toast.error("Doctor does not have a linked wallet address.");
      return;
    }

    setRejectModal({ show: false, request: null });
    setProcessingId(request._id);
    setActionType("reject");
    setWaitingForChain(true);

    try {
      const contract = getContract(signer);
      toast.info("Waiting for blockchain confirmation… Please sign reject response in MetaMask.");

      // On-chain call: respondToRequest(doctorWallet, false)
      const { txHash } = await sendTx(() =>
        contract.respondToRequest(doctorWallet, false)
      );

      toast.info("Rejection recorded on Amoy! Updating backend...");

      // Backend call: POST /api/access/:id/respond
      const res = await api.post(`/access/${request._id}/respond`, {
        approve: false,
        txHash
      });

      if (res.data?.success) {
        toast.info(`Access request from Dr. ${request.doctor?.name} was rejected.`);
        fetchRequests();
      }
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setProcessingId(null);
      setActionType(null);
      setWaitingForChain(false);
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="d-flex flex-wrap justify-content-between align-items-center mb-4 gap-3">
        <div>
          <h2 className="fw-bold mb-1">Consent & Access Requests</h2>
          <p className="text-muted mb-0">
            Review incoming record access requests from licensed practitioners
          </p>
        </div>
        <button
          onClick={fetchRequests}
          className="btn btn-outline-secondary btn-sm d-flex align-items-center gap-1"
          disabled={loading || waitingForChain}
        >
          <i className="bi bi-arrow-clockwise"></i>
          <span>Refresh</span>
        </button>
      </div>

      {/* Waiting for Chain Banner */}
      {waitingForChain && (
        <div className="alert alert-info d-flex align-items-center gap-3 mb-4 shadow-sm">
          <span className="spinner-border spinner-border-sm text-primary" role="status" />
          <div>
            <strong>Waiting for blockchain confirmation…</strong> Please confirm the transaction in MetaMask and wait for the Polygon Amoy block receipt.
          </div>
        </div>
      )}

      {/* Tabs */}
      <ul className="nav nav-pills mb-4 bg-white p-2 rounded shadow-sm d-inline-flex border">
        <li className="nav-item">
          <button
            type="button"
            className={`nav-link btn-sm ${activeTab === "pending" ? "active" : ""}`}
            onClick={() => setActiveTab("pending")}
            disabled={waitingForChain}
          >
            <i className="bi bi-clock-history me-1"></i> Pending Requests
          </button>
        </li>
        <li className="nav-item">
          <button
            type="button"
            className={`nav-link btn-sm ${activeTab === "all" ? "active" : ""}`}
            onClick={() => setActiveTab("all")}
            disabled={waitingForChain}
          >
            <i className="bi bi-list-ul me-1"></i> All Request History
          </button>
        </li>
      </ul>

      {/* Content */}
      {loading ? (
        <Loader message="Loading access requests..." />
      ) : requests.length === 0 ? (
        <div className="card p-5 text-center border-0 shadow-sm bg-white">
          <i className="bi bi-inbox display-4 text-muted mb-3 opacity-50"></i>
          <h5 className="fw-bold">No {activeTab === "pending" ? "Pending " : ""}Requests Found</h5>
          <p className="text-muted small mx-auto mb-0" style={{ maxWidth: "420px" }}>
            {activeTab === "pending"
              ? "You do not have any pending doctor consent requests waiting for approval."
              : "No doctor request history recorded on your account yet."}
          </p>
        </div>
      ) : (
        <div className="d-flex flex-column gap-3">
          {requests.map((req) => {
            const isProcessingThis = processingId === req._id;
            const doctor = req.doctor || {};
            const profile = req.doctorProfile || {};

            return (
              <div
                key={req._id}
                className="card border-0 shadow-sm p-4 bg-white position-relative"
                style={{
                  borderLeft:
                    req.status === "pending"
                      ? "4px solid #f59e0b"
                      : req.status === "granted"
                      ? "4px solid #10b981"
                      : "4px solid #94a3b8"
                }}
              >
                <div className="row align-items-center g-3">
                  {/* Doctor Info */}
                  <div className="col-lg-5">
                    <div className="d-flex align-items-start gap-3">
                      <div className="p-3 rounded-circle bg-primary-subtle text-primary">
                        <i className="bi bi-person-badge fs-4"></i>
                      </div>
                      <div>
                        <div className="d-flex align-items-center gap-2 mb-1">
                          <h5 className="fw-bold mb-0 text-dark">Dr. {doctor.name || "Doctor"}</h5>
                          <StatusBadge status={req.status} />
                        </div>
                        <div className="text-muted small mb-1">
                          <strong>{profile.specialization || "General Medicine"}</strong>
                          {profile.hospital && ` · ${profile.hospital}`}
                        </div>
                        <div className="text-muted small font-monospace">
                          <i className="bi bi-wallet2 me-1"></i>
                          {truncateAddress(doctor.walletAddress || "")}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Reason & Meta */}
                  <div className="col-lg-4 border-start-md ps-lg-4">
                    <div className="mb-2">
                      <span className="text-muted small fw-semibold d-block">Requested Reason:</span>
                      <p className="mb-0 text-dark small bg-light p-2 rounded border">
                        {req.reason || "Clinical assessment and consultation."}
                      </p>
                    </div>
                    <div className="d-flex flex-wrap align-items-center gap-3 text-muted" style={{ fontSize: "0.78rem" }}>
                      <span>
                        <i className="bi bi-calendar3 me-1"></i>
                        {formatDate(req.createdAt)}
                      </span>
                      {req.requestTxHash && (
                        <span>
                          Tx: <TxLink txHash={req.requestTxHash} />
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="col-lg-3 text-lg-end">
                    {req.status === "pending" ? (
                      <div className="d-flex flex-lg-column justify-content-lg-end gap-2">
                        <button
                          type="button"
                          onClick={() => handleGrant(req)}
                          className="btn btn-success btn-sm d-flex align-items-center justify-content-center gap-1 shadow-sm"
                          disabled={waitingForChain}
                        >
                          {isProcessingThis && actionType === "grant" ? (
                            <>
                              <span className="spinner-border spinner-border-sm" role="status" />
                              <span>Granting...</span>
                            </>
                          ) : (
                            <>
                              <i className="bi bi-check-circle"></i>
                              <span>Grant Access</span>
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => promptReject(req)}
                          className="btn btn-outline-danger btn-sm d-flex align-items-center justify-content-center gap-1"
                          disabled={waitingForChain}
                        >
                          {isProcessingThis && actionType === "reject" ? (
                            <>
                              <span className="spinner-border spinner-border-sm" role="status" />
                              <span>Rejecting...</span>
                            </>
                          ) : (
                            <>
                              <i className="bi bi-x-circle"></i>
                              <span>Reject</span>
                            </>
                          )}
                        </button>
                      </div>
                    ) : (
                      <div className="text-muted small">
                        <span>Responded: {formatDate(req.respondedAt || req.updatedAt)}</span>
                        {req.responseTxHash && (
                          <div className="mt-1">
                            Response Tx: <TxLink txHash={req.responseTxHash} />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Reject Confirmation Modal */}
      <ConfirmModal
        show={rejectModal.show}
        title="Reject Doctor Access Request"
        message={`Are you sure you want to reject Dr. ${
          rejectModal.request?.doctor?.name || ""
        }'s access request? This response will be anchored on Polygon Amoy.`}
        confirmText="Confirm Rejection"
        confirmVariant="danger"
        cancelText="Cancel"
        onConfirm={handleConfirmReject}
        onClose={() => setRejectModal({ show: false, request: null })}
      />
    </div>
  );
}
