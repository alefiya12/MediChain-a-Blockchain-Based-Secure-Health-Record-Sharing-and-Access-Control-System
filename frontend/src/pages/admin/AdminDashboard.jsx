import React, { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import api, { getErrorMessage } from "../../api/axios";
import { useWallet } from "../../context/WalletContext";
import { getContract } from "../../blockchain/contract";
import Loader from "../../components/Loader";
import StatusBadge from "../../components/StatusBadge";
import TxLink from "../../components/TxLink";
import { truncateAddress, formatDate } from "../../utils/format";
import { toast } from "react-toastify";

export default function AdminDashboard() {
  const { account, provider, signer, isAmoy } = useWallet();

  const [stats, setStats] = useState(null);
  const [recentActivity, setRecentActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [contractOwner, setContractOwner] = useState(null);
  const [checkingOwner, setCheckingOwner] = useState(false);

  // Fetch admin stats & recent logs
  const fetchStats = useCallback(async () => {
    try {
      const res = await api.get("/admin/stats");
      if (res.data?.success && res.data?.data?.stats) {
        setStats(res.data.data.stats);
      }

      const auditRes = await api.get("/audit?limit=5");
      if (auditRes.data?.success && Array.isArray(auditRes.data?.data?.logs)) {
        setRecentActivity(auditRes.data.data.logs);
      }
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch contract owner on-chain
  const fetchContractOwner = useCallback(async () => {
    if (!provider && !signer) return;
    try {
      setCheckingOwner(true);
      const contract = getContract(signer || provider);
      const ownerAddress = await contract.owner();
      setContractOwner(ownerAddress);
    } catch {
      // Contract call failed or network issue
    } finally {
      setCheckingOwner(false);
    }
  }, [provider, signer]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    fetchContractOwner();
  }, [fetchContractOwner]);

  const isOwner = Boolean(
    account && contractOwner && account.toLowerCase() === contractOwner.toLowerCase()
  );

  if (loading) {
    return <Loader message="Loading administrator metrics..." />;
  }

  return (
    <div>
      {/* Header */}
      <div className="d-flex flex-wrap justify-content-between align-items-center mb-4 gap-3">
        <div>
          <h2 className="fw-bold mb-1">Administrator Governance Dashboard</h2>
          <p className="text-muted mb-0">
            System metrics, smart contract ownership, and practitioner verification oversight
          </p>
        </div>
        <div className="d-flex align-items-center gap-2">
          <button onClick={fetchStats} className="btn btn-outline-secondary btn-sm d-flex align-items-center gap-1">
            <i className="bi bi-arrow-clockwise"></i>
            <span>Refresh Stats</span>
          </button>
          <Link to="/admin/doctors" className="btn btn-primary-gradient btn-sm d-flex align-items-center gap-1">
            <i className="bi bi-patch-check"></i>
            <span>Doctor Verifications</span>
          </Link>
        </div>
      </div>

      {/* Contract Ownership Alert */}
      {contractOwner && account && !isOwner && (
        <div className="alert alert-warning border-warning d-flex align-items-center gap-3 mb-4 shadow-sm" role="alert">
          <i className="bi bi-exclamation-triangle-fill fs-3 text-warning"></i>
          <div>
            <strong>Warning: Connected wallet is not the Smart Contract Owner</strong>
            <p className="mb-0 small">
              Connected: <code className="text-dark">{account}</code> | Contract Owner:{" "}
              <code className="text-dark">{contractOwner}</code>.
              Only the contract owner wallet can approve or reject doctors on Polygon Amoy.
            </p>
          </div>
        </div>
      )}

      {/* Contract Owner Status Card */}
      <div className="card p-4 border-0 shadow-sm mb-4 bg-white">
        <div className="row align-items-center g-3">
          <div className="col-md-8">
            <div className="d-flex align-items-center gap-2 mb-2">
              <span className="badge bg-primary-subtle text-primary border border-primary-subtle">
                <i className="bi bi-shield-lock-fill me-1"></i> Polygon Amoy MediChain Contract
              </span>
              {isOwner ? (
                <span className="badge bg-success-subtle text-success border border-success-subtle">
                  <i className="bi bi-check-circle-fill me-1"></i> Authorized Owner Wallet
                </span>
              ) : (
                <span className="badge bg-secondary-subtle text-secondary border">
                  {checkingOwner ? "Checking owner..." : "Non-Owner Wallet"}
                </span>
              )}
            </div>
            <h5 className="fw-bold mb-1">Smart Contract Governance</h5>
            <p className="text-muted small mb-0">
              Contract Owner:{" "}
              <span className="font-monospace text-dark fw-semibold">
                {contractOwner || "0x443E3C91c81cE14a2f65E5829eD0EE289Ab83464"}
              </span>
            </p>
          </div>
          <div className="col-md-4 text-md-end">
            <span className={`btn-wallet ${isOwner ? "btn-wallet-connected" : "btn-wallet-mismatch"}`}>
              <span className={`pulse-dot ${isOwner ? "pulse-dot-success" : "pulse-dot-danger"}`}></span>
              <span className="font-monospace small">
                {account ? truncateAddress(account, 8, 6) : "Wallet Disconnected"}
              </span>
            </span>
          </div>
        </div>
      </div>

      {/* Metrics Stat Cards */}
      <div className="row g-4 mb-4">
        {/* Pending Doctors Card */}
        <div className="col-xl-3 col-md-6">
          <div className="card p-4 h-100 border-0 shadow-sm border-start border-warning border-4 card-hover">
            <div className="d-flex justify-content-between align-items-center mb-2">
              <span className="text-muted small fw-semibold text-uppercase">Pending Doctors</span>
              <span className="badge bg-warning-subtle text-warning-emphasis">Action Required</span>
            </div>
            <h2 className="fw-bold text-warning mb-1" id="pending-doctors-count">
              {stats?.doctors?.pending ?? 0}
            </h2>
            <p className="text-muted small mb-3">Medical practitioners awaiting on-chain license verification.</p>
            <Link to="/admin/doctors?status=pending" className="btn btn-sm btn-outline-warning mt-auto">
              Review Pending Doctors <i className="bi bi-arrow-right ms-1"></i>
            </Link>
          </div>
        </div>

        {/* Approved Doctors Card */}
        <div className="col-xl-3 col-md-6">
          <div className="card p-4 h-100 border-0 shadow-sm border-start border-success border-4 card-hover">
            <div className="d-flex justify-content-between align-items-center mb-2">
              <span className="text-muted small fw-semibold text-uppercase">Approved Doctors</span>
              <span className="badge bg-success-subtle text-success">Verified</span>
            </div>
            <h2 className="fw-bold text-success mb-1">
              {stats?.doctors?.approved ?? 0}
            </h2>
            <p className="text-muted small mb-3">Total medical doctors with verified on-chain authorization.</p>
            <Link to="/admin/doctors?status=approved" className="btn btn-sm btn-outline-success mt-auto">
              View Approved Doctors <i className="bi bi-arrow-right ms-1"></i>
            </Link>
          </div>
        </div>

        {/* Registered Patients Card */}
        <div className="col-xl-3 col-md-6">
          <div className="card p-4 h-100 border-0 shadow-sm border-start border-primary border-4 card-hover">
            <div className="d-flex justify-content-between align-items-center mb-2">
              <span className="text-muted small fw-semibold text-uppercase">Patients</span>
              <span className="badge bg-primary-subtle text-primary">Active</span>
            </div>
            <h2 className="fw-bold text-primary mb-1">
              {stats?.patients ?? 0}
            </h2>
            <p className="text-muted small mb-0">Total patients registered on MediChain.</p>
          </div>
        </div>

        {/* Medical Records & Access Requests */}
        <div className="col-xl-3 col-md-6">
          <div className="card p-4 h-100 border-0 shadow-sm border-start border-info border-4 card-hover">
            <div className="d-flex justify-content-between align-items-center mb-2">
              <span className="text-muted small fw-semibold text-uppercase">Records & Consents</span>
              <span className="badge bg-info-subtle text-info">Activity</span>
            </div>
            <h2 className="fw-bold text-dark mb-1">
              {stats?.records ?? 0}
            </h2>
            <p className="text-muted small mb-0">
              Encrypted records anchored · <strong className="text-dark">{stats?.accessRequests ?? 0}</strong> consent requests.
            </p>
          </div>
        </div>
      </div>

      {/* Quick Action Panels */}
      <div className="row g-4">
        <div className="col-md-6">
          <div className="card p-4 h-100 border-0 shadow-sm">
            <div className="d-flex align-items-center gap-3 mb-3">
              <div
                className="d-flex align-items-center justify-content-center rounded-3 bg-primary-subtle text-primary"
                style={{ width: "42px", height: "42px" }}
              >
                <i className="bi bi-patch-check fs-4"></i>
              </div>
              <div>
                <h5 className="fw-bold mb-0">Doctor Verification Center</h5>
                <p className="text-muted small mb-0">Verify licenses and execute on-chain approvals</p>
              </div>
            </div>
            <p className="text-secondary small">
              Verify credentials of registered practitioners, execute <code className="text-primary">verifyDoctor</code> transactions on Polygon Amoy, and update system authorization state.
            </p>
            <div className="d-flex gap-2 mt-auto">
              <Link to="/admin/doctors" className="btn btn-primary-gradient btn-sm">
                Open Verification Center
              </Link>
            </div>
          </div>
        </div>

        <div className="col-md-6">
          <div className="card p-4 h-100 border-0 shadow-sm">
            <div className="d-flex align-items-center gap-3 mb-3">
              <div
                className="d-flex align-items-center justify-content-center rounded-3 bg-success-subtle text-success"
                style={{ width: "42px", height: "42px" }}
              >
                <i className="bi bi-journal-text fs-4"></i>
              </div>
              <div>
                <h5 className="fw-bold mb-0">System Audit Trail</h5>
                <p className="text-muted small mb-0">Immutable platform-wide event monitoring</p>
              </div>
            </div>
            <p className="text-secondary small">
              Review security actions, doctor registrations, on-chain approvals, medical file uploads, and patient consent revocations.
            </p>
            <div className="d-flex gap-2 mt-auto">
              <Link to="/admin/audit" className="btn btn-outline-secondary btn-sm">
                View All System Logs
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Recent System Activity Trail (Last 5) */}
      <div className="card p-4 border-0 shadow-sm mt-4 bg-white">
        <div className="d-flex justify-content-between align-items-center mb-3">
          <div>
            <h5 className="fw-bold mb-0">Recent System Governance Activity</h5>
            <p className="text-muted small mb-0">Live feed of doctor verifications, patient records, and permissions</p>
          </div>
          <Link to="/admin/audit" className="small text-decoration-none">
            Full System Audit Ledger <i className="bi bi-arrow-right"></i>
          </Link>
        </div>

        {recentActivity.length === 0 ? (
          <div className="text-center py-4 text-muted">
            <i className="bi bi-journal-check fs-2 opacity-50 d-block mb-1"></i>
            <span className="small">No system governance activity recorded yet.</span>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0">
              <thead className="table-light text-muted small text-uppercase">
                <tr>
                  <th style={{ width: "20%" }}>Action</th>
                  <th style={{ width: "25%" }}>Actor & Role</th>
                  <th style={{ width: "30%" }}>Event Detail</th>
                  <th style={{ width: "15%" }}>Date</th>
                  <th style={{ width: "10%" }}>Tx Hash</th>
                </tr>
              </thead>
              <tbody>
                {recentActivity.map((log) => (
                  <tr key={log._id}>
                    <td>
                      <StatusBadge status={log.action} />
                    </td>
                    <td>
                      <div className="fw-semibold text-dark small">{log.actor?.name || "System"}</div>
                      <span className="badge bg-light text-secondary border text-capitalize" style={{ fontSize: "0.7rem" }}>
                        {log.actor?.role || log.actorRole}
                      </span>
                    </td>
                    <td>
                      <span className="small text-muted">
                        {log.record?.title || log.metadata?.title || log.metadata?.reason || log.metadata?.doctorName || "Platform action executed"}
                      </span>
                    </td>
                    <td>
                      <span className="small text-muted font-monospace">{formatDate(log.createdAt)}</span>
                    </td>
                    <td>
                      {log.txHash ? <TxLink txHash={log.txHash} /> : <span className="text-muted small">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
