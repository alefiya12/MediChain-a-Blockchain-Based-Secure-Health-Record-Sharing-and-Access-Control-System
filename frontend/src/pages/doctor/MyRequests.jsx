import React, { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import api, { getErrorMessage } from "../../api/axios";
import StatusBadge from "../../components/StatusBadge";
import TxLink from "../../components/TxLink";
import Loader from "../../components/Loader";
import { formatDate } from "../../utils/format";
import { toast } from "react-toastify";

export default function MyRequests() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/doctor/requests");
      if (res.data?.success && Array.isArray(res.data?.data?.requests)) {
        setRequests(res.data.data.requests);
      }
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const filteredRequests = requests.filter((r) => {
    if (statusFilter === "all") return true;
    return r.status === statusFilter;
  });

  return (
    <div>
      {/* Title */}
      <div className="d-flex flex-wrap justify-content-between align-items-center mb-4 gap-3">
        <div>
          <h2 className="fw-bold mb-1">My Access Requests</h2>
          <p className="text-muted mb-0">Track on-chain consent requests submitted to patients</p>
        </div>
        <div className="d-flex align-items-center gap-2">
          <button onClick={fetchRequests} className="btn btn-outline-secondary btn-sm d-flex align-items-center gap-1">
            <i className="bi bi-arrow-clockwise"></i>
            <span>Refresh</span>
          </button>
          <Link to="/doctor/search" className="btn btn-primary-gradient btn-sm d-flex align-items-center gap-1">
            <i className="bi bi-search"></i>
            <span>New Request</span>
          </Link>
        </div>
      </div>

      {/* Status Filter Buttons */}
      <div className="d-flex flex-wrap gap-2 mb-3">
        {["all", "pending", "granted", "rejected", "revoked"].map((filter) => (
          <button
            key={filter}
            type="button"
            className={`btn btn-sm ${
              statusFilter === filter ? "btn-primary" : "btn-outline-secondary"
            } text-capitalize`}
            onClick={() => setStatusFilter(filter)}
          >
            {filter} ({filter === "all" ? requests.length : requests.filter((r) => r.status === filter).length})
          </button>
        ))}
      </div>

      {/* Requests Table */}
      <div className="card border-0 shadow-sm p-4">
        {loading ? (
          <Loader message="Loading requests..." />
        ) : filteredRequests.length === 0 ? (
          <div className="text-center py-5 text-muted">
            <i className="bi bi-inbox fs-1 d-block mb-2 opacity-50"></i>
            <h6>No requests found in this category</h6>
            <p className="small text-muted mb-3">Use the Search Patient portal to request access to records.</p>
            <Link to="/doctor/search" className="btn btn-primary-gradient btn-sm">
              Search Patient
            </Link>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="table-modern">
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>Reason</th>
                  <th>Requested Date</th>
                  <th>Status</th>
                  <th>Request Tx</th>
                  <th>Response Tx</th>
                  <th className="text-end">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredRequests.map((req) => (
                  <tr key={req._id}>
                    <td>
                      <div className="fw-semibold text-dark">{req.patient?.name || "Patient"}</div>
                      <span className="font-monospace small text-primary">{req.patient?.patientId}</span>
                    </td>
                    <td>
                      <span className="text-dark small">{req.reason}</span>
                    </td>
                    <td>
                      <span className="text-muted small">{formatDate(req.createdAt)}</span>
                    </td>
                    <td>
                      <StatusBadge status={req.status} />
                    </td>
                    <td>
                      <TxLink txHash={req.requestTxHash} />
                    </td>
                    <td>
                      {req.revokeTxHash ? (
                        <div>
                          <TxLink txHash={req.revokeTxHash} />
                          <span className="badge bg-danger-subtle text-danger ms-1" style={{ fontSize: "0.65rem" }}>
                            Revoked
                          </span>
                        </div>
                      ) : req.responseTxHash ? (
                        <TxLink txHash={req.responseTxHash} />
                      ) : (
                        <span className="text-muted small">—</span>
                      )}
                    </td>
                    <td className="text-end">
                      {req.status === "granted" && (
                        <Link
                          to={`/doctor/records?patientId=${req.patient?.patientId}`}
                          className="btn btn-sm btn-outline-success"
                        >
                          View Records
                        </Link>
                      )}
                      {req.status === "pending" && (
                        <span className="text-muted small">
                          <i className="bi bi-hourglass-split me-1 text-warning"></i> Awaiting decision
                        </span>
                      )}
                      {req.status === "revoked" && (
                        <span className="text-danger small">
                          <i className="bi bi-lock-fill me-1"></i> Access Terminated
                        </span>
                      )}
                      {req.status === "rejected" && (
                        <span className="text-danger small">
                          <i className="bi bi-x-circle me-1"></i> Declined
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
    </div>
  );
}
