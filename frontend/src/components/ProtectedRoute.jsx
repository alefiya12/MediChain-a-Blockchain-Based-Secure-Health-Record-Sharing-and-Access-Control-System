import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useWallet } from "../context/WalletContext";
import Navbar from "./Navbar";
import Sidebar from "./Sidebar";
import Loader from "./Loader";

export default function ProtectedRoute({ children, allowedRoles = [], requireApproved = false }) {
  const { user, isAuthenticated, loading } = useAuth();
  const { isMismatch, mismatchMessage } = useWallet();
  const location = useLocation();

  if (loading) {
    return <Loader fullScreen message="Authenticating session..." />;
  }

  // Not logged in -> redirect to login
  if (!isAuthenticated || !user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Check role authorization
  if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    // Redirect to the user's own role dashboard
    const targetDashboard = `/${user.role}`;
    return <Navigate to={targetDashboard} replace />;
  }

  // Doctor approval check if required for this specific view
  if (requireApproved && user.role === "doctor" && user.doctorStatus !== "approved") {
    return <Navigate to="/doctor" replace />;
  }

  return (
    <div className="d-flex flex-column min-vh-100 bg-light">
      <Navbar />

      <div className="d-flex flex-grow-1">
        <Sidebar />

        <main className="flex-grow-1 p-3 p-md-4" style={{ minWidth: 0 }}>
          {/* Global Wallet Mismatch Banner */}
          {isMismatch && (
            <div className="banner-mismatch mb-4 d-flex align-items-center gap-3 shadow-sm" role="alert">
              <i className="bi bi-exclamation-octagon-fill fs-4 text-danger"></i>
              <div>
                <strong>Wallet Address Mismatch Detected!</strong>
                <p className="mb-0 small">{mismatchMessage}</p>
              </div>
            </div>
          )}

          {/* Unapproved Doctor Banner */}
          {user.role === "doctor" && user.doctorStatus === "pending" && (
            <div className="banner-pending-verification mb-4 d-flex align-items-center gap-3 shadow-sm" role="alert">
              <i className="bi bi-clock-history fs-4 text-warning"></i>
              <div>
                <strong>Account Pending Admin Verification</strong>
                <p className="mb-0 small">
                  Your medical profile is currently awaiting verification by the administrator on the Polygon Amoy blockchain.
                  Searching patients and requesting records will be enabled once your status is approved.
                </p>
              </div>
            </div>
          )}

          {children}
        </main>
      </div>
    </div>
  );
}
