import React from "react";
import { Link } from "react-router-dom";
import Navbar from "../components/Navbar";

export default function NotFound() {
  return (
    <div className="min-vh-100 d-flex flex-column bg-light">
      <Navbar />

      <div className="container flex-grow-1 d-flex flex-column align-items-center justify-content-center text-center py-5">
        <div className="display-1 fw-bold text-primary mb-2">404</div>
        <h2 className="fw-bold mb-3">Page Not Found</h2>
        <p className="text-muted max-w-md mb-4" style={{ maxWidth: "450px" }}>
          The requested page or route does not exist, or you may not have sufficient privileges to access it.
        </p>
        <Link to="/" className="btn btn-primary-gradient px-4 py-2">
          <i className="bi bi-house-door me-1"></i> Return Home
        </Link>
      </div>
    </div>
  );
}
