import React from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Navbar from "../components/Navbar";

export default function Landing() {
  const { user, isAuthenticated } = useAuth();

  const getDashboardPath = () => {
    if (!user) return "/login";
    return `/${user.role}`;
  };

  return (
    <div className="min-vh-100 d-flex flex-column bg-light">
      <Navbar />

      {/* Hero Section */}
      <section className="hero-gradient text-center py-5">
        <div className="container py-4">
          <div className="badge bg-primary-subtle text-primary border border-primary-subtle px-3 py-2 rounded-pill mb-3 fw-semibold">
            <i className="bi bi-shield-check me-1"></i> Powered by Polygon Amoy Testnet & AES-256-GCM
          </div>
          <h1 className="display-4 fw-extrabold mb-3">
            Decentralized & Encrypted <br />
            <span className="navbar-brand-gradient">Healthcare Record Access Control</span>
          </h1>
          <p className="lead text-light opacity-75 max-w-2xl mx-auto mb-4" style={{ maxWidth: "680px" }}>
            MediChain empowers patients with absolute ownership over their medical records.
            Doctors request consent on-chain; files are encrypted at rest with cryptographic tamper verification.
          </p>

          <div className="d-flex justify-content-center gap-3">
            {isAuthenticated ? (
              <Link to={getDashboardPath()} className="btn btn-primary-gradient px-4 py-2 fs-6">
                Go to {user?.role?.toUpperCase()} Dashboard <i className="bi bi-arrow-right ms-1"></i>
              </Link>
            ) : (
              <>
                <Link to="/register" className="btn btn-primary-gradient px-4 py-2 fs-6">
                  Get Started <i className="bi bi-arrow-right ms-1"></i>
                </Link>
                <Link to="/login" className="btn btn-outline-light px-4 py-2 fs-6">
                  Sign In
                </Link>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Feature Grid */}
      <section className="container py-5 my-3">
        <div className="text-center mb-5">
          <h2 className="fw-bold">Enterprise-Grade Security Architecture</h2>
          <p className="text-muted">Built on the hybrid model: off-chain encryption with on-chain immutability.</p>
        </div>

        <div className="row g-4">
          {/* Card 1 */}
          <div className="col-md-4">
            <div className="card h-100 p-4 border-0 shadow-sm card-hover">
              <div
                className="d-inline-flex align-items-center justify-content-center rounded-3 mb-3"
                style={{ width: "48px", height: "48px", background: "rgba(2, 132, 199, 0.1)", color: "#0284c7" }}
              >
                <i className="bi bi-file-earmark-lock fs-4"></i>
              </div>
              <h5 className="fw-bold">Client-Side File Encryption</h5>
              <p className="text-muted small mb-0">
                Medical records are encrypted at rest using AES-256-GCM with unique initialization vectors and authentication tags. Plaintext never touches public networks.
              </p>
            </div>
          </div>

          {/* Card 2 */}
          <div className="col-md-4">
            <div className="card h-100 p-4 border-0 shadow-sm card-hover">
              <div
                className="d-inline-flex align-items-center justify-content-center rounded-3 mb-3"
                style={{ width: "48px", height: "48px", background: "rgba(16, 185, 129, 0.1)", color: "#10b981" }}
              >
                <i className="bi bi-cpu fs-4"></i>
              </div>
              <h5 className="fw-bold">Smart Contract Consent</h5>
              <p className="text-muted small mb-0">
                Access permissions are anchored directly on the Polygon Amoy blockchain. Every grant, rejection, and revocation is an immutable event that takes effect instantly.
              </p>
            </div>
          </div>

          {/* Card 3 */}
          <div className="col-md-4">
            <div className="card h-100 p-4 border-0 shadow-sm card-hover">
              <div
                className="d-inline-flex align-items-center justify-content-center rounded-3 mb-3"
                style={{ width: "48px", height: "48px", background: "rgba(245, 158, 11, 0.1)", color: "#f59e0b" }}
              >
                <i className="bi bi-shield-check fs-4"></i>
              </div>
              <h5 className="fw-bold">Cryptographic Tamper Detection</h5>
              <p className="text-muted small mb-0">
                On-chain SHA-256 hashes enable instant verification. If a single byte in an encrypted record is modified, MediChain flags the record as TAMPERED immediately.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Role Cards */}
      <section className="bg-white py-5 border-top">
        <div className="container py-3">
          <div className="row g-4 align-items-center">
            <div className="col-lg-4">
              <div className="p-4 rounded-4 border bg-light h-100">
                <span className="badge bg-primary mb-2">Patient Experience</span>
                <h4 className="fw-bold">You Own Your Data</h4>
                <p className="text-muted small">
                  Upload records, anchor cryptographic proofs, receive access requests from verified practitioners, and revoke permissions anytime with one click.
                </p>
                <Link to="/register" className="btn btn-outline-primary btn-sm mt-2">
                  Register as Patient
                </Link>
              </div>
            </div>

            <div className="col-lg-4">
              <div className="p-4 rounded-4 border bg-light h-100">
                <span className="badge bg-success mb-2">Doctor Experience</span>
                <h4 className="fw-bold">Verified Practitioner Access</h4>
                <p className="text-muted small">
                  Submit credentials for admin verification, search patient identifiers, request record access, and view decrypted diagnostics securely.
                </p>
                <Link to="/register" className="btn btn-outline-success btn-sm mt-2">
                  Register as Doctor
                </Link>
              </div>
            </div>

            <div className="col-lg-4">
              <div className="p-4 rounded-4 border bg-light h-100">
                <span className="badge bg-dark mb-2">Administrator</span>
                <h4 className="fw-bold">Contract Governance</h4>
                <p className="text-muted small">
                  Authorize licensed doctors on-chain via smart contract calls, review audit trails, and oversee system integrity.
                </p>
                <Link to="/login" className="btn btn-outline-dark btn-sm mt-2">
                  Admin Sign In
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-auto py-4 bg-dark text-white-50 text-center small border-top border-secondary">
        <div className="container">
          <p className="mb-1 text-white">MediChain — Blockchain-Based Healthcare Record Sharing</p>
          <p className="mb-0">Polygon Amoy Testnet (Chain ID 80002) · Node.js · Express · React · ethers.js</p>
        </div>
      </footer>
    </div>
  );
}
