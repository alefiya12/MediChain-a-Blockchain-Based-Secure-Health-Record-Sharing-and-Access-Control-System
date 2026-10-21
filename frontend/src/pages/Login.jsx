import React, { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Navbar from "../components/Navbar";
import { toast } from "react-toastify";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      setError("Please enter both email and password.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const loggedUser = await login(email, password);
      toast.success(`Welcome back, ${loggedUser.name}!`);

      // Determine redirect path
      const from = location.state?.from?.pathname;
      if (from && from !== "/login") {
        navigate(from, { replace: true });
      } else {
        navigate(`/${loggedUser.role}`, { replace: true });
      }
    } catch (err) {
      setError(err.message || "Failed to log in.");
    } finally {
      setLoading(false);
    }
  };

  // Quick fill demo buttons
  const quickFill = (demoEmail, demoPassword) => {
    setEmail(demoEmail);
    setPassword(demoPassword);
    setError("");
  };

  return (
    <div className="min-vh-100 d-flex flex-column bg-light">
      <Navbar />

      <div className="container flex-grow-1 d-flex align-items-center justify-content-center py-5">
        <div className="card shadow-lg border-0 p-4 p-md-5" style={{ maxWidth: "460px", width: "100%" }}>
          <div className="text-center mb-4">
            <div
              className="d-inline-flex align-items-center justify-content-center rounded-3 mb-2"
              style={{
                width: "48px",
                height: "48px",
                background: "linear-gradient(135deg, #0284c7 0%, #10b981 100%)"
              }}
            >
              <i className="bi bi-shield-lock-fill text-white fs-4"></i>
            </div>
            <h3 className="fw-bold mb-1">Sign In to MediChain</h3>
            <p className="text-muted small">Access your secure health records & consent portal</p>
          </div>

          {error && (
            <div className="alert alert-danger py-2 px-3 small d-flex align-items-center gap-2 mb-3">
              <i className="bi bi-exclamation-triangle-fill"></i>
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="mb-3">
              <label className="form-label small fw-semibold">Email Address</label>
              <div className="input-group">
                <span className="input-group-text bg-light text-muted">
                  <i className="bi bi-envelope"></i>
                </span>
                <input
                  type="email"
                  className="form-control"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                />
              </div>
            </div>

            <div className="mb-4">
              <label className="form-label small fw-semibold">Password</label>
              <div className="input-group">
                <span className="input-group-text bg-light text-muted">
                  <i className="bi bi-key"></i>
                </span>
                <input
                  type="password"
                  className="form-control"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary-gradient w-100 py-2 d-flex align-items-center justify-content-center gap-2"
              disabled={loading}
              id="submit-login-btn"
            >
              {loading && <span className="spinner-border spinner-border-sm" role="status"></span>}
              <span>{loading ? "Signing in..." : "Sign In"}</span>
            </button>
          </form>

          {/* Demo Quick-Fill Helpers */}
          <div className="mt-4 pt-3 border-top">
            <span className="text-muted small d-block mb-2 text-center">Quick-Fill Demo Credentials:</span>
            <div className="d-flex justify-content-center gap-2">
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm"
                onClick={() => quickFill("admin@medichain.local", "AdminPassword123!")}
              >
                Admin
              </button>
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm"
                onClick={() => quickFill("alice.patient@medichain.local", "Password123!")}
              >
                Patient
              </button>
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm"
                onClick={() => quickFill("carol.doctor@medichain.local", "Password123!")}
              >
                Doctor
              </button>
            </div>
          </div>

          <div className="text-center mt-4">
            <p className="text-muted small mb-0">
              Don't have an account?{" "}
              <Link to="/register" className="text-primary fw-semibold text-decoration-none">
                Register here
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
