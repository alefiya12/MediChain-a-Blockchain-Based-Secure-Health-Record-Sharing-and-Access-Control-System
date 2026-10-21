import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api, { getErrorMessage } from "../../api/axios";
import { useWallet } from "../../context/WalletContext";
import { getContract, sendTx } from "../../blockchain/contract";
import TxLink from "../../components/TxLink";
import { formatBytes } from "../../utils/format";
import { toast } from "react-toastify";

const ALLOWED_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png"];
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

const CATEGORIES = [
  { value: "prescription", label: "Prescription" },
  { value: "lab_report", label: "Laboratory Report" },
  { value: "diagnosis_report", label: "Diagnosis Report" },
  { value: "scan_report", label: "Scan / Radiology Report" },
  { value: "discharge_summary", label: "Discharge Summary" }
];

export default function UploadRecord() {
  const { account, signer, isAmoy } = useWallet();
  const navigate = useNavigate();

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("prescription");
  const [description, setDescription] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);

  // Flow progression state
  const [currentStep, setCurrentStep] = useState(1); // 1 = Form, 2 = Encrypted (Awaiting Chain), 3 = Confirmed
  const [uploading, setUploading] = useState(false);
  const [chainPending, setChainPending] = useState(false);
  const [createdRecord, setCreatedRecord] = useState(null);
  const [confirmedTxHash, setConfirmedTxHash] = useState(null);
  const [chainError, setChainError] = useState(null);

  // File selection & validation
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) {
      setSelectedFile(null);
      return;
    }

    // Type validation
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      toast.error("Invalid file format. Only PDF, JPG, and PNG files are accepted.");
      e.target.value = "";
      setSelectedFile(null);
      return;
    }

    // Size validation
    if (file.size > MAX_FILE_SIZE_BYTES) {
      toast.error(`File is too large (${formatBytes(file.size)}). Maximum allowed size is 10 MB.`);
      e.target.value = "";
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);
  };

  // Submit Upload Flow
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!selectedFile) {
      toast.warn("Please select a file to upload.");
      return;
    }

    if (!account) {
      toast.warn("Please connect your MetaMask wallet before uploading.");
      return;
    }

    if (!isAmoy) {
      toast.warn("Please switch your MetaMask network to Polygon Amoy.");
      return;
    }

    setUploading(true);
    setChainError(null);

    let uploadData = null;

    // Step 1: Upload & Encrypt on Backend
    try {
      const formData = new FormData();
      formData.append("title", title.trim());
      formData.append("category", category);
      if (description.trim()) {
        formData.append("description", description.trim());
      }
      formData.append("file", selectedFile);

      const res = await api.post("/records", formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });

      if (res.data?.success && res.data?.data) {
        uploadData = res.data.data;
        setCreatedRecord(uploadData.record);
        setCurrentStep(2);
        toast.success("File encrypted with AES-256-GCM! Now confirm on Polygon Amoy.");
      } else {
        throw new Error("File upload failed.");
      }
    } catch (err) {
      toast.error(getErrorMessage(err));
      setUploading(false);
      return;
    } finally {
      setUploading(false);
    }

    // Step 2 & 3: Prompt On-Chain Transaction & Confirm
    await executeChainRegistration(uploadData.record, uploadData.recordIdOnChain, uploadData.fileHash);
  };

  // Execute on-chain registerRecord and backend confirm
  const executeChainRegistration = async (record, recordIdOnChain, fileHash) => {
    setChainPending(true);
    setChainError(null);

    try {
      const contract = getContract(signer);

      toast.info("Please confirm the registerRecord transaction in MetaMask...", { autoClose: 5000 });

      // Call registerRecord(recordIdOnChain, fileHash) on Polygon Amoy
      const { txHash } = await sendTx(() => contract.registerRecord(recordIdOnChain, fileHash));

      toast.info("Transaction confirmed on Amoy! Verifying receipt with backend...");

      // Call backend POST /api/records/:id/confirm
      const confirmRes = await api.post(`/records/${record._id}/confirm`, { txHash });

      if (confirmRes.data?.success) {
        setConfirmedTxHash(txHash);
        setCurrentStep(3);
        toast.success("Medical record hash anchored on blockchain and confirmed!");
      }
    } catch (err) {
      setChainError(getErrorMessage(err));
      toast.warning("Blockchain registration was not completed. Record remains in 'pending' status.");
    } finally {
      setChainPending(false);
    }
  };

  return (
    <div>
      {/* Title */}
      <div className="d-flex flex-wrap justify-content-between align-items-center mb-4 gap-3">
        <div>
          <h2 className="fw-bold mb-1">Upload Encrypted Medical Record</h2>
          <p className="text-muted mb-0">Files are encrypted with AES-256-GCM and cryptographic SHA-256 hashes are anchored on Polygon Amoy</p>
        </div>
        <Link to="/patient/records" className="btn btn-outline-secondary btn-sm">
          <i className="bi bi-folder2-open me-1"></i> My Records
        </Link>
      </div>

      {/* Upload Wizard Card */}
      <div className="card p-4 p-md-5 border-0 shadow-sm" style={{ maxWidth: "720px" }}>
        {/* Step Progression Indicators */}
        <div className="d-flex align-items-center justify-content-between mb-4 border-bottom pb-3">
          <div className="d-flex align-items-center gap-2">
            <span className={`badge rounded-circle p-2 ${currentStep >= 1 ? "bg-primary" : "bg-secondary"}`}>1</span>
            <span className="fw-semibold small">Upload & Encrypt</span>
          </div>
          <i className="bi bi-arrow-right text-muted"></i>
          <div className="d-flex align-items-center gap-2">
            <span className={`badge rounded-circle p-2 ${currentStep >= 2 ? (currentStep === 3 ? "bg-success" : "bg-warning") : "bg-secondary"}`}>2</span>
            <span className="fw-semibold small">Anchor on Blockchain</span>
          </div>
          <i className="bi bi-arrow-right text-muted"></i>
          <div className="d-flex align-items-center gap-2">
            <span className={`badge rounded-circle p-2 ${currentStep === 3 ? "bg-success" : "bg-secondary"}`}>3</span>
            <span className="fw-semibold small">Confirmed</span>
          </div>
        </div>

        {/* Step 1: Initial Form */}
        {currentStep === 1 && (
          <form onSubmit={handleSubmit}>
            {/* Record Title */}
            <div className="mb-3">
              <label className="form-label small fw-semibold">Record Title *</label>
              <input
                type="text"
                className="form-control"
                placeholder="e.g. Annual Cardiac Examination Report"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                id="record-title-input"
              />
            </div>

            {/* Category */}
            <div className="mb-3">
              <label className="form-label small fw-semibold">Record Category *</label>
              <select
                className="form-select"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                required
                id="record-category-select"
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat.value} value={cat.value}>
                    {cat.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Description */}
            <div className="mb-3">
              <label className="form-label small fw-semibold">Clinical Notes / Description</label>
              <textarea
                className="form-control"
                rows="2"
                placeholder="Optional notes or clinical summary..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            {/* File Upload Box */}
            <div className="mb-4">
              <label className="form-label small fw-semibold">Select Document (PDF, JPG, PNG) *</label>
              <input
                type="file"
                className="form-control"
                accept=".pdf,image/jpeg,image/png"
                onChange={handleFileChange}
                required
                id="record-file-input"
              />
              <div className="d-flex justify-content-between mt-1 text-muted" style={{ fontSize: "0.75rem" }}>
                <span>Allowed: PDF, JPEG, PNG</span>
                <span>Max size: 10 MB</span>
              </div>
            </div>

            <div className="p-3 bg-light rounded-3 border mb-4 small text-secondary">
              <i className="bi bi-shield-lock-fill text-primary me-2"></i>
              <strong>Zero-Knowledge Security:</strong> Plaintext files are hashed and encrypted client-to-server with AES-256-GCM. Unencrypted documents are never exposed on any public blockchain or decentralized storage.
            </div>

            <button
              type="submit"
              className="btn btn-primary-gradient w-100 py-2 d-flex align-items-center justify-content-center gap-2"
              disabled={uploading}
              id="submit-upload-record-btn"
            >
              {uploading && <span className="spinner-border spinner-border-sm" role="status" />}
              <span>{uploading ? "Encrypting & Uploading File..." : "Encrypt & Register On-Chain"}</span>
            </button>
          </form>
        )}

        {/* Step 2: Encrypted, Pending Blockchain Signing */}
        {currentStep === 2 && (
          <div className="py-3">
            <div className="text-center mb-4">
              <div className="spinner-border text-warning mb-3" style={{ width: "3rem", height: "3rem" }} role="status" />
              <h5 className="fw-bold">Waiting for Blockchain Confirmation…</h5>
              <p className="text-muted small">
                Your file has been encrypted. Please confirm the <code>registerRecord</code> transaction in your MetaMask wallet.
              </p>
            </div>

            {chainError && (
              <div className="alert alert-warning border-warning p-3 mb-4" role="alert">
                <div className="fw-bold mb-1">
                  <i className="bi bi-exclamation-triangle-fill text-warning me-2"></i>
                  Blockchain Registration Unconfirmed
                </div>
                <p className="small mb-2">{chainError}</p>
                <div className="d-flex gap-2">
                  <button
                    type="button"
                    className="btn btn-sm btn-warning"
                    onClick={() =>
                      executeChainRegistration(
                        createdRecord,
                        createdRecord?.recordIdOnChain,
                        createdRecord?.fileHash
                      )
                    }
                    disabled={chainPending}
                  >
                    Retry Blockchain Registration
                  </button>
                  <Link to="/patient/records" className="btn btn-sm btn-outline-secondary">
                    View in My Records
                  </Link>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 3: Success State */}
        {currentStep === 3 && (
          <div className="py-3 text-center">
            <div
              className="d-inline-flex align-items-center justify-content-center rounded-circle bg-success-subtle text-success mb-3"
              style={{ width: "64px", height: "64px" }}
            >
              <i className="bi bi-check-lg display-5"></i>
            </div>
            <h4 className="fw-bold text-success mb-1">Record Anchored Successfully!</h4>
            <p className="text-muted small mb-4">
              <strong>{createdRecord?.title}</strong> is encrypted at rest and its SHA-256 fingerprint is verified on Polygon Amoy.
            </p>

            <div className="p-3 bg-light rounded-3 border text-start mb-4 font-monospace small">
              <div className="mb-1">
                <strong>Record ID:</strong> {createdRecord?._id}
              </div>
              <div className="mb-1">
                <strong>File Hash:</strong> {createdRecord?.fileHash}
              </div>
              <div>
                <strong>Blockchain Tx:</strong> <TxLink txHash={confirmedTxHash} truncate={false} />
              </div>
            </div>

            <div className="d-flex justify-content-center gap-3">
              <button
                type="button"
                className="btn btn-outline-primary"
                onClick={() => {
                  setTitle("");
                  setDescription("");
                  setSelectedFile(null);
                  setCurrentStep(1);
                  setCreatedRecord(null);
                  setConfirmedTxHash(null);
                }}
              >
                <i className="bi bi-plus-lg me-1"></i> Upload Another
              </button>
              <Link to="/patient/records" className="btn btn-primary-gradient">
                Go to My Records <i className="bi bi-arrow-right ms-1"></i>
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
