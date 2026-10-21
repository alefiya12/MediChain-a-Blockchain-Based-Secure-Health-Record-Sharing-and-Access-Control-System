import React, { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import api, { getErrorMessage } from "../../api/axios";
import { useWallet } from "../../context/WalletContext";
import { getContract, sendTx } from "../../blockchain/contract";
import StatusBadge from "../../components/StatusBadge";
import TxLink from "../../components/TxLink";
import Loader from "../../components/Loader";
import { formatDate, formatBytes, truncateAddress } from "../../utils/format";
import { toast } from "react-toastify";
import { Modal, Button } from "react-bootstrap";

const CATEGORY_OPTIONS = [
  { value: "all", label: "All Categories" },
  { value: "prescription", label: "Prescriptions" },
  { value: "lab_report", label: "Lab Reports" },
  { value: "diagnosis_report", label: "Diagnosis Reports" },
  { value: "scan_report", label: "Scan / Radiology" },
  { value: "discharge_summary", label: "Discharge Summaries" }
];

export default function MyRecords() {
  const { account, signer, isAmoy } = useWallet();

  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Action states
  const [downloadingId, setDownloadingId] = useState(null);
  const [verifyingId, setVerifyingId] = useState(null);
  const [retryingId, setRetryingId] = useState(null);

  // Verification result modal
  const [verifyModal, setVerifyModal] = useState({
    show: false,
    record: null,
    data: null,
    loading: false
  });

  // Fetch records
  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/records/mine");
      if (res.data?.success && Array.isArray(res.data?.data?.records)) {
        setRecords(res.data.data.records);
      }
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  // Download record (decrypted server-side, streamed as blob)
  const handleDownload = async (record) => {
    setDownloadingId(record._id);
    try {
      const res = await api.get(`/records/${record._id}/download`, {
        responseType: "blob"
      });

      const blob = new Blob([res.data], { type: record.mimeType || "application/pdf" });
      const url = window.URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = record.originalName || `${record.title}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast.success(`Decrypted and downloaded "${record.title}"`);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setDownloadingId(null);
    }
  };

  // Verify integrity on-chain
  const handleVerify = async (record) => {
    setVerifyingId(record._id);
    setVerifyModal({
      show: true,
      record,
      data: null,
      loading: true
    });

    try {
      const res = await api.post(`/records/${record._id}/verify`);
      if (res.data?.success && res.data?.data) {
        setVerifyModal({
          show: true,
          record,
          data: res.data.data,
          loading: false
        });

        if (res.data.data.status === "VERIFIED") {
          toast.success("✅ Record verified! Decrypted content matches blockchain hash.");
        } else {
          toast.error("❌ Integrity check failed! Record has been tampered with.");
        }
      }
    } catch (err) {
      toast.error(getErrorMessage(err));
      setVerifyModal({
        show: false,
        record: null,
        data: null,
        loading: false
      });
    } finally {
      setVerifyingId(null);
    }
  };

  // Retry blockchain anchoring for pending records
  const handleRetryRegistration = async (record) => {
    if (!account) {
      toast.warn("Please connect MetaMask to register on-chain.");
      return;
    }
    if (!isAmoy) {
      toast.warn("Please switch MetaMask network to Polygon Amoy.");
      return;
    }

    setRetryingId(record._id);
    try {
      const contract = getContract(signer);
      toast.info("Waiting for blockchain confirmation… Please confirm in MetaMask.");

      const { txHash } = await sendTx(() =>
        contract.registerRecord(record.recordIdOnChain, record.fileHash)
      );

      toast.info("Anchor transaction submitted. Confirming with backend...");

      const confirmRes = await api.post(`/records/${record._id}/confirm`, { txHash });
      if (confirmRes.data?.success) {
        toast.success("Medical record anchored on Polygon Amoy and confirmed!");
        fetchRecords();
      }
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setRetryingId(null);
    }
  };

  // Filter & Search
  const filteredRecords = records.filter((r) => {
    const matchesCategory =
      selectedCategory === "all" || r.category === selectedCategory;
    const q = searchQuery.toLowerCase().trim();
    const matchesQuery =
      !q ||
      r.title.toLowerCase().includes(q) ||
      (r.description && r.description.toLowerCase().includes(q)) ||
      (r.originalName && r.originalName.toLowerCase().includes(q));
    return matchesCategory && matchesQuery;
  });

  const totalCount = records.length;
  const confirmedCount = records.filter((r) => r.chainStatus === "confirmed").length;
  const pendingCount = records.filter((r) => r.chainStatus === "pending").length;

  return (
    <div>
      {/* Header */}
      <div className="d-flex flex-wrap justify-content-between align-items-center mb-4 gap-3">
        <div>
          <h2 className="fw-bold mb-1">My Medical Records</h2>
          <p className="text-muted mb-0">
            Encrypted diagnostic reports, prescriptions, and lab files anchored on-chain
          </p>
        </div>
        <div className="d-flex align-items-center gap-2">
          <button
            onClick={fetchRecords}
            className="btn btn-outline-secondary btn-sm d-flex align-items-center gap-1"
            disabled={loading}
          >
            <i className="bi bi-arrow-clockwise"></i>
            <span>Refresh</span>
          </button>
          <Link
            to="/patient/upload"
            className="btn btn-primary-gradient btn-sm d-flex align-items-center gap-2"
          >
            <i className="bi bi-cloud-arrow-up"></i>
            <span>Upload New Record</span>
          </Link>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="row g-3 mb-4">
        <div className="col-md-4">
          <div className="card p-3 border-0 shadow-sm bg-white">
            <div className="d-flex align-items-center justify-content-between">
              <div>
                <span className="text-muted small fw-medium">Total Stored</span>
                <h4 className="fw-bold mb-0 mt-1">{totalCount}</h4>
              </div>
              <div className="p-3 rounded-circle bg-primary-subtle text-primary">
                <i className="bi bi-files fs-5"></i>
              </div>
            </div>
          </div>
        </div>

        <div className="col-md-4">
          <div className="card p-3 border-0 shadow-sm bg-white">
            <div className="d-flex align-items-center justify-content-between">
              <div>
                <span className="text-muted small fw-medium">Confirmed on Chain</span>
                <h4 className="fw-bold mb-0 mt-1 text-success">{confirmedCount}</h4>
              </div>
              <div className="p-3 rounded-circle bg-success-subtle text-success">
                <i className="bi bi-shield-check fs-5"></i>
              </div>
            </div>
          </div>
        </div>

        <div className="col-md-4">
          <div className="card p-3 border-0 shadow-sm bg-white">
            <div className="d-flex align-items-center justify-content-between">
              <div>
                <span className="text-muted small fw-medium">Pending Anchoring</span>
                <h4 className="fw-bold mb-0 mt-1 text-warning">{pendingCount}</h4>
              </div>
              <div className="p-3 rounded-circle bg-warning-subtle text-warning">
                <i className="bi bi-hourglass-split fs-5"></i>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Filters & Search Card */}
      <div className="card p-3 border-0 shadow-sm mb-4 bg-white">
        <div className="row g-3 align-items-center">
          <div className="col-md-4">
            <div className="input-group">
              <span className="input-group-text bg-light border-end-0">
                <i className="bi bi-search text-muted"></i>
              </span>
              <input
                type="text"
                className="form-control bg-light border-start-0"
                placeholder="Search by title or filename..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="col-md-4">
            <select
              className="form-select"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
            >
              {CATEGORY_OPTIONS.map((cat) => (
                <option key={cat.value} value={cat.value}>
                  {cat.label}
                </option>
              ))}
            </select>
          </div>

          <div className="col-md-4 text-md-end text-muted small">
            Showing <strong>{filteredRecords.length}</strong> of {totalCount} records
          </div>
        </div>
      </div>

      {/* Main Table / Content */}
      {loading ? (
        <Loader message="Loading your encrypted records..." />
      ) : filteredRecords.length === 0 ? (
        <div className="card p-5 text-center border-0 shadow-sm bg-white">
          <i className="bi bi-folder2-open display-4 text-muted mb-3 opacity-50"></i>
          <h5 className="fw-bold">No Medical Records Found</h5>
          <p className="text-muted small mx-auto mb-4" style={{ maxWidth: "420px" }}>
            {searchQuery || selectedCategory !== "all"
              ? "No records match your search filter criteria. Try resetting your search."
              : "You haven't uploaded any medical records yet. Encrypt and anchor your first record now."}
          </p>
          <div>
            <Link to="/patient/upload" className="btn btn-primary-gradient btn-sm">
              <i className="bi bi-cloud-arrow-up me-1"></i> Upload First Record
            </Link>
          </div>
        </div>
      ) : (
        <div className="card border-0 shadow-sm overflow-hidden bg-white">
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0">
              <thead className="table-light text-muted small text-uppercase">
                <tr>
                  <th style={{ width: "32%" }}>Record Details</th>
                  <th style={{ width: "16%" }}>Category</th>
                  <th style={{ width: "16%" }}>Chain Status</th>
                  <th style={{ width: "16%" }}>Tx Hash</th>
                  <th style={{ width: "20%" }} className="text-end">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.map((rec) => {
                  const isPending = rec.chainStatus === "pending";
                  const isDownloading = downloadingId === rec._id;
                  const isVerifying = verifyingId === rec._id;
                  const isRetrying = retryingId === rec._id;

                  return (
                    <tr key={rec._id}>
                      <td>
                        <div className="d-flex align-items-center gap-3">
                          <div className="p-2 rounded bg-light text-primary">
                            <i
                              className={`bi ${
                                rec.mimeType?.includes("image")
                                  ? "bi-file-earmark-image"
                                  : "bi-file-earmark-pdf"
                              } fs-4`}
                            ></i>
                          </div>
                          <div>
                            <span className="fw-bold d-block text-dark">{rec.title}</span>
                            <span className="text-muted small d-inline-block text-truncate" style={{ maxWidth: "240px" }}>
                              {rec.originalName} ({formatBytes(rec.fileSize)})
                            </span>
                            <span className="d-block text-muted" style={{ fontSize: "0.75rem" }}>
                              Uploaded: {formatDate(rec.createdAt)}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td>
                        <span className="badge bg-secondary-subtle text-secondary text-capitalize px-2 py-1">
                          {rec.category ? rec.category.replace(/_/g, " ") : "general"}
                        </span>
                      </td>

                      <td>
                        <div className="d-flex flex-column align-items-start gap-1">
                          <StatusBadge status={rec.chainStatus} />
                          {isPending && (
                            <span className="text-warning small" style={{ fontSize: "0.72rem" }}>
                              Hash not yet confirmed on chain
                            </span>
                          )}
                        </div>
                      </td>

                      <td>
                        {rec.txHash ? (
                          <TxLink txHash={rec.txHash} />
                        ) : (
                          <span className="text-muted small fst-italic">Pending tx</span>
                        )}
                      </td>

                      <td className="text-end">
                        <div className="d-inline-flex align-items-center gap-2">
                          {/* Pending Retry Button */}
                          {isPending ? (
                            <button
                              type="button"
                              onClick={() => handleRetryRegistration(rec)}
                              className="btn btn-warning btn-sm d-flex align-items-center gap-1 shadow-sm"
                              disabled={isRetrying}
                              title="Sign and anchor SHA-256 hash on Polygon Amoy"
                            >
                              {isRetrying ? (
                                <>
                                  <span className="spinner-border spinner-border-sm" role="status" />
                                  <span>Anchoring...</span>
                                </>
                              ) : (
                                <>
                                  <i className="bi bi-arrow-repeat"></i>
                                  <span>Retry Anchor</span>
                                </>
                              )}
                            </button>
                          ) : (
                            <>
                              {/* Verify Integrity Button */}
                              <button
                                type="button"
                                onClick={() => handleVerify(rec)}
                                className="btn btn-outline-info btn-sm d-flex align-items-center gap-1"
                                disabled={isVerifying}
                                title="Verify record integrity against Polygon Amoy anchor"
                              >
                                {isVerifying ? (
                                  <span className="spinner-border spinner-border-sm" role="status" />
                                ) : (
                                  <i className="bi bi-patch-check"></i>
                                )}
                                <span>Verify</span>
                              </button>

                              {/* Download Button */}
                              <button
                                type="button"
                                onClick={() => handleDownload(rec)}
                                className="btn btn-outline-primary btn-sm d-flex align-items-center gap-1"
                                disabled={isDownloading}
                                title="Download decrypted medical file"
                              >
                                {isDownloading ? (
                                  <span className="spinner-border spinner-border-sm" role="status" />
                                ) : (
                                  <i className="bi bi-download"></i>
                                )}
                                <span>Download</span>
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Integrity Verification Modal */}
      <Modal
        show={verifyModal.show}
        onHide={() => setVerifyModal({ show: false, record: null, data: null, loading: false })}
        centered
        size="lg"
      >
        <Modal.Header closeButton>
          <Modal.Title className="h5 fw-bold d-flex align-items-center gap-2">
            <i className="bi bi-patch-check text-primary"></i>
            <span>Cryptographic Integrity Verification</span>
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {verifyModal.loading ? (
            <div className="py-5 text-center">
              <span className="spinner-border text-primary mb-3" role="status" />
              <p className="text-muted fw-medium mb-0">
                Fetching on-chain hash from Polygon Amoy and re-hashing decrypted ciphertext...
              </p>
            </div>
          ) : verifyModal.data ? (
            <div>
              {/* Status Banner */}
              <div
                className={`alert d-flex align-items-center gap-3 mb-4 ${
                  verifyModal.data.status === "VERIFIED"
                    ? "alert-success border-success"
                    : "alert-danger border-danger"
                }`}
              >
                <i
                  className={`bi ${
                    verifyModal.data.status === "VERIFIED"
                      ? "bi-check-circle-fill text-success"
                      : "bi-exclamation-triangle-fill text-danger"
                  } display-6`}
                ></i>
                <div>
                  <h5 className="fw-bold mb-1">
                    {verifyModal.data.status === "VERIFIED"
                      ? "INTEGRITY VERIFIED ✅"
                      : "TAMPER DETECTED ❌"}
                  </h5>
                  <p className="mb-0 small">
                    {verifyModal.data.status === "VERIFIED"
                      ? "The decrypted file SHA-256 hash precisely matches the immutable record anchored on the Polygon Amoy blockchain. No alterations or unauthorized modifications have occurred."
                      : "The decrypted file SHA-256 hash DOES NOT match the blockchain anchor or database record. This file may have been modified or corrupted."}
                  </p>
                </div>
              </div>

              {/* Record Summary */}
              <div className="card bg-light border-0 p-3 mb-4">
                <div className="row g-2 small">
                  <div className="col-sm-4 text-muted">Record Title:</div>
                  <div className="col-sm-8 fw-semibold">{verifyModal.record?.title}</div>

                  <div className="col-sm-4 text-muted">Original File:</div>
                  <div className="col-sm-8">{verifyModal.record?.originalName}</div>

                  <div className="col-sm-4 text-muted">Verified At:</div>
                  <div className="col-sm-8">{formatDate(verifyModal.data.verifiedAt || new Date())}</div>

                  <div className="col-sm-4 text-muted">Registered On-Chain:</div>
                  <div className="col-sm-8">
                    {verifyModal.data.chainRegistered ? (
                      <span className="text-success fw-semibold">Yes (Active on Smart Contract)</span>
                    ) : (
                      <span className="text-danger fw-semibold">No</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Cryptographic Hashes Comparison */}
              <div className="mb-2">
                <h6 className="fw-bold text-dark mb-2">Cryptographic Hash Comparison</h6>

                <div className="mb-3">
                  <label className="text-muted small fw-medium d-block mb-1">
                    Computed SHA-256 (Decrypted Plaintext Re-hash)
                  </label>
                  <div className="p-2 bg-light rounded font-monospace small text-break border">
                    {verifyModal.data.localHash || verifyModal.data.currentFileHash || "N/A"}
                  </div>
                </div>

                <div className="mb-3">
                  <label className="text-muted small fw-medium d-block mb-1">
                    Anchored Blockchain Hash (Polygon Amoy Contract)
                  </label>
                  <div className="p-2 bg-light rounded font-monospace small text-break border">
                    {verifyModal.data.chainHash || verifyModal.data.chainFileHash || "N/A"}
                  </div>
                </div>

                <div>
                  <label className="text-muted small fw-medium d-block mb-1">
                    Database Recorded Hash
                  </label>
                  <div className="p-2 bg-light rounded font-monospace small text-break border">
                    {verifyModal.data.dbHash || verifyModal.data.dbFileHash || "N/A"}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-muted text-center py-4">No verification data available.</p>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="secondary"
            onClick={() => setVerifyModal({ show: false, record: null, data: null, loading: false })}
          >
            Close
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}
