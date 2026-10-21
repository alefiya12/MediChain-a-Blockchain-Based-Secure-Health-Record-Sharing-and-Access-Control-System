import React, { useState } from "react";
import TxLink from "./TxLink";
import Loader from "./Loader";
import { formatDate, truncateAddress } from "../utils/format";

export const ALL_ACTION_OPTIONS = [
  { value: "all", label: "All Audit Actions" },
  { value: "RECORD_UPLOADED", label: "Record Uploads" },
  { value: "RECORD_CHAIN_CONFIRMED", label: "Blockchain Anchors" },
  { value: "RECORD_VERIFIED", label: "Integrity Verifications" },
  { value: "RECORD_TAMPER_DETECTED", label: "Tamper Detections" },
  { value: "RECORD_VIEWED", label: "Doctor Views / Downloads" },
  { value: "ACCESS_REQUESTED", label: "Access Requests" },
  { value: "ACCESS_GRANTED", label: "Access Grants" },
  { value: "ACCESS_REJECTED", label: "Access Rejections" },
  { value: "ACCESS_REVOKED", label: "Access Revocations" },
  { value: "DOCTOR_REGISTERED", label: "Doctor Registrations" },
  { value: "DOCTOR_APPROVED", label: "Doctor Approvals" },
  { value: "DOCTOR_REJECTED", label: "Doctor Rejections" }
];

