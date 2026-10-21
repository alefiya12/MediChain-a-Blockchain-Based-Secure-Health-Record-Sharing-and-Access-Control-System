import React, { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import api, { getErrorMessage } from "../../api/axios";
import { useAuth } from "../../context/AuthContext";
import { useWallet } from "../../context/WalletContext";
import StatusBadge from "../../components/StatusBadge";
import TxLink from "../../components/TxLink";
import Loader from "../../components/Loader";
import { truncateAddress, formatDate } from "../../utils/format";
import { toast } from "react-toastify";

export default function PatientDashboard() {
  const { user } = useAuth();
  const { account, isAmoy, isMismatch } = useWallet();

  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState(false);

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/patient/dashboard");
      if (res.data?.success && res.data?.data) {
        setDashboardData(res.data.data);
      }
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  // Copy patientId to clipboard
  const handleCopyPatientId = () => {
    if (!user?.patientId) return;
    navigator.clipboard.writeText(user.patientId);
    setCopiedId(true);
    toast.success(`Copied Patient ID: ${user.patientId}`);
    setTimeout(() => setCopiedId(false), 2000);
  };

  if (loading) {
    return <Loader message="Loading your health portal..." />;
  }

  const counts = dashboardData?.counts || {};
  const recentActivity = dashboardData?.recentActivity || [];

  return (
    <div>
      {/* Header */}
      <div className="d-flex flex-wrap justify-content-between align-items-center mb-4 gap-3">
        <div>
          <h2 className="fw-bold mb-1">Patient Health Portal</h2>
          <p className="text-muted mb-0">
            Welcome back, <strong className="text-dark">{user?.name}</strong> · Take full control over your health records
          </p>
        </div>
        <div className="d-flex align-items-center gap-2">
          <button onClick={fetchDashboard} className="btn btn-outline-secondary btn-sm d-flex align-items-center gap-1">
            <i className="bi bi-arrow-clockwise"></i>
            <span>Refresh</span>
          </button>
          <Link to="/patient/upload" className="btn btn-primary-gradient btn-sm d-flex align-items-center gap-2">
            <i className="bi bi-cloud-arrow-up"></i>
            <span>Upload Record</span>
          </Link>
        </div>
      </div>

      {/* Prominent Patient Identifier Hero Banner */}
      <div className="card p-4 border-0 shadow-sm mb-4 bg-white" style={{ borderLeft: "5px solid #0284c7" }}>
        <div className="row align-items-center g-3">
          <div className="col-md-8">
            <div className="d-flex align-items-center gap-2 mb-1">
              <span className="badge bg-primary-subtle text-primary border border-primary-subtle">
                <i className="bi bi-fingerprint me-1"></i> Unique Patient Identifier
              </span>
              <span className="text-muted small">Share with your medical practitioners</span>
            </div>
            <div className="d-flex align-items-center gap-3">
              <span className="display-6 fw-bold font-monospace text-primary tracking-wide" id="patient-id-display">
                {user?.patientId || "N/A"}
              </span>
              <button
                type="button"
                onClick={handleCopyPatientId}
                className="btn btn-outline-primary btn-sm d-flex align-items-center gap-1 py-1 px-3 rounded-pill"
                title="Copy Patient ID"
              >
                <i className={`bi ${copiedId ? "bi-check-lg" : "bi-copy"}`}></i>
                <span>{copiedId ? "Copied!" : "Copy ID"}</span>
              </button>
            </div>
          </div>
          <div className="col-md-4 text-md-end">
            <div className="small text-muted mb-1">MetaMask Status:</div>
            <span className={`btn-wallet ${account ? (isMismatch ? "btn-wallet-mismatch" : "btn-wallet-connected") : "btn-wallet-disconnected"}`}>
              <span className={`pulse-dot ${account ? (isMismatch ? "pulse-dot-danger" : "pulse-dot-success") : ""}`}></span>
              <span className="font-monospace small">
                {account ? (isAmoy ? truncateAddress(account, 6, 4) : "Wrong Network") : "Not Connected"}
              </span>
            </span>
          </div>
        </div>
      </div>

      {/* Live Metric Stat Cards */}
      <div className="row g-4 mb-4">
        {/* Total Records Card */}
        <div className="col-lg-4 col-md-6">
          <div className="card p-4 h-100 border-0 shadow-sm border-start border-primary border-4 card-hover">
            <div className="d-flex justify-content-between align-items-center mb-2">
              <span className="text-muted small fw-semibold text-uppercase">Medical Records</span>
              <span className="badge bg-primary-subtle text-primary">{counts.records?.confirmed ?? 0} Confirmed</span>
            </div>
            <h2 className="fw-bold text-dark mb-1" id="total-records-count">
              {counts.records?.total ?? 0}
            </h2>
            <p className="text-muted small mb-3">
              {counts.records?.pending ? (
                <span className="text-warning fw-semibold">
                  <i className="bi bi-clock-history me-1"></i>
                  {counts.records.pending} pending on-chain registration
                </span>
              ) : (
                "All records encrypted and confirmed on Polygon Amoy"
              )}
            </p>
            <Link to="/patient/records" className="btn btn-sm btn-outline-primary mt-auto">
              View My Records <i className="bi bi-arrow-right ms-1"></i>
            </Link>
          </div>
        </div>

        {/* Pending Requests Card */}
        <div className="col-lg-4 col-md-6">
          <div className="card p-4 h-100 border-0 shadow-sm border-start border-warning border-4 card-hover">
            <div className="d-flex justify-content-between align-items-center mb-2">
              <span className="text-muted small fw-semibold text-uppercase">Pending Requests</span>
              <span className="badge bg-warning-subtle text-warning-emphasis">Consent Required</span>
            </div>
            <h2 className="fw-bold text-warning mb-1" id="pending-requests-count">
              {counts.accessRequests?.pending ?? 0}
            </h2>
            <p className="text-muted small mb-3">Doctors waiting for your permission to access diagnostic records.</p>
            <Link to="/patient/requests" className="btn btn-sm btn-outline-warning mt-auto">
              Review Consent Requests <i className="bi bi-arrow-right ms-1"></i>
            </Link>
          </div>
        </div>

        {/* Active Grants Card */}
        <div className="col-lg-4 col-md-12">
          <div className="card p-4 h-100 border-0 shadow-sm border-start border-success border-4 card-hover">
            <div className="d-flex justify-content-between align-items-center mb-2">
              <span className="text-muted small fw-semibold text-uppercase">Active Grants</span>
              <span className="badge bg-success-subtle text-success">Authorized</span>
            </div>
            <h2 className="fw-bold text-success mb-1" id="granted-doctors-count">
              {counts.accessRequests?.granted ?? 0}
            </h2>
            <p className="text-muted small mb-3">Practitioners currently authorized with active smart contract access.</p>
            <Link to="/patient/granted" className="btn btn-sm btn-outline-success mt-auto">
              Manage Authorized Doctors <i className="bi bi-arrow-right ms-1"></i>
            </Link>
          </div>
        </div>
      </div>

      {/* Quick Navigation Panels */}
      <div className="row g-4 mb-4">
        <div className="col-md-3">
          <div className="card p-3 h-100 card-hover text-center">
            <div className="my-2">
              <i className="bi bi-cloud-arrow-up-fill fs-2 text-primary"></i>
            </div>
            <h6 className="fw-bold mb-1">Upload Record</h6>
            <p className="text-muted small mb-3">Encrypt and anchor new medical diagnostics.</p>
            <Link to="/patient/upload" className="btn btn-primary-gradient btn-sm mt-auto">
              Upload Now
            </Link>
          </div>
        </div>

        <div className="col-md-3">
          <div className="card p-3 h-100 card-hover text-center">
            <div className="my-2">
              <i className="bi bi-folder2-open fs-2 text-info"></i>
            </div>
            <h6 className="fw-bold mb-1">My Records</h6>
            <p className="text-muted small mb-3">View, download, and verify SHA-256 integrity.</p>
            <Link to="/patient/records" className="btn btn-outline-info btn-sm mt-auto">
              Browse Files
            </Link>
          </div>
        </div>

        <div className="col-md-3">
          <div className="card p-3 h-100 card-hover text-center">
            <div className="my-2">
              <i className="bi bi-inbox-fill fs-2 text-warning"></i>
            </div>
            <h6 className="fw-bold mb-1">Consent Requests</h6>
            <p className="text-muted small mb-3">Grant or reject incoming doctor requests on-chain.</p>
            <Link to="/patient/requests" className="btn btn-outline-warning btn-sm mt-auto">
              Open Requests
            </Link>
          </div>
        </div>

        <div className="col-md-3">
          <div className="card p-3 h-100 card-hover text-center">
            <div className="my-2">
              <i className="bi bi-person-check-fill fs-2 text-success"></i>
            </div>
            <h6 className="fw-bold mb-1">Authorized Doctors</h6>
            <p className="text-muted small mb-3">Revoke doctor permissions anytime with one click.</p>
            <Link to="/patient/granted" className="btn btn-outline-success btn-sm mt-auto">
              Granted Doctors
            </Link>
          </div>
        </div>
      </div>

      {/* Recent Activity Ledger */}
      <div className="card p-4 border-0 shadow-sm">
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h5 className="fw-bold mb-0">Recent Activity Trail</h5>
          <Link to="/patient/audit" className="small text-decoration-none">
            Full Audit Log <i className="bi bi-arrow-right"></i>
          </Link>
        </div>

        {recentActivity.length === 0 ? (
          <div className="text-center py-4 text-muted">
            <i className="bi bi-journal-check fs-2 opacity-50 d-block mb-1"></i>
            <span className="small">No recent activity recorded yet.</span>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="table-modern">
              <thead>
                <tr>
                  <th>Action</th>
                  <th>Actor</th>
                  <th>Details</th>
                  <th>Date</th>
                  <th>Tx Hash</th>
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
                      <span className="badge bg-light text-secondary border text-capitalize" style={{ fontSize: "0.65rem" }}>
                        {log.actor?.role}
                      </span>
                    </td>
                    <td>
                      <span className="small text-muted">
                        {log.record?.title || log.metadata?.title || log.metadata?.reason || "—"}
                      </span>
                    </td>
                    <td>
                      <span className="small text-muted">{formatDate(log.createdAt)}</span>
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
