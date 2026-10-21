import React, { useState } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Sidebar() {
  const { user } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (!user) return null;

  const isApprovedDoctor = user.role === "doctor" && user.doctorStatus === "approved";

  const patientLinks = [
    { to: "/patient", icon: "bi-grid-1x2-fill", label: "Dashboard", end: true },
    { to: "/patient/upload", icon: "bi-cloud-arrow-up-fill", label: "Upload Record" },
    { to: "/patient/records", icon: "bi-folder2-open", label: "My Records" },
    { to: "/patient/requests", icon: "bi-inbox-fill", label: "Access Requests" },
    { to: "/patient/granted", icon: "bi-person-check-fill", label: "Granted Doctors" },
    { to: "/patient/audit", icon: "bi-journal-text", label: "Audit Trail" }
  ];

  const doctorLinks = [
    { to: "/doctor", icon: "bi-grid-1x2-fill", label: "Dashboard", end: true },
    ...(isApprovedDoctor
      ? [
          { to: "/doctor/search", icon: "bi-search", label: "Search Patient" },
          { to: "/doctor/requests", icon: "bi-send-fill", label: "My Requests" },
          { to: "/doctor/records", icon: "bi-file-earmark-medical-fill", label: "Authorized Records" },
          { to: "/doctor/audit", icon: "bi-journal-text", label: "Audit Trail" }
        ]
      : [
          // Limited navigation for pending / unapproved doctor
          { to: "/doctor/requests", icon: "bi-send-fill", label: "My Requests" }
        ])
  ];

  const adminLinks = [
    { to: "/admin", icon: "bi-speedometer2", label: "Dashboard", end: true },
    { to: "/admin/doctors", icon: "bi-patch-check-fill", label: "Doctor Verification" },
    { to: "/admin/audit", icon: "bi-shield-check", label: "System Audit Logs" },
    { to: "http://localhost:8081", icon: "bi-database-fill-gear", label: "Database Explorer", external: true }
  ];

  let links = [];
  if (user.role === "patient") links = patientLinks;
  else if (user.role === "doctor") links = doctorLinks;
  else if (user.role === "admin") links = adminLinks;

  return (
    <>
      {/* Desktop Sidebar — hidden on mobile (< md) */}
      <aside className="medichain-sidebar d-none d-md-block">
        <div className="mb-4 px-2">
          <span className="text-uppercase text-muted fw-bold small" style={{ fontSize: "0.7rem", letterSpacing: "0.08em" }}>
            {user.role} Navigation
          </span>
        </div>

        <nav className="nav flex-column">
          {links.map((link) =>
            link.external ? (
              <a
                key={link.to}
                href={link.to}
                target="_blank"
                rel="noreferrer"
                className="sidebar-nav-item"
              >
                <i className={`bi ${link.icon} fs-5 text-info`}></i>
                <span>{link.label}</span>
                <i className="bi bi-box-arrow-up-right ms-auto small text-muted"></i>
              </a>
            ) : (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                className={({ isActive }) =>
                  `sidebar-nav-item ${isActive ? "active" : ""}`
                }
              >
                <i className={`bi ${link.icon} fs-5`}></i>
                <span>{link.label}</span>
              </NavLink>
            )
          )}
        </nav>

        {/* Role specific quick help */}
        <div className="mt-5 p-3 rounded-3 bg-light border text-muted small">
          <div className="d-flex align-items-center gap-2 mb-1 text-dark fw-semibold">
            <i className="bi bi-info-circle text-primary"></i>
            <span>Role: {user.role}</span>
          </div>
          {user.role === "patient" && (
            <p className="mb-0 text-secondary" style={{ fontSize: "0.8rem" }}>
              ID: <strong className="text-dark font-monospace">{user.patientId}</strong>
            </p>
          )}
          {user.role === "doctor" && (
            <p className="mb-0 text-secondary" style={{ fontSize: "0.8rem" }}>
              Status:{" "}
              <span className={`fw-bold text-${user.doctorStatus === "approved" ? "success" : "warning"}`}>
                {user.doctorStatus?.toUpperCase()}
              </span>
            </p>
          )}
          {user.role === "admin" && (
            <p className="mb-0 text-secondary" style={{ fontSize: "0.8rem" }}>
              Contract Owner Account
            </p>
          )}
        </div>
      </aside>

      {/* Mobile Bottom Navigation Bar — shown only on mobile (< md) */}
      <nav
        className="d-flex d-md-none fixed-bottom bg-white border-top shadow"
        style={{ zIndex: 1040, overflowX: "auto" }}
        aria-label="Mobile navigation"
      >
        {links.map((link) =>
          link.external ? (
            <a
              key={link.to}
              href={link.to}
              target="_blank"
              rel="noreferrer"
              className="flex-fill d-flex flex-column align-items-center justify-content-center py-2 text-decoration-none border-0 bg-transparent text-muted"
              style={{ fontSize: "0.65rem", minWidth: "64px" }}
            >
              <i className={`bi ${link.icon} fs-5 d-block text-info`}></i>
              <span>{link.label.split(" ")[0]}</span>
            </a>
          ) : (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) =>
                `flex-fill d-flex flex-column align-items-center justify-content-center py-2 text-decoration-none border-0 bg-transparent ${
                  isActive ? "text-primary fw-semibold" : "text-muted"
                }`
              }
              style={{ fontSize: "0.65rem", minWidth: "64px" }}
              onClick={() => setMobileOpen(false)}
            >
              <i className={`bi ${link.icon} fs-5 d-block`}></i>
              <span>{link.label.split(" ")[0]}</span>
            </NavLink>
          )
        )}
      </nav>

      {/* Bottom padding on mobile so content isn't hidden behind the nav bar */}
      <style>{`@media (max-width: 767.98px) { main { padding-bottom: 72px !important; } }`}</style>
    </>
  );
}
