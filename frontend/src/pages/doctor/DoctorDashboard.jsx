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

export default function DoctorDashboard() {
  const { user } = useAuth();
  const { account, isAmoy } = useWallet();

  const [statusData, setStatusData] = useState(null);
  const [authorizedCount, setAuthorizedCount] = useState(0);
  const [requestsCount, setRequestsCount] = useState(0);
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0);
  const [recentActivity, setRecentActivity] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchDoctorOverview = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Fetch live status
      const statusRes = await api.get("/doctor/status");
      if (statusRes.data?.success && statusRes.data?.data) {
        setStatusData(statusRes.data.data);
      }

      // 2. Fetch requests count
      const reqRes = await api.get("/doctor/requests");
      if (reqRes.data?.success && Array.isArray(reqRes.data?.data?.requests)) {
        const reqs = reqRes.data.data.requests;
        setRequestsCount(reqs.length);
        setPendingRequestsCount(reqs.filter((r) => r.status === "pending").length);
      }

      // 3. Fetch authorized patients count (if approved)
      if (user?.doctorStatus === "approved" || statusRes.data?.data?.status === "approved") {
        const authRes = await api.get("/doctor/authorized-patients");
        if (authRes.data?.success && Array.isArray(authRes.data?.data?.authorizedPatients)) {
          setAuthorizedCount(authRes.data.data.authorizedPatients.length);
        }
      }

      // 4. Fetch recent practitioner activity logs (last 5)
      const auditRes = await api.get("/audit?limit=5");
      if (auditRes.data?.success && Array.isArray(auditRes.data?.data?.logs)) {
        setRecentActivity(auditRes.data.data.logs);
      }
    } catch (err) {
      // Ignore if doctor is not yet approved
    } finally {
      setLoading(false);
    }
  }, [user?.doctorStatus]);

  useEffect(() => {
    fetchDoctorOverview();
  }, [fetchDoctorOverview]);

  const currentStatus = statusData?.status || user?.doctorStatus || "pending";
  const isApproved = currentStatus === "approved";
  const chainVerified = statusData?.chainVerified ?? false;

  if (loading) {
    return <Loader message="Loading doctor dashboard..." />;
  }

  return (
    <div>
      {/* Header */}
      <div className="d-flex flex-wrap justify-content-between align-items-center mb-4 gap-3">
        <div>
          <h2 className="fw-bold mb-1">Doctor Portal</h2>
          <p className="text-muted mb-0">
            Welcome, <strong className="text-dark">Dr. {user?.name}</strong> · Specialization:{" "}
            <span className="text-primary fw-semibold">{user?.doctorProfile?.specialization || "General"}</span>
          </p>
        </div>
        <div className="d-flex align-items-center gap-2">
          <button onClick={fetchDoctorOverview} className="btn btn-outline-secondary btn-sm d-flex align-items-center gap-1">
            <i className="bi bi-arrow-clockwise"></i>
            <span>Refresh</span>
          </button>
          {isApproved && (
            <Link to="/doctor/search" className="btn btn-primary-gradient btn-sm d-flex align-items-center gap-2">
              <i className="bi bi-search"></i>
              <span>Search Patient</span>
            </Link>
          )}
        </div>
      </div>

      {/* Verification Status Alert Banner */}
      {!isApproved && (
        <div className="banner-pending-verification mb-4 d-flex align-items-center gap-3 shadow-sm" role="alert">
          <i className="bi bi-clock-history fs-3 text-warning"></i>
          <div>
            <strong>License Verification Pending Approval</strong>
            <p className="mb-0 small">
              Your profile is currently awaiting administrator verification on the Polygon Amoy blockchain.
              Patient searches and consent requests will be unlocked once approved.
            </p>
          </div>
        </div>
      )}

      {currentStatus === "rejected" && (
        <div className="alert alert-danger d-flex align-items-center gap-3 mb-4 shadow-sm" role="alert">
          <i className="bi bi-x-circle-fill fs-3 text-danger"></i>
          <div>
            <strong>Application Rejected by Administrator</strong>
            <p className="mb-0 small">
              Reason: {statusData?.rejectionReason || "Credentials could not be verified."}
            </p>
          </div>
        </div>
      )}

      {/* Overview Stat Cards */}
      <div className="row g-4 mb-4">
        {/* Verification Status Card */}
        <div className="col-lg-4 col-md-6">
          <div className="card p-4 h-100 border-0 shadow-sm border-start border-primary border-4 card-hover">
            <div className="d-flex justify-content-between align-items-center mb-2">
              <span className="text-muted small fw-semibold text-uppercase">License Status</span>
              <StatusBadge status={currentStatus} />
            </div>
            <h4 className="fw-bold text-dark mb-1">
              {isApproved ? "Verified Practitioner" : "Pending Verification"}
            </h4>
            <div className="small text-muted mb-2">
              On-Chain Verified:{" "}
              {chainVerified ? (
                <span className="badge bg-success-subtle text-success">
                  <i className="bi bi-check-circle me-1"></i> Active on Amoy
                </span>
              ) : (
                <span className="badge bg-warning-subtle text-warning-emphasis">Awaiting Contract Event</span>
              )}
            </div>
            {statusData?.verifyTxHash && (
              <div className="small">
                Tx: <TxLink txHash={statusData.verifyTxHash} />
              </div>
            )}
          </div>
        </div>

        {/* Authorized Patients Count */}
        <div className="col-lg-4 col-md-6">
          <div className="card p-4 h-100 border-0 shadow-sm border-start border-success border-4 card-hover">
            <div className="d-flex justify-content-between align-items-center mb-2">
              <span className="text-muted small fw-semibold text-uppercase">Authorized Patients</span>
              <span className="badge bg-success-subtle text-success">Active Consent</span>
            </div>
            <h2 className="fw-bold text-success mb-1" id="authorized-patients-count">
              {authorizedCount}
            </h2>
            <p className="text-muted small mb-3">Patients who currently granted you record access permissions.</p>
            {isApproved ? (
              <Link to="/doctor/records" className="btn btn-sm btn-outline-success mt-auto">
                View Patient Records <i className="bi bi-arrow-right ms-1"></i>
              </Link>
            ) : (
              <span className="text-muted small">Locked until verified</span>
            )}
          </div>
        </div>

        {/* Pending Access Requests Count */}
        <div className="col-lg-4 col-md-12">
          <div className="card p-4 h-100 border-0 shadow-sm border-start border-warning border-4 card-hover">
            <div className="d-flex justify-content-between align-items-center mb-2">
              <span className="text-muted small fw-semibold text-uppercase">Access Requests</span>
              <span className="badge bg-warning-subtle text-warning-emphasis">{pendingRequestsCount} Pending</span>
            </div>
            <h2 className="fw-bold text-dark mb-1">
              {requestsCount}
            </h2>
            <p className="text-muted small mb-3">
              Total requests submitted ({pendingRequestsCount} awaiting patient decision).
            </p>
            <Link to="/doctor/requests" className="btn btn-sm btn-outline-secondary mt-auto">
              Track Requests <i className="bi bi-arrow-right ms-1"></i>
            </Link>
          </div>
        </div>
      </div>

      {/* Quick Action Navigation Panels */}
      <div className="row g-4">
        <div className="col-md-4">
          <div className="card p-4 h-100 card-hover text-center">
            <div className="my-2">
              <i className="bi bi-search fs-1 text-primary"></i>
            </div>
            <h5 className="fw-bold mb-1">Search Patient</h5>
            <p className="text-muted small">
              Lookup patient by their exact MC-P-XXXXXX identifier to request consent on-chain.
            </p>
            <Link
              to="/doctor/search"
              className={`btn btn-sm mt-auto ${isApproved ? "btn-primary-gradient" : "btn-outline-secondary disabled"}`}
            >
              {isApproved ? "Search Patient" : "Locked (Pending Verification)"}
            </Link>
          </div>
        </div>

        <div className="col-md-4">
          <div className="card p-4 h-100 card-hover text-center">
            <div className="my-2">
              <i className="bi bi-send-fill fs-1 text-warning"></i>
            </div>
            <h5 className="fw-bold mb-1">My Requests</h5>
            <p className="text-muted small">
              Review history of submitted access requests and their on-chain verification links.
            </p>
            <Link to="/doctor/requests" className="btn btn-outline-warning btn-sm mt-auto">
              View Requests
            </Link>
          </div>
        </div>

        <div className="col-md-4">
          <div className="card p-4 h-100 card-hover text-center">
            <div className="my-2">
              <i className="bi bi-file-earmark-medical-fill fs-1 text-success"></i>
            </div>
            <h5 className="fw-bold mb-1">Authorized Records</h5>
            <p className="text-muted small">
              View diagnostic files and run cryptographic tamper verification on authorized patients.
            </p>
            <Link
              to="/doctor/records"
              className={`btn btn-sm mt-auto ${isApproved ? "btn-outline-success" : "btn-outline-secondary disabled"}`}
            >
              {isApproved ? "Authorized Records" : "Locked (Pending Verification)"}
            </Link>
          </div>
        </div>
      </div>

      {/* Recent Activity Trail (Last 5) */}
      <div className="card p-4 border-0 shadow-sm mt-4 bg-white">
        <div className="d-flex justify-content-between align-items-center mb-3">
          <div>
            <h5 className="fw-bold mb-0">Recent Practitioner Activity Trail</h5>
            <p className="text-muted small mb-0">Latest access requests, authorizations, and file downloads</p>
          </div>
          <Link to="/doctor/audit" className="small text-decoration-none">
            Full Doctor Audit Log <i className="bi bi-arrow-right"></i>
          </Link>
        </div>

        {recentActivity.length === 0 ? (
          <div className="text-center py-4 text-muted">
            <i className="bi bi-journal-check fs-2 opacity-50 d-block mb-1"></i>
            <span className="small">No practitioner activity recorded yet.</span>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0">
              <thead className="table-light text-muted small text-uppercase">
                <tr>
                  <th style={{ width: "20%" }}>Action</th>
                  <th style={{ width: "25%" }}>Patient / Context</th>
                  <th style={{ width: "30%" }}>Detail</th>
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
                      <div className="fw-semibold text-dark small">
                        {log.patient?.name ? log.patient.name : (log.patient?.patientId || "—")}
                      </div>
                      {log.patient?.patientId && (
                        <span className="text-muted font-monospace" style={{ fontSize: "0.7rem" }}>
                          {log.patient.patientId}
                        </span>
                      )}
                    </td>
                    <td>
                      <span className="small text-muted">
                        {log.record?.title || log.metadata?.title || log.metadata?.reason || "Activity completed"}
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
