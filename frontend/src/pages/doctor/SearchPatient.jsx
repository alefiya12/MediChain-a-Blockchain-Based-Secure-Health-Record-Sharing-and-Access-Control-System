import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api, { getErrorMessage } from "../../api/axios";
import { useWallet } from "../../context/WalletContext";
import { getContract, sendTx } from "../../blockchain/contract";
import TxLink from "../../components/TxLink";
import { truncateAddress } from "../../utils/format";
import { toast } from "react-toastify";

export default function SearchPatient() {
  const { account, signer, isAmoy } = useWallet();
  const navigate = useNavigate();

  const [patientIdInput, setPatientIdInput] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [patientResult, setPatientResult] = useState(null);
  const [searchError, setSearchError] = useState("");

  // Request access form
  const [reason, setReason] = useState("");
  const [requestLoading, setRequestLoading] = useState(false);
  const [requestSuccess, setRequestSuccess] = useState(null);

  // Search patient by ID
  const handleSearch = async (e) => {
    e.preventDefault();
    const query = patientIdInput.trim().toUpperCase();

    if (!query) {
      setSearchError("Please enter a patient identifier.");
      return;
    }

    setSearchLoading(true);
    setSearchError("");
    setPatientResult(null);
    setRequestSuccess(null);

    try {
      const res = await api.get(`/doctor/patients/search?patientId=${encodeURIComponent(query)}`);
      if (res.data?.success && res.data?.data?.patient) {
        setPatientResult(res.data.data.patient);
      } else {
        setSearchError("No patient found with this identifier.");
      }
    } catch (err) {
      setSearchError(getErrorMessage(err));
    } finally {
      setSearchLoading(false);
    }
  };

  // Submit on-chain access request
  const handleRequestAccess = async (e) => {
    e.preventDefault();
    if (!reason.trim()) {
      toast.warn("Please enter a clinical reason for requesting access.");
      return;
    }

    if (!account) {
      toast.warn("Please connect your MetaMask wallet first.");
      return;
    }

    if (!isAmoy) {
      toast.warn("Please switch your MetaMask network to Polygon Amoy.");
      return;
    }

    if (!patientResult?.walletAddress) {
      toast.error("This patient does not have a registered wallet address.");
      return;
    }

    setRequestLoading(true);
    try {
      const contract = getContract(signer);
      const patientWallet = patientResult.walletAddress;

      toast.info("Please confirm the access request in MetaMask...", { autoClose: 4000 });

      // Call contract.requestAccess(patientWallet) on Polygon Amoy
      const { txHash } = await sendTx(() => contract.requestAccess(patientWallet));

      toast.info("Transaction confirmed on Polygon Amoy! Logging request with backend...");

      // Call backend POST /api/access/request
      const res = await api.post("/access/request", {
        patientId: patientResult.patientId,
        reason: reason.trim(),
        txHash
      });

      if (res.data?.success) {
        setRequestSuccess({
          txHash,
          request: res.data.data?.request
        });
        toast.success("Access request submitted successfully!");
      }
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setRequestLoading(false);
    }
  };

  return (
    <div>
      {/* Title */}
      <div className="mb-4">
        <h2 className="fw-bold mb-1">Search Patient Identifier</h2>
        <p className="text-muted mb-0">
          Lookup patients using their unique <code className="text-primary">MC-P-XXXXXX</code> identifier to request consent
        </p>
      </div>

      {/* Search Input Card */}
      <div className="card p-4 border-0 shadow-sm mb-4" style={{ maxWidth: "700px" }}>
        <form onSubmit={handleSearch}>
          <label className="form-label fw-semibold small text-uppercase text-muted">
            Patient ID (MC-P-XXXXXX)
          </label>
          <div className="input-group">
            <span className="input-group-text bg-white">
              <i className="bi bi-search text-muted"></i>
            </span>
            <input
              type="text"
              className="form-control font-monospace text-uppercase"
              placeholder="e.g. MC-P-ALICE6"
              value={patientIdInput}
              onChange={(e) => setPatientIdInput(e.target.value.toUpperCase())}
              required
              id="patient-id-search-input"
            />
            <button
              type="submit"
              className="btn btn-primary-gradient px-4 d-flex align-items-center gap-2"
              disabled={searchLoading}
              id="patient-search-btn"
            >
              {searchLoading && <span className="spinner-border spinner-border-sm" role="status"></span>}
              <span>{searchLoading ? "Searching..." : "Search"}</span>
            </button>
          </div>
          <span className="text-muted" style={{ fontSize: "0.75rem" }}>
            For privacy, only exact matches are returned. No clinical records are exposed during search.
          </span>
        </form>

        {searchError && (
          <div className="alert alert-danger py-2 px-3 small d-flex align-items-center gap-2 mt-3 mb-0" role="alert">
            <i className="bi bi-exclamation-triangle-fill"></i>
            <span>{searchError}</span>
          </div>
        )}
      </div>

      {/* Patient Result Card */}
      {patientResult && (
        <div className="card border-0 shadow-sm p-4 mb-4" style={{ maxWidth: "700px" }}>
          <div className="d-flex justify-content-between align-items-center border-bottom pb-3 mb-3">
            <div className="d-flex align-items-center gap-3">
              <div
                className="d-flex align-items-center justify-content-center rounded-circle bg-primary-subtle text-primary"
                style={{ width: "48px", height: "48px" }}
              >
                <i className="bi bi-person-fill fs-4"></i>
              </div>
              <div>
                <h5 className="fw-bold mb-0 text-dark">{patientResult.name}</h5>
                <span className="font-monospace text-primary small fw-semibold">
                  {patientResult.patientId}
                </span>
              </div>
            </div>
            <span className="badge bg-success-subtle text-success border border-success-subtle">
              <i className="bi bi-shield-check me-1"></i> Patient Found
            </span>
          </div>

          <div className="row g-2 mb-4 small text-secondary">
            <div className="col-sm-4 text-muted">Wallet Address:</div>
            <div className="col-sm-8 font-monospace text-dark text-break">
              {patientResult.walletAddress ? (
                <span>{patientResult.walletAddress}</span>
              ) : (
                <span className="text-danger">No wallet linked (cannot receive on-chain requests)</span>
              )}
            </div>
          </div>

          {/* Request Form */}
          {!requestSuccess ? (
            <div className="p-3 bg-light rounded-3 border">
              <h6 className="fw-bold mb-2 text-dark">
                <i className="bi bi-send-fill text-primary me-2"></i>
                Request Access to Medical Records
              </h6>
              <p className="text-muted small mb-3">
                This transaction calls <code>MediChain.requestAccess</code> on Polygon Amoy. The patient will be notified to grant consent.
              </p>

              <form onSubmit={handleRequestAccess}>
                <div className="mb-3">
                  <label className="form-label small fw-semibold">Reason for Access Request *</label>
                  <textarea
                    className="form-control"
                    rows="3"
                    placeholder="e.g. Cardiology consultation and diagnostic review"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    required
                    id="request-reason-input"
                  />
                </div>

                <div className="d-flex justify-content-end gap-2">
                  <button
                    type="submit"
                    className="btn btn-primary-gradient d-flex align-items-center gap-2"
                    disabled={requestLoading || !patientResult.walletAddress}
                    id="submit-request-access-btn"
                  >
                    {requestLoading && <span className="spinner-border spinner-border-sm" role="status"></span>}
                    <span>{requestLoading ? "Confirming on Polygon Amoy..." : "Submit On-Chain Request"}</span>
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <div className="alert alert-success border-success d-flex flex-column gap-2 p-3 mb-0" role="alert">
              <div className="d-flex align-items-center gap-2 fw-bold text-success">
                <i className="bi bi-check-circle-fill fs-5"></i>
                <span>Access Request Successfully Submitted & Anchored!</span>
              </div>
              <p className="mb-1 small">
                Your request is now pending patient review. Once approved, the patient's records will be visible under Authorized Records.
              </p>
              <div className="small">
                <strong>Transaction Hash:</strong> <TxLink txHash={requestSuccess.txHash} truncate={false} />
              </div>
              <div className="mt-2">
                <Link to="/doctor/requests" className="btn btn-sm btn-outline-success">
                  View My Requests <i className="bi bi-arrow-right ms-1"></i>
                </Link>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
