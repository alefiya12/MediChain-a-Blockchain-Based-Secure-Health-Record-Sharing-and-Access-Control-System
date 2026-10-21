import React from "react";

export default function Loader({ message = "Loading...", fullScreen = false }) {
  if (fullScreen) {
    return (
      <div
        className="d-flex flex-column align-items-center justify-content-center vh-100 bg-light"
        style={{ zIndex: 9999 }}
      >
        <div className="spinner-border text-primary" role="status" style={{ width: "3rem", height: "3rem" }}>
          <span className="visually-hidden">Loading...</span>
        </div>
        <p className="mt-3 text-muted fw-semibold">{message}</p>
      </div>
    );
  }

  return (
    <div className="d-flex flex-column align-items-center justify-content-center py-5">
      <div className="spinner-border text-primary" role="status">
        <span className="visually-hidden">Loading...</span>
      </div>
      {message && <p className="mt-2 text-muted small">{message}</p>}
    </div>
  );
}