export default function AuditTable({
  title = "Audit Trail",
  subtitle = "Activity history and blockchain-anchored actions",
  logs = [],
  loading = false,
  role = "patient", // "patient" | "doctor" | "admin"
  actionFilter = "all",
  onActionFilterChange,
  pagination = { page: 1, totalPages: 1, total: 0 },
  onPageChange,
  onRefresh,
  onChainEvents = [],
  onChainLoading = false,
  availableActions = ALL_ACTION_OPTIONS
}) {
  const [activeTab, setActiveTab] = useState("logs"); // "logs" | "onchain"
  const [searchQuery, setSearchQuery] = useState("");

  // Plain-language action description generator
  const getActionDescription = (log) => {
    const actorName = log.actor?.name || "User";
    const doctorName = log.doctor?.name ? `Dr. ${log.doctor.name}` : "Doctor";
    const patientName = log.patient?.name || (log.patient?.patientId ? `Patient ${log.patient.patientId}` : "Patient");
    const recordTitle = log.record?.title ? `"${log.record.title}"` : (log.metadata?.title ? `"${log.metadata.title}"` : "Medical Record");

    if (role === "patient") {
      switch (log.action) {
        case "RECORD_UPLOADED":
          return `You uploaded encrypted record ${recordTitle}`;
        case "RECORD_CHAIN_CONFIRMED":
          return `Hash anchored on Polygon Amoy for ${recordTitle}`;
        case "ACCESS_REQUESTED":
          return `${doctorName} requested access to your health records`;
        case "ACCESS_GRANTED":
          return `You granted record access to ${doctorName}`;
        case "ACCESS_REJECTED":
          return `You rejected access request from ${doctorName}`;
        case "ACCESS_REVOKED":
          return `You revoked access permissions from ${doctorName}`;
        case "RECORD_VIEWED":
          return `${doctorName} viewed / downloaded ${recordTitle}`;
        case "RECORD_VERIFIED":
          return `Cryptographic integrity verified for ${recordTitle}`;
        case "RECORD_TAMPER_DETECTED":
          return `Integrity check detected mismatch for ${recordTitle}`;
        default:
          return log.action.replace(/_/g, " ").toLowerCase();
      }
    } else if (role === "doctor") {
      switch (log.action) {
        case "DOCTOR_REGISTERED":
          return "You submitted doctor registration credentials";
        case "DOCTOR_APPROVED":
          return "Administrator verified your medical license on-chain";
        case "DOCTOR_REJECTED":
          return "Administrator rejected license verification";
        case "ACCESS_REQUESTED":
          return `You requested access to records of ${patientName}`;
        case "ACCESS_GRANTED":
          return `${patientName} granted you access to their medical records`;
        case "ACCESS_REJECTED":
          return `${patientName} rejected your access request`;
        case "ACCESS_REVOKED":
          return `${patientName} revoked your access permissions`;
        case "RECORD_VIEWED":
          return `You downloaded and decrypted record ${recordTitle}`;
        case "RECORD_VERIFIED":
          return `You verified cryptographic integrity of ${recordTitle}`;
        case "RECORD_TAMPER_DETECTED":
          return `Integrity verification detected alteration in ${recordTitle}`;
        default:
          return log.action.replace(/_/g, " ").toLowerCase();
      }
    } else {
      // Admin perspective
      switch (log.action) {
        case "DOCTOR_REGISTERED":
          return `Dr. ${log.actor?.name || "Doctor"} registered medical profile`;
        case "DOCTOR_APPROVED":
          return `Admin approved license for Dr. ${log.doctor?.name || log.metadata?.doctorName || "Doctor"}`;
        case "DOCTOR_REJECTED":
          return `Admin rejected license for Dr. ${log.doctor?.name || log.metadata?.doctorName || "Doctor"}`;
        case "RECORD_UPLOADED":
          return `${patientName} uploaded encrypted record ${recordTitle}`;
        case "RECORD_CHAIN_CONFIRMED":
          return `Record ${recordTitle} anchored on Polygon Amoy`;
        case "ACCESS_REQUESTED":
          return `${doctorName} requested access from ${patientName}`;
        case "ACCESS_GRANTED":
          return `${patientName} granted access to ${doctorName}`;
        case "ACCESS_REJECTED":
          return `${patientName} rejected request from ${doctorName}`;
        case "ACCESS_REVOKED":
          return `${patientName} revoked access from ${doctorName}`;
        case "RECORD_VIEWED":
          return `${doctorName} accessed record ${recordTitle}`;
        case "RECORD_VERIFIED":
          return `Integrity check passed for ${recordTitle}`;
        case "RECORD_TAMPER_DETECTED":
          return `Integrity check failed: Tamper detected in ${recordTitle}`;
        default:
          return `${actorName} performed ${log.action.replace(/_/g, " ")}`;
      }
    }
  };

  // Colored action badge
  const getActionBadge = (action) => {
    switch (action) {
      case "ACCESS_GRANTED":
      case "RECORD_CHAIN_CONFIRMED":
      case "RECORD_VERIFIED":
      case "DOCTOR_APPROVED":
        return <span className="badge bg-success-subtle text-success border border-success-subtle">{action.replace(/_/g, " ")}</span>;
      case "ACCESS_REVOKED":
      case "ACCESS_REJECTED":
      case "RECORD_TAMPER_DETECTED":
      case "DOCTOR_REJECTED":
        return <span className="badge bg-danger-subtle text-danger border border-danger-subtle">{action.replace(/_/g, " ")}</span>;
      case "ACCESS_REQUESTED":
      case "USER_REGISTERED":
      case "DOCTOR_REGISTERED":
        return <span className="badge bg-warning-subtle text-warning border border-warning-subtle">{action.replace(/_/g, " ")}</span>;
      case "RECORD_UPLOADED":
      case "RECORD_VIEWED":
      default:
        return <span className="badge bg-primary-subtle text-primary border border-primary-subtle">{action.replace(/_/g, " ")}</span>;
    }
  };

  // Client-side search filtering
  const filteredLogs = logs.filter((log) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    const actorMatch = log.actor?.name?.toLowerCase().includes(q) || log.actor?.email?.toLowerCase().includes(q);
    const doctorMatch = log.doctor?.name?.toLowerCase().includes(q) || log.doctor?.email?.toLowerCase().includes(q);
    const patientMatch = log.patient?.name?.toLowerCase().includes(q) || log.patient?.patientId?.toLowerCase().includes(q);
    const recordMatch = log.record?.title?.toLowerCase().includes(q) || log.metadata?.title?.toLowerCase().includes(q);
    const txMatch = log.txHash?.toLowerCase().includes(q);
    const descMatch = getActionDescription(log).toLowerCase().includes(q);
    return actorMatch || doctorMatch || patientMatch || recordMatch || txMatch || descMatch;
  });

  return (
    <div>
      {/* Header */}
      <div className="d-flex flex-wrap justify-content-between align-items-center mb-4 gap-3">
        <div>
          <h2 className="fw-bold mb-1">{title}</h2>
          <p className="text-muted mb-0">{subtitle}</p>
        </div>
        <button
          onClick={onRefresh}
          className="btn btn-outline-secondary btn-sm d-flex align-items-center gap-1"
          disabled={loading || onChainLoading}
        >
          <i className="bi bi-arrow-clockwise"></i>
          <span>Refresh</span>
        </button>
      </div>

      {/* Tabs: Database Logs vs On-Chain Blockchain Events */}
      <div className="d-flex flex-wrap justify-content-between align-items-center mb-4 gap-3">
        <ul className="nav nav-pills bg-white p-1 rounded shadow-sm border d-inline-flex">
          <li className="nav-item">
            <button
              type="button"
              className={`nav-link btn-sm ${activeTab === "logs" ? "active" : ""}`}
              onClick={() => setActiveTab("logs")}
            >
              <i className="bi bi-journal-text me-1"></i> Audit Ledger ({pagination.total || logs.length})
            </button>
          </li>
          <li className="nav-item">
            <button
              type="button"
              className={`nav-link btn-sm ${activeTab === "onchain" ? "active" : ""}`}
              onClick={() => setActiveTab("onchain")}
            >
              <i className="bi bi-link-45deg me-1"></i> Live Blockchain Events ({onChainEvents.length})
            </button>
          </li>
        </ul>

        {activeTab === "logs" && (
          <div className="d-flex flex-wrap align-items-center gap-2">
            <div className="input-group input-group-sm" style={{ width: "220px" }}>
              <span className="input-group-text bg-light border-end-0">
                <i className="bi bi-search text-muted"></i>
              </span>
              <input
                type="text"
                className="form-control bg-light border-start-0"
                placeholder="Search audit trail..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {onActionFilterChange && (
              <select
                className="form-select form-select-sm"
                style={{ width: "200px" }}
                value={actionFilter}
                onChange={(e) => onActionFilterChange(e.target.value)}
              >
                {availableActions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}
      </div>

      {/* Main Tab 1: Database Audit Ledger */}
      {activeTab === "logs" && (
        <>
          {loading ? (
            <Loader message="Loading activity audit trail..." />
          ) : filteredLogs.length === 0 ? (
            <div className="card p-5 text-center border-0 shadow-sm bg-white">
              <i className="bi bi-journal-check display-4 text-muted mb-3 opacity-50"></i>
              <h5 className="fw-bold">No Audit Events Found</h5>
              <p className="text-muted small mx-auto mb-0" style={{ maxWidth: "420px" }}>
                {searchQuery || actionFilter !== "all"
                  ? "No activity matches your active search or action filters. Try resetting the filter."
                  : "No events recorded in this activity ledger yet."}
              </p>
            </div>
          ) : (
            <div className="card border-0 shadow-sm overflow-hidden bg-white">
              <div className="table-responsive">
                <table className="table table-hover align-middle mb-0">
                  <thead className="table-light text-muted small text-uppercase">
                    <tr>
                      <th style={{ width: "18%" }}>Timestamp</th>
                      <th style={{ width: "18%" }}>Action</th>
                      <th style={{ width: "16%" }}>Actor</th>
                      <th style={{ width: "16%" }}>Counterpart</th>
                      <th style={{ width: "18%" }}>Activity Detail</th>
                      <th style={{ width: "14%" }}>Tx Hash</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLogs.map((log) => {
                      const actor = log.actor || {};
                      const counterpart = role === "patient" ? log.doctor : (role === "doctor" ? log.patient : (log.doctor || log.patient));

                      return (
                        <tr key={log._id}>
                          <td>
                            <span className="small text-muted d-block font-monospace">
                              <i className="bi bi-clock me-1"></i>
                              {formatDate(log.createdAt)}
                            </span>
                          </td>

                          <td>{getActionBadge(log.action)}</td>

                          <td>
                            <div>
                              <span className="fw-semibold text-dark small d-block">
                                {actor.name || "User"}
                              </span>
                              <span className="badge bg-light text-secondary border text-capitalize" style={{ fontSize: "0.7rem" }}>
                                {actor.role || log.actorRole}
                              </span>
                            </div>
                          </td>

                          <td>
                            {counterpart ? (
                              <div>
                                <span className="fw-medium text-dark small d-block">
                                  {counterpart.name ? (counterpart.role === "doctor" ? `Dr. ${counterpart.name}` : counterpart.name) : (counterpart.patientId || "N/A")}
                                </span>
                                {counterpart.walletAddress && (
                                  <span className="text-muted font-monospace" style={{ fontSize: "0.72rem" }}>
                                    {truncateAddress(counterpart.walletAddress)}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-muted small">—</span>
                            )}
                          </td>

                          <td>
                            <span className="small text-dark fw-medium d-block">
                              {getActionDescription(log)}
                            </span>
                            {log.record?.title && (
                              <span className="text-muted d-block text-truncate" style={{ maxWidth: "220px", fontSize: "0.72rem" }}>
                                <i className="bi bi-file-earmark-medical me-1"></i>
                                {log.record.title}
                              </span>
                            )}
                          </td>

                          <td>
                            {log.txHash ? (
                              <TxLink txHash={log.txHash} />
                            ) : (
                              <span className="text-muted small fst-italic">Off-chain / DB Log</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {pagination.totalPages > 1 && onPageChange && (
                <div className="p-3 border-top d-flex justify-content-between align-items-center">
                  <button
                    type="button"
                    className="btn btn-outline-secondary btn-sm"
                    disabled={pagination.page <= 1}
                    onClick={() => onPageChange(Math.max(1, pagination.page - 1))}
                  >
                    <i className="bi bi-chevron-left me-1"></i> Previous
                  </button>
                  <span className="small text-muted">
                    Page <strong>{pagination.page}</strong> of <strong>{pagination.totalPages}</strong>
                  </span>
                  <button
                    type="button"
                    className="btn btn-outline-secondary btn-sm"
                    disabled={pagination.page >= pagination.totalPages}
                    onClick={() => onPageChange(pagination.page + 1)}
                  >
                    Next <i className="bi bi-chevron-right ms-1"></i>
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Main Tab 2: Live Blockchain Events Panel */}
      {activeTab === "onchain" && (
        <div className="card border-0 shadow-sm overflow-hidden bg-white">
          <div className="card-header bg-light border-bottom p-3">
            <div className="d-flex align-items-center justify-content-between">
              <div>
                <h6 className="fw-bold mb-0 text-dark">
                  <i className="bi bi-link-45deg text-primary me-1"></i> Polygon Amoy Smart Contract Logs
                </h6>
                <p className="text-muted small mb-0">
                  Immutable event receipts extracted directly from the blockchain (verified by consensus)
                </p>
              </div>
              <span className="badge bg-primary-subtle text-primary border border-primary-subtle">
                Network: Polygon Amoy (80002)
              </span>
            </div>
          </div>

          {onChainLoading ? (
            <Loader message="Querying live logs from Polygon Amoy Bor RPC..." />
          ) : onChainEvents.length === 0 ? (
            <div className="p-5 text-center text-muted">
              <i className="bi bi-bounding-box-circles display-4 text-muted mb-3 opacity-50 d-block"></i>
              <h6 className="fw-bold">No On-Chain Events Recorded In Current Range</h6>
              <p className="small text-muted mb-0">
                Any transactions confirmed on the MediChain smart contract will appear here directly from event topics.
              </p>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0">
                <thead className="table-light text-muted small text-uppercase">
                  <tr>
                    <th style={{ width: "15%" }}>Block Number</th>
                    <th style={{ width: "20%" }}>Smart Contract Event</th>
                    <th style={{ width: "40%" }}>Event Decoded Arguments</th>
                    <th style={{ width: "25%" }}>Transaction Link</th>
                  </tr>
                </thead>
                <tbody>
                  {onChainEvents.map((evt, idx) => (
                    <tr key={`${evt.txHash}-${idx}`}>
                      <td>
                        <span className="font-monospace small badge bg-light text-dark border">
                          #{evt.blockNumber}
                        </span>
                      </td>

                      <td>
                        <span className="badge bg-primary-subtle text-primary border border-primary-subtle font-monospace">
                          {evt.eventName}
                        </span>
                      </td>

                      <td>
                        <div className="font-monospace small bg-light p-2 rounded border" style={{ maxHeight: "80px", overflowY: "auto", fontSize: "0.75rem" }}>
                          {Object.entries(evt.args || {}).map(([key, val]) => (
                            <div key={key}>
                              <strong className="text-secondary">{key}:</strong>{" "}
                              <span className="text-dark">{String(val)}</span>
                            </div>
                          ))}
                        </div>
                      </td>

                      <td>
                        <TxLink txHash={evt.txHash} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
