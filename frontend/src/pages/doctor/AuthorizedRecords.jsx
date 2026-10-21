import React, { useState, useEffect, useCallback } from "react";
import { useSearchParams, Link } from "react-router-dom";
import api, { getErrorMessage } from "../../api/axios";
import StatusBadge from "../../components/StatusBadge";
import TxLink from "../../components/TxLink";
import Loader from "../../components/Loader";
import { formatDate, formatBytes } from "../../utils/format";
import { toast } from "react-toastify";

export default function AuthorizedRecords() {
  const [searchParams, setSearchParams] = useSearchParams();
  const preselectedPatientId = searchParams.get("patientId");

  const [authorizedPatients, setAuthorizedPatients] = useState([]);
  const [patientsLoading, setPatientsLoading] = useState(true);
  const [selectedPatient, setSelectedPatient] = useState(null);

  // Records state
  const [records, setRecords] = useState([]);
  const [recordsLoading, setRecordsLoading] = useState(false);

  // Download & Verify states
  const [downloadingId, setDownloadingId] = useState(null);
  const [verifyingId, setVerifyingId] = useState(null);
  const [verifyResult, setVerifyResult] = useState(null);

  // Fetch authorized patients list (checked against blockchain)
  const fetchAuthorizedPatients = useCallback(async () => {
    setPatientsLoading(true);
    try {
      const res = await api.get("/doctor/authorized-patients");
      if (res.data?.success && Array.isArray(res.data?.data?.authorizedPatients)) {
        const patients = res.data.data.authorizedPatients;
        setAuthorizedPatients(patients);

        // Preselect if param was provided, else default to first
        if (preselectedPatientId) {
          const match = patients.find((p) => p.patient.patientId === preselectedPatientId);
          if (match) {
            setSelectedPatient(match.patient);
          } else if (patients.length > 0) {
            setSelectedPatient(patients[0].patient);
          }
        } else if (patients.length > 0) {
          setSelectedPatient(patients[0].patient);
        }
      }
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setPatientsLoading(false);
    }
  }, [preselectedPatientId]);

  // Fetch records for selected patient
  const fetchPatientRecords = useCallback(async (patientId) => {
    if (!patientId) return;
    setRecordsLoading(true);
    setVerifyResult(null);
    try {
      const res = await api.get(`/doctor/patients/${patientId}/records`);
      if (res.data?.success && Array.isArray(res.data?.data?.records)) {
        setRecords(res.data.data.records);
      }
    } catch (err) {
      toast.error(getErrorMessage(err));
      setRecords([]);
    } finally {
      setRecordsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAuthorizedPatients();
  }, [fetchAuthorizedPatients]);

  useEffect(() => {
    if (selectedPatient) {
      fetchPatientRecords(selectedPatient.patientId);
    } else {
      setRecords([]);
    }
  }, [selectedPatient, fetchPatientRecords]);

  // Handle patient selection change
  const handleSelectPatient = (patient) => {
    setSelectedPatient(patient);
    setSearchParams({ patientId: patient.patientId });
  };

  // View / Download Record (decrypted on backend, streamed as blob)
  const handleDownload = async (record) => {
    setDownloadingId(record._id);
    try {
      const res = await api.get(`/records/${record._id}/download`, {
        responseType: "blob"
      });

      const blob = new Blob([res.data], { type: record.mimeType || "application/pdf" });
      const url = window.URL.createObjectURL(blob);

      // Open in a new tab
      const newTab = window.open(url, "_blank");
      if (!newTab) {
        // Pop-up blocked fallback: trigger direct download
        const a = document.createElement("a");
        a.href = url;
        a.download = record.originalName || "medical_record.pdf";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }

      toast.success(`Decrypted and loaded ${record.title}`);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setDownloadingId(null);
    }
  };

  // Verify Record Integrity (compares local decrypted rehash with on-chain hash)
  const handleVerify = async (record) => {
    setVerifyingId(record._id);
    try {
      const res = await api.post(`/records/${record._id}/verify`);
      if (res.data?.success && res.data?.data) {
        setVerifyResult({
          recordId: record._id,
          title: record.title,
          ...res.data.data
        });

        if (res.data.data.status === "VERIFIED") {
          toast.success("✅ Record verified! Plaintext hash matches blockchain anchor.");
        } else {
          toast.error("❌ Warning: Record has been tampered with!");
        }
      }
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setVerifyingId(null);
    }
  };

  return (
    <div>
      {/* Title */}
      <div className="d-flex flex-wrap justify-content-between align-items-center mb-4 gap-3">
        <div>
          <h2 className="fw-bold mb-1">Authorized Patient Records</h2>
          <p className="text-muted mb-0">Browse and inspect diagnostic files for patients with active consent</p>
        </div>
        <button onClick={fetchAuthorizedPatients} className="btn btn-outline-secondary btn-sm d-flex align-items-center gap-1">
          <i className="bi bi-arrow-clockwise"></i>
          <span>Refresh Authorization</span>
        </button>
      </div>

      {patientsLoading ? (
        <Loader message="Checking on-chain patient authorizations..." />
      ) : authorizedPatients.length === 0 ? (
        <div className="card p-5 text-center border-0 shadow-sm">
          <i className="bi bi-person-x display-4 text-muted mb-3 opacity-50"></i>
          <h5 className="fw-bold">No Authorized Patients Found</h5>
          <p className="text-muted small max-w-md mx-auto mb-3" style={{ maxWidth: "480px" }}>
            You do not currently have active access to any patient records. Search for a patient using their MC-P identifier to request consent on-chain.
          </p>
          <div>
            <Link to="/doctor/search" className="btn btn-primary-gradient btn-sm">
              <i className="bi bi-search me-1"></i> Search Patient
            </Link>
          </div>
        </div>
      ) : (
        <div className="row g-4">
          {/* Patient Selection Column */}
          <div className="col-lg-4">
            <div className="card border-0 shadow-sm p-3 mb-3">
              <h6 className="fw-bold mb-3 text-secondary text-uppercase small" style={{ letterSpacing: "0.05em" }}>
                Authorized Patients ({authorizedPatients.length})
              </h6>
              <div className="list-group list-group-flush">
                {authorizedPatients.map((item) => {
                  const p = item.patient;
                  const isSelected = selectedPatient?.patientId === p.patientId;
                  return (
                    <button
                      key={p.patientId}
                      type="button"
                      className={`list-group-item list-group-item-action p-3 rounded-3 mb-2 border ${
                        isSelected ? "bg-primary-subtle border-primary text-primary" : "bg-light border-light"
                      }`}
                      onClick={() => handleSelectPatient(p)}
                    >
                      <div className="d-flex justify-content-between align-items-center">
                        <strong className="text-dark">{p.name}</strong>
                        <span className="badge bg-success-subtle text-success small">
                          <i className="bi bi-shield-check me-1"></i> Active
                        </span>
                      </div>
                      <div className="font-monospace small text-primary">{p.patientId}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Records Display Column */}
          <div className="col-lg-8">
            {selectedPatient && (
              <div className="card border-0 shadow-sm p-4">
                <div className="d-flex flex-wrap justify-content-between align-items-center border-bottom pb-3 mb-3 gap-2">
                  <div>
                    <h5 className="fw-bold mb-1">
                      Records for <span className="text-primary">{selectedPatient.name}</span>
                    </h5>
                    <span className="font-monospace small text-muted">ID: {selectedPatient.patientId}</span>
                  </div>
                  <span className="badge bg-success-subtle text-success border border-success-subtle px-3 py-2">
                    <i className="bi bi-check-circle-fill me-1"></i> On-Chain Consent Active
                  </span>
                </div>

                {recordsLoading ? (
                  <Loader message="Loading diagnostic files..." />
                ) : records.length === 0 ? (
                  <div className="text-center py-5 text-muted">
                    <i className="bi bi-folder2-open display-4 opacity-50 mb-2 d-block"></i>
                    <h6>No medical records found for this patient</h6>
                    <p className="small text-muted mb-0">The patient has not uploaded any files yet.</p>
                  </div>
                ) : (
                  <div className="table-responsive">
                    <table className="table-modern">
                      <thead>
                        <tr>
                          <th>Record Title</th>
                          <th>Category</th>
                          <th>Size / Date</th>
                          <th>Blockchain</th>
                          <th className="text-end">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {records.map((rec) => (
                          <tr key={rec._id}>
                            <td>
                              <div className="fw-semibold text-dark">{rec.title}</div>
                              <span className="text-muted small" style={{ fontSize: "0.75rem" }}>
                                {rec.originalName}
                              </span>
                            </td>
                            <td>
                              <span className="badge bg-light text-secondary border text-capitalize">
                                {rec.category?.replace("_", " ")}
                              </span>
                            </td>
                            <td>
                              <div className="small text-dark">{formatBytes(rec.sizeBytes)}</div>
                              <span className="text-muted" style={{ fontSize: "0.75rem" }}>
                                {formatDate(rec.createdAt)}
                              </span>
                            </td>
                            <td>
                              <StatusBadge status={rec.chainStatus} />
                            </td>
                            <td className="text-end">
                              <div className="btn-group btn-group-sm">
                                <button
                                  type="button"
                                  className="btn btn-outline-primary d-flex align-items-center gap-1"
                                  onClick={() => handleDownload(rec)}
                                  disabled={downloadingId === rec._id}
                                  title="Decrypt and view file"
                                >
                                  {downloadingId === rec._id ? (
                                    <span className="spinner-border spinner-border-sm" role="status" />
                                  ) : (
                                    <i className="bi bi-eye"></i>
                                  )}
                                  <span>View</span>
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-outline-success d-flex align-items-center gap-1"
                                  onClick={() => handleVerify(rec)}
                                  disabled={verifyingId === rec._id}
                                  title="Cryptographically verify file integrity with smart contract"
                                >
                                  {verifyingId === rec._id ? (
                                    <span className="spinner-border spinner-border-sm" role="status" />
                                  ) : (
                                    <i className="bi bi-shield-check"></i>
                                  )}
                                  <span>Verify</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Verification Result Drawer */}
                {verifyResult && (
                  <div
                    className={`mt-4 p-3 rounded-3 border ${
                      verifyResult.status === "VERIFIED"
                        ? "bg-success-subtle border-success text-success-emphasis"
                        : "bg-danger-subtle border-danger text-danger-emphasis"
                    }`}
                  >
                    <div className="d-flex justify-content-between align-items-center mb-2">
                      <div className="d-flex align-items-center gap-2 fw-bold">
                        <i
                          className={`bi ${
                            verifyResult.status === "VERIFIED"
                              ? "bi-check-circle-fill text-success fs-5"
                              : "bi-x-octagon-fill text-danger fs-5"
                          }`}
                        ></i>
                        <span>
                          {verifyResult.status === "VERIFIED"
                            ? `INTEGRITY VERIFIED: ${verifyResult.title}`
                            : `TAMPER DETECTED: ${verifyResult.title}`}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="btn-close btn-sm"
                        onClick={() => setVerifyResult(null)}
                      ></button>
                    </div>

                    <div className="font-monospace small" style={{ fontSize: "0.785rem" }}>
                      <div className="mb-1">
                        <strong>Decrypted Recomputed Hash:</strong>{" "}
                        <span className="text-break">{verifyResult.localHash || "N/A"}</span>
                      </div>
                      <div className="mb-1">
                        <strong>On-Chain Anchored Hash:</strong>{" "}
                        <span className="text-break">{verifyResult.chainHash || "N/A"}</span>
                      </div>
                      <div>
                        <strong>Database Stored Hash:</strong>{" "}
                        <span className="text-break">{verifyResult.dbHash || "N/A"}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
