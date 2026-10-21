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

export default function GrantedAccess() {
  const { account, signer, isAmoy } = useWallet();

  const [grants, setGrants] = useState([]);
  const [loading, setLoading] = useState(true);

  // Revocation state
  const [waitingForChain, setWaitingForChain] = useState(false);
  const [revokingId, setRevokingId] = useState(null);

  // Confirm Modal state
  const [revokeModal, setRevokeModal] = useState({
    show: false,
    grant: null
  });

  const fetchGrantedAccess = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/patient/granted");
      if (res.data?.success && Array.isArray(res.data?.data?.grants)) {
        setGrants(res.data.data.grants);
      }
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGrantedAccess();
  }, [fetchGrantedAccess]);

  // Prompt revocation modal
  const promptRevoke = (grant) => {
    setRevokeModal({
      show: true,
      grant
    });
  };

  // Execute on-chain revocation
  const handleConfirmRevoke = async () => {
    const grant = revokeModal.grant;
    if (!grant) return;

    if (!account) {
      toast.warn("Please connect MetaMask before revoking access.");
      return;
    }
    if (!isAmoy) {
      toast.warn("Please switch MetaMask network to Polygon Amoy.");
      return;
    }

    const doctorWallet = grant.doctor?.walletAddress;
    if (!doctorWallet) {
      toast.error("Doctor does not have a linked wallet address.");
      return;
    }

    setRevokeModal({ show: false, grant: null });
    setRevokingId(grant._id);
    setWaitingForChain(true);

    try {
      const contract = getContract(signer);
      toast.info("Waiting for blockchain confirmation… Please sign revokeAccess in MetaMask.");

      // On-chain call: revokeAccess(doctorWallet)
      const { txHash } = await sendTx(() =>
        contract.revokeAccess(doctorWallet)
      );

      toast.info("Revocation confirmed on Polygon Amoy! Updating backend access state...");

      // Backend call: POST /api/access/:id/revoke
      const res = await api.post(`/access/${grant._id}/revoke`, { txHash });

      if (res.data?.success) {
        toast.success(`Access for Dr. ${grant.doctor?.name || "Doctor"} has been revoked.`);
        fetchGrantedAccess();
      }
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setRevokingId(null);
      setWaitingForChain(false);
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="d-flex flex-wrap justify-content-between align-items-center mb-4 gap-3">
        <div>
          <h2 className="fw-bold mb-1">Authorized Doctors</h2>
          <p className="text-muted mb-0">
            Healthcare practitioners currently granted access to view and download your health records
          </p>
        </div>
        <button
          onClick={fetchGrantedAccess}
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
            <strong>Waiting for blockchain confirmation…</strong> Please confirm the revoke transaction in MetaMask and wait for the Polygon Amoy block receipt.
          </div>
        </div>
      )}

      {/* Main Content */}
      {loading ? (
        <Loader message="Loading authorized practitioners..." />
      ) : grants.length === 0 ? (
        <div className="card p-5 text-center border-0 shadow-sm bg-white">
          <i className="bi bi-person-check display-4 text-muted mb-3 opacity-50"></i>
          <h5 className="fw-bold">No Active Doctor Authorizations</h5>
          <p className="text-muted small mx-auto mb-0" style={{ maxWidth: "440px" }}>
            You do not currently have any active doctor permissions. When you approve access requests, authorized practitioners will be listed here with instant revocation controls.
          </p>
        </div>
      ) : (
        <div className="d-flex flex-column gap-3">
          {grants.map((grant) => {
            const isRevokingThis = revokingId === grant._id;
            const doctor = grant.doctor || {};
            const profile = grant.doctorProfile || {};

            return (
              <div
                key={grant._id}
                className="card border-0 shadow-sm p-4 bg-white"
                style={{ borderLeft: "5px solid #10b981" }}
              >
                <div className="row align-items-center g-3">
                  {/* Doctor Profile Info */}
                  <div className="col-lg-5">
                    <div className="d-flex align-items-start gap-3">
                      <div className="p-3 rounded-circle bg-success-subtle text-success">
                        <i className="bi bi-shield-check fs-4"></i>
                      </div>
                      <div>
                        <div className="d-flex align-items-center gap-2 mb-1">
                          <h5 className="fw-bold mb-0 text-dark">Dr. {doctor.name}</h5>
                          <span className="badge bg-success-subtle text-success border border-success-subtle">
                            <i className="bi bi-check2 me-1"></i>Active Access
                          </span>
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

                  {/* Granted Meta & Tx Hashes */}
                  <div className="col-lg-4 border-start-md ps-lg-4">
                    <div className="mb-2">
                      <span className="text-muted small fw-semibold d-block">Access Purpose:</span>
                      <p className="mb-0 text-dark small bg-light p-2 rounded border">
                        {grant.reason || "Patient health review and consultation."}
                      </p>
                    </div>
                    <div className="d-flex flex-column gap-1 text-muted" style={{ fontSize: "0.78rem" }}>
                      <span>
                        <i className="bi bi-calendar-check me-1"></i>
                        Granted: {formatDate(grant.respondedAt || grant.updatedAt)}
                      </span>
                      {grant.responseTxHash && (
                        <span>
                          Grant Tx: <TxLink txHash={grant.responseTxHash} />
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Revoke Action */}
                  <div className="col-lg-3 text-lg-end">
                    <button
                      type="button"
                      onClick={() => promptRevoke(grant)}
                      className="btn btn-danger btn-sm d-inline-flex align-items-center gap-1 shadow-sm px-3"
                      disabled={waitingForChain}
                      title="Revoke access on Polygon Amoy smart contract"
                    >
                      {isRevokingThis ? (
                        <>
                          <span className="spinner-border spinner-border-sm" role="status" />
                          <span>Revoking...</span>
                        </>
                      ) : (
                        <>
                          <i className="bi bi-shield-x"></i>
                          <span>Revoke Access</span>
                        </>
                      )}
                    </button>
                    <span className="d-block text-muted mt-2" style={{ fontSize: "0.72rem" }}>
                      Enforced live on-chain
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Revocation Confirm Modal */}
      <ConfirmModal
        show={revokeModal.show}
        title="Revoke Doctor Access"
        message={`Are you sure you want to revoke access from Dr. ${
          revokeModal.grant?.doctor?.name || "this doctor"
        }? This will execute an on-chain transaction revoking all viewing and downloading permissions immediately.`}
        confirmText="Revoke Access Now"
        confirmVariant="danger"
        cancelText="Keep Access"
        onConfirm={handleConfirmRevoke}
        onClose={() => setRevokeModal({ show: false, grant: null })}
      />
    </div>
  );
}
