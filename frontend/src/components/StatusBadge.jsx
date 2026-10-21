import React from "react";

export default function StatusBadge({ status, label }) {
  if (!status) return null;

  const normalized = status.toLowerCase();
  const displayLabel = label || status;

  let badgeClass = "badge-pending";
  let iconClass = "bi-clock-history";

  switch (normalized) {
    case "approved":
    case "confirmed":
    case "granted":
    case "verified":
    case "active":
      badgeClass = "badge-approved";
      iconClass = "bi-check-circle-fill";
      break;

    case "rejected":
    case "revoked":
    case "tampered":
    case "inactive":
      badgeClass = "badge-rejected";
      iconClass = "bi-x-circle-fill";
      break;

    case "pending":
    default:
      badgeClass = "badge-pending";
      iconClass = "bi-hourglass-split";
      break;
  }

  return (
    <span className={`badge-status ${badgeClass}`}>
      <i className={`bi ${iconClass}`} style={{ fontSize: "0.75rem" }}></i>
      {displayLabel}
    </span>
  );
}
