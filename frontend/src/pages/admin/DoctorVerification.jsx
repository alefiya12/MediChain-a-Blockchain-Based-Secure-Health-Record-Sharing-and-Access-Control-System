import React, { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import api, { getErrorMessage } from "../../api/axios";
import { useWallet } from "../../context/WalletContext";
import { getContract, sendTx } from "../../blockchain/contract";
import StatusBadge from "../../components/StatusBadge";
import TxLink from "../../components/TxLink";
import Loader from "../../components/Loader";
import ConfirmModal from "../../components/ConfirmModal";
import { truncateAddress } from "../../utils/format";
import { toast } from "react-toastify";

export default function DoctorVerification() {
  const { account, signer, isAmoy } = useWallet();
  const [searchParams, setSearchParams] = useSearchParams();

  const currentTab = searchParams.get("status") || "pending";

  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [contractOwner, setContractOwner] = useState(null);

  // Rejection modal state
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectDoctorTarget, setRejectDoctorTarget] = useState(null);
  const [rejectionReason, setRejectionReason] = useState("");

  // Approval confirmation modal state
  const [approveModalOpen, setApproveModalOpen] = useState(false);
  const [approveDoctorTarget, setApproveDoctorTarget] = useState(null);

  // Fetch doctors list
  const fetchDoctors = useCallback(async (status) => {
    setLoading(true);
    try {
      const url = status && status !== "all" ? `/admin/doctors?status=${status}` : "/admin/doctors";
      const res = await api.get(url);
      if (res.data?.success && res.data?.data?.doctors) {
        setDoctors(res.data.data.doctors);
      }
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch contract owner
  useEffect(() => {
    if (signer) {
      try {
        const contract = getContract(signer);
        contract.owner().then((owner) => setContractOwner(owner)).catch(() => {});
      } catch {}
    }
  }, [signer]);

  useEffect(() => {
    fetchDoctors(currentTab);
  }, [fetchDoctors, currentTab]);

  const handleTabChange = (status) => {
    setSearchParams(status === "pending" ? {} : { status });
  };

  const isContractOwner = Boolean(
    account && contractOwner && account.toLowerCase() === contractOwner.toLowerCase()
  );

  // Initiate Doctor Approval
  const promptApprove = (doctor) => {
    if (!account) {
      toast.warn("Please connect your MetaMask wallet before approving doctors.");
      return;
    }
    if (!isAmoy) {
      toast.warn("Please switch MetaMask to the Polygon Amoy network (chainId 80002).");
      return;
    }
    if (!doctor.user?.walletAddress) {
      toast.error("This doctor does not have a wallet address linked.");
      return;
    }
    setApproveDoctorTarget(doctor);
    setApproveModalOpen(true);
  };

  // Execute on-chain verifyDoctor and call backend /approve
  const executeApprove = async () => {
    if (!approveDoctorTarget || !signer) return;

    setActionLoading(true);
    try {
      const contract = getContract(signer);
      const doctorWallet = approveDoctorTarget.user.walletAddress;

      toast.info("Please confirm the transaction in MetaMask...", { autoClose: 4000 });

      // Execute on-chain verifyDoctor(doctorWallet)
      const { txHash } = await sendTx(() => contract.verifyDoctor(doctorWallet));

      toast.info(`Transaction submitted: ${txHash.slice(0, 10)}... Confirming with backend...`);

      // Confirm with backend API
      const res = await api.post(`/admin/doctors/${approveDoctorTarget._id}/approve`, { txHash });

      if (res.data?.success) {
        toast.success(`Dr. ${approveDoctorTarget.user.name} approved and verified on-chain!`);
        setApproveModalOpen(false);
        setApproveDoctorTarget(null);
        fetchDoctors(currentTab);
      }
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setActionLoading(false);
    }
  };

  // Initiate Doctor Rejection
  const promptReject = (doctor) => {
    setRejectDoctorTarget(doctor);
    setRejectionReason("");
    setRejectModalOpen(true);
  };

  // Execute Rejection via backend /reject
  const executeReject = async () => {
    if (!rejectDoctorTarget) return;
    if (!rejectionReason.trim()) {
      toast.warn("Please provide a rejection reason.");
      return;
    }

    setActionLoading(true);
    try {
      const res = await api.post(`/admin/doctors/${rejectDoctorTarget._id}/reject`, {
        reason: rejectionReason.trim()
      });

      if (res.data?.success) {
        toast.success(`Dr. ${rejectDoctorTarget.user.name} was rejected.`);
        setRejectModalOpen(false);
        setRejectDoctorTarget(null);
        fetchDoctors(currentTab);
      }
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div>
      {/* Title */}
      <div className="d-flex flex-wrap justify-content-between align-items-center mb-4 gap-3">
        <div>
          <h2 className="fw-bold mb-1">Doctor Verification Center</h2>
          <p className="text-muted mb-0">Review pending practitioners and authorize them on the Polygon Amoy blockchain</p>
        </div>
        <button onClick={() => fetchDoctors(currentTab)} className="btn btn-outline-secondary btn-sm d-flex align-items-center gap-1">
          <i className="bi bi-arrow-clockwise"></i>
          <span>Refresh List</span>
        </button>
      </div>

      {/* Contract Owner Warning */}
      {contractOwner && account && !isContractOwner && (
        <div className="alert alert-warning border-warning d-flex align-items-center gap-3 mb-4 shadow-sm" role="alert">
          <i className="bi bi-shield-exclamation fs-3 text-warning"></i>
          <div>
            <strong>Wallet Non-Owner Warning</strong>
            <p className="mb-0 small">
              Connected: <code className="text-dark">{truncateAddress(account)}</code>. Smart contract owner is{" "}
              <code className="text-dark">{truncateAddress(contractOwner)}</code>. On-chain approvals require the owner wallet.
            </p>
          </div>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="d-flex border-bottom mb-4">
        {[
          { key: "pending", label: "Pending Approvals", icon: "bi-clock-history" },
          { key: "approved", label: "Approved Doctors", icon: "bi-check2-circle" },
          { key: "rejected", label: "Rejected", icon: "bi-x-circle" },
          { key: "all", label: "All Practitioners", icon: "bi-list-ul" }
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`btn btn-link text-decoration-none px-3 py-2 border-bottom border-2 rounded-0 fw-semibold d-flex align-items-center gap-2 ${
              currentTab === tab.key ? "border-primary text-primary" : "border-transparent text-muted"
            }`}
            onClick={() => handleTabChange(tab.key)}
          >
            <i className={`bi ${tab.icon}`}></i>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Table Container */}
      <div className="card border-0 shadow-sm p-4">
        {loading ? (
          <Loader message="Loading practitioners..." />
        ) : doctors.length === 0 ? (
          <div className="text-center py-5 text-muted">
            <i className="bi bi-inbox fs-1 d-block mb-2 opacity-50"></i>
            <h6>No doctors found in "{currentTab}" status</h6>
            <p className="small text-muted mb-0">Newly registered practitioners will appear here for verification.</p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="table-modern">
              <thead>
                <tr>
                  <th>Doctor</th>
                  <th>License / Specialization</th>
                  <th>Hospital</th>
                  <th>Wallet Address</th>
                  <th>Status</th>
                  <th>Tx Hash</th>
                  <th className="text-end">Actions</th>
                </tr>
              </thead>
              <tbody>
                {doctors.map((doc) => (
                  <tr key={doc._id}>
                    <td>
                      <div className="fw-semibold text-dark">{doc.user?.name || "Unknown"}</div>
                      <div className="text-muted small">{doc.user?.email}</div>
                    </td>
                    <td>
                      <div className="font-monospace small fw-semibold text-primary">{doc.licenseNumber}</div>
                      <span className="badge bg-light text-secondary border">{doc.specialization}</span>
                    </td>
                    <td>
                      <span className="small text-dark">{doc.hospital}</span>
                      <div className="text-muted" style={{ fontSize: "0.75rem" }}>
                        {doc.experienceYears ? `${doc.experienceYears} yrs experience` : "N/A"}
                      </div>
                    </td>
                    <td>
                      {doc.user?.walletAddress ? (
                        <span className="font-monospace small text-dark" title={doc.user.walletAddress}>
                          {truncateAddress(doc.user.walletAddress, 6, 4)}
                        </span>
                      ) : (
                        <span className="badge bg-danger-subtle text-danger">No Wallet</span>
                      )}
                    </td>
                    <td>
                      <StatusBadge status={doc.status} />
                    </td>
                    <td>
                      {doc.verifyTxHash ? (
                        <TxLink txHash={doc.verifyTxHash} />
                      ) : (
                        <span className="text-muted small">—</span>
                      )}
                    </td>
                    <td className="text-end">
                      {doc.status === "pending" && (
                        <div className="btn-group btn-group-sm">
                          <button
                            onClick={() => promptApprove(doc)}
                            className="btn btn-success d-flex align-items-center gap-1"
                            title="Approve doctor on-chain"
                          >
                            <i className="bi bi-check-lg"></i>
                            <span>Approve</span>
                          </button>
                          <button
                            onClick={() => promptReject(doc)}
                            className="btn btn-outline-danger d-flex align-items-center gap-1"
                            title="Reject doctor"
                          >
                            <i className="bi bi-x-lg"></i>
                            <span>Reject</span>
                          </button>
                        </div>
                      )}
                      {doc.status === "approved" && (
                        <span className="text-success small fw-semibold">
                          <i className="bi bi-patch-check-fill me-1"></i> Verified
                        </span>
                      )}
                      {doc.status === "rejected" && (
                        <span className="text-danger small" title={doc.rejectionReason}>
                          {doc.rejectionReason ? `Reason: ${doc.rejectionReason.slice(0, 20)}...` : "Rejected"}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Approve Confirmation Modal */}
      <ConfirmModal
        show={approveModalOpen}
        title="Approve Doctor on Polygon Amoy"
        message={
          approveDoctorTarget ? (
            <div>
              <p>
                You are about to verify <strong>{approveDoctorTarget.user?.name}</strong> (License:{" "}
                <code>{approveDoctorTarget.licenseNumber}</code>).
              </p>
              <div className="p-3 rounded-2 bg-light border mb-2 font-monospace small">
                Wallet: {approveDoctorTarget.user?.walletAddress}
              </div>
              <p className="text-muted small mb-0">
                This triggers an on-chain transaction calling <code>MediChain.verifyDoctor</code> on Polygon Amoy. You will be prompted to sign with MetaMask.
              </p>
            </div>
          ) : ""
        }
        confirmText="Confirm On-Chain Verification"
        confirmVariant="success"
        isLoading={actionLoading}
        onConfirm={executeApprove}
        onClose={() => setApproveModalOpen(false)}
      />

      {/* Reject Modal with Reason Input */}
      {rejectModalOpen && (
        <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title fw-bold">Reject Doctor Application</h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => setRejectModalOpen(false)}
                  disabled={actionLoading}
                ></button>
              </div>
              <div className="modal-body">
                <p className="text-secondary small">
                  Rejecting <strong>{rejectDoctorTarget?.user?.name}</strong>. Please provide a clear reason for the rejection:
                </p>
                <textarea
                  className="form-control"
                  rows="3"
                  placeholder="e.g. License number could not be validated with state medical board."
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={() => setRejectModalOpen(false)}
                  disabled={actionLoading}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-danger d-flex align-items-center gap-2"
                  onClick={executeReject}
                  disabled={actionLoading}
                >
                  {actionLoading && <span className="spinner-border spinner-border-sm" role="status"></span>}
                  <span>Confirm Rejection</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
