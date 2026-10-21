import React, { useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useWallet } from "../context/WalletContext";
import Navbar from "../components/Navbar";
import { toast } from "react-toastify";

// Returns a simple strength object for the password
function getPasswordStrength(pw) {
  const hasLength = pw.length >= 8;
  const hasLetter = /[a-zA-Z]/.test(pw);
  const hasNumber = /[0-9]/.test(pw);
  const score = [hasLength, hasLetter, hasNumber].filter(Boolean).length;
  return { hasLength, hasLetter, hasNumber, score };
}

export default function Register() {
  const { register } = useAuth();
  const { account, connect } = useWallet();
  const navigate = useNavigate();

  // Role toggle: 'patient' or 'doctor'
  const [role, setRole] = useState("patient");

  // Common fields
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [walletAddress, setWalletAddress] = useState("");

  // Doctor-only fields
  const [licenseNumber, setLicenseNumber] = useState("");
  const [specialization, setSpecialization] = useState("");
  const [hospital, setHospital] = useState("");
  const [experienceYears, setExperienceYears] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Auto-fill wallet address from MetaMask connection
  const handleConnectWallet = async () => {
    try {
      const connected = await connect();
      if (connected) {
        setWalletAddress(connected);
        toast.success("Wallet address linked to registration form!");
      }
    } catch (err) {
      toast.error(err.message || "Failed to connect wallet.");
    }
  };

  const pwStrength = getPasswordStrength(password);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!name || !email || !password) {
      setError("Please fill in all required user fields.");
      return;
    }

    // Client-side password strength gate (mirrors server rules)
    if (pwStrength.score < 3) {
      setError("Password must be at least 8 characters and contain at least one letter and one number.");
      return;
    }

    if (role === "doctor") {
      if (!licenseNumber || !specialization || !hospital) {
        setError("Doctor registration requires license, specialization, and hospital information.");
        return;
      }
    }

    setLoading(true);

    const payload = {
      name,
      email,
      password,
      role,
      walletAddress: walletAddress.trim() || undefined
    };

    if (role === "doctor") {
      payload.licenseNumber = licenseNumber.trim();
      payload.specialization = specialization.trim();
      payload.hospital = hospital.trim();
      if (experienceYears) {
        payload.experienceYears = Number(experienceYears);
      }
    }

    try {
      const newUser = await register(payload);
      toast.success(`Account created successfully as ${role}!`);
      navigate(`/${newUser.role}`, { replace: true });
    } catch (err) {
      setError(err.message || "Registration failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-vh-100 d-flex flex-column bg-light">
      <Navbar />

      <div className="container flex-grow-1 d-flex align-items-center justify-content-center py-5">
        <div className="card shadow-lg border-0 p-4 p-md-5" style={{ maxWidth: "600px", width: "100%" }}>
          <div className="text-center mb-4">
            <h3 className="fw-bold mb-1">Create an Account</h3>
            <p className="text-muted small">Join MediChain for secure, decentralized health record sharing</p>

            {/* Role Toggle Selector */}
            <div className="btn-group w-100 mt-3" role="group">
              <button
                type="button"
                className={`btn py-2 ${role === "patient" ? "btn-primary" : "btn-outline-secondary"}`}
                onClick={() => setRole("patient")}
              >
                <i className="bi bi-person-fill me-1"></i> Patient Account
              </button>
              <button
                type="button"
                className={`btn py-2 ${role === "doctor" ? "btn-primary" : "btn-outline-secondary"}`}
                onClick={() => setRole("doctor")}
              >
                <i className="bi bi-hospital me-1"></i> Medical Doctor
              </button>
            </div>
          </div>

          {error && (
            <div className="alert alert-danger py-2 px-3 small d-flex align-items-center gap-2 mb-3">
              <i className="bi bi-exclamation-triangle-fill"></i>
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {/* Name */}
            <div className="mb-3">
              <label className="form-label small fw-semibold">
                {role === "doctor" ? "Doctor Full Name" : "Patient Full Name"} *
              </label>
              <input
                type="text"
                className="form-control"
                placeholder={role === "doctor" ? "Dr. Jane Doe" : "Alice Smith"}
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            {/* Email & Password */}
            <div className="row g-3 mb-3">
              <div className="col-md-6">
                <label className="form-label small fw-semibold">Email Address *</label>
                <input
                  type="email"
                  className="form-control"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="col-md-6">
                <label className="form-label small fw-semibold">Password *</label>
                <div className="input-group">
                  <input
                    type={showPassword ? "text" : "password"}
                    className="form-control"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    id="register-password-input"
                  />
                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={() => setShowPassword((v) => !v)}
                    title={showPassword ? "Hide password" : "Show password"}
                    tabIndex={-1}
                  >
                    <i className={`bi ${showPassword ? "bi-eye-slash" : "bi-eye"}`} />
                  </button>
                </div>
                {/* Password strength indicator */}
                {password.length > 0 && (
                  <div className="mt-1" style={{ fontSize: "0.72rem" }}>
                    <span className={pwStrength.hasLength ? "text-success" : "text-danger"}>
                      <i className={`bi ${pwStrength.hasLength ? "bi-check-circle-fill" : "bi-x-circle-fill"} me-1`} />
                      Min 8 characters
                    </span>
                    <span className={`ms-2 ${pwStrength.hasLetter ? "text-success" : "text-danger"}`}>
                      <i className={`bi ${pwStrength.hasLetter ? "bi-check-circle-fill" : "bi-x-circle-fill"} me-1`} />
                      Letter
                    </span>
                    <span className={`ms-2 ${pwStrength.hasNumber ? "text-success" : "text-danger"}`}>
                      <i className={`bi ${pwStrength.hasNumber ? "bi-check-circle-fill" : "bi-x-circle-fill"} me-1`} />
                      Number
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Wallet Address with Connect Button */}
            <div className="mb-3">
              <div className="d-flex justify-content-between align-items-center mb-1">
                <label className="form-label small fw-semibold mb-0">Polygon Amoy Wallet Address</label>
                <button
                  type="button"
                  onClick={handleConnectWallet}
                  className="btn btn-sm btn-link p-0 text-decoration-none small text-primary"
                >
                  <i className="bi bi-wallet2 me-1"></i>
                  {account ? "Use Connected Wallet" : "Connect MetaMask"}
                </button>
              </div>
              <input
                type="text"
                className="form-control font-monospace small"
                placeholder="0x..."
                value={walletAddress}
                onChange={(e) => setWalletAddress(e.target.value)}
              />
              <span className="text-muted" style={{ fontSize: "0.75rem" }}>
                Required for on-chain signing, access grants, and verification.
              </span>
            </div>

            {/* Doctor-Specific Fields */}
            {role === "doctor" && (
              <div className="p-3 mb-3 rounded-3 bg-light border">
                <h6 className="fw-bold text-primary mb-3">Medical Credentials</h6>

                <div className="row g-3 mb-2">
                  <div className="col-md-6">
                    <label className="form-label small fw-semibold">License Number *</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="e.g. LIC-DOC-98765"
                      value={licenseNumber}
                      onChange={(e) => setLicenseNumber(e.target.value)}
                      required={role === "doctor"}
                    />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label small fw-semibold">Specialization *</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="e.g. Cardiology"
                      value={specialization}
                      onChange={(e) => setSpecialization(e.target.value)}
                      required={role === "doctor"}
                    />
                  </div>
                </div>

                <div className="row g-3">
                  <div className="col-md-8">
                    <label className="form-label small fw-semibold">Hospital / Practice *</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="e.g. City General Hospital"
                      value={hospital}
                      onChange={(e) => setHospital(e.target.value)}
                      required={role === "doctor"}
                    />
                  </div>
                  <div className="col-md-4">
                    <label className="form-label small fw-semibold">Experience (Yrs)</label>
                    <input
                      type="number"
                      className="form-control"
                      placeholder="e.g. 5"
                      min="0"
                      value={experienceYears}
                      onChange={(e) => setExperienceYears(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary-gradient w-100 py-2 d-flex align-items-center justify-content-center gap-2 mt-4"
              disabled={loading}
              id="submit-register-btn"
            >
              {loading && <span className="spinner-border spinner-border-sm" role="status"></span>}
              <span>{loading ? "Creating account..." : `Register as ${role === "doctor" ? "Doctor" : "Patient"}`}</span>
            </button>
          </form>

          <div className="text-center mt-4">
            <p className="text-muted small mb-0">
              Already have an account?{" "}
              <Link to="/login" className="text-primary fw-semibold text-decoration-none">
                Sign In
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
