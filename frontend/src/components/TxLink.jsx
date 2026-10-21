import React, { useState } from "react";
import { getTxUrl, truncateTx } from "../utils/format";

export default function TxLink({ txHash, truncate = true }) {
  const [copied, setCopied] = useState(false);

  if (!txHash) {
    return <span className="text-muted small">N/A</span>;
  }

  const handleCopy = (e) => {
    e.preventDefault();
    navigator.clipboard.writeText(txHash);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <span className="d-inline-flex align-items-center gap-1 font-monospace small">
      <a
        href={getTxUrl(txHash)}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary text-decoration-none"
        title="View on Polygonscan (Amoy)"
      >
        {truncate ? truncateTx(txHash) : txHash}
        <i className="bi bi-box-arrow-up-right ms-1" style={{ fontSize: "0.7rem" }}></i>
      </a>
      <button
        type="button"
        onClick={handleCopy}
        className="btn btn-link btn-sm p-0 text-muted ms-1"
        title={copied ? "Copied!" : "Copy transaction hash"}
        style={{ lineHeight: 1 }}
      >
        <i className={`bi ${copied ? "bi-check text-success" : "bi-copy"}`} style={{ fontSize: "0.75rem" }}></i>
      </button>
    </span>
  );
}
