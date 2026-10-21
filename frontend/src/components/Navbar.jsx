import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import WalletButton from "./WalletButton";

export default function Navbar() {
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const getDashboardPath = () => {
    if (!user) return "/";
    if (user.role === "patient") return "/patient";
    if (user.role === "doctor") return "/doctor";
    if (user.role === "admin") return "/admin";
    return "/";
  };

  return (
    <nav className="navbar navbar-expand-lg navbar-dark medichain-navbar">
      <div className="container-fluid">
        {/* Brand */}
        <Link to={getDashboardPath()} className="navbar-brand d-flex align-items-center gap-2">
          <div
            className="d-flex align-items-center justify-content-center rounded-3"
            style={{
              width: "36px",
              height: "36px",
              background: "linear-gradient(135deg, #0284c7 0%, #10b981 100%)"
            }}
          >
            <i className="bi bi-shield-lock-fill text-white fs-5"></i>
          </div>
          <div>
            <span className="navbar-brand-gradient fs-5">MediChain</span>
            <span className="badge bg-primary-subtle text-primary border border-primary-subtle ms-2 px-1 py-0 small" style={{ fontSize: "0.65rem" }}>
              v1.0
            </span>
          </div>
        </Link>

        {/* Right side items */}
        <div className="d-flex align-items-center gap-3 ms-auto">
          {isAuthenticated ? (
            <>
              {/* Wallet Button */}
              <WalletButton />

              {/* User info */}
              <div className="d-none d-md-flex flex-column text-end">
                <span className="text-white fw-semibold small">{user?.name}</span>
                <span className="text-muted text-uppercase" style={{ fontSize: "0.65rem", letterSpacing: "0.05em" }}>
                  {user?.role} {user?.role === "patient" && user?.patientId ? `(${user.patientId})` : ""}
                </span>
              </div>

              {/* Logout button */}
              <button
                onClick={handleLogout}
                className="btn btn-outline-danger btn-sm d-flex align-items-center gap-1"
                title="Log out of MediChain"
                id="logout-btn"
              >
                <i className="bi bi-box-arrow-right"></i>
                <span className="d-none d-sm-inline">Logout</span>
              </button>
            </>
          ) : (
            <div className="d-flex align-items-center gap-2">
              <Link to="/login" className="btn btn-outline-light btn-sm px-3">
                Login
              </Link>
              <Link to="/register" className="btn btn-primary-gradient btn-sm px-3">
                Register
              </Link>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
