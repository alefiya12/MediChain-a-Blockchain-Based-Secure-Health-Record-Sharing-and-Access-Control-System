import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { WalletProvider } from "./context/WalletContext";
import { ToastContainer } from "react-toastify";

// Public Pages
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Register from "./pages/Register";
import NotFound from "./pages/NotFound";

// Protected Layout Route
import ProtectedRoute from "./components/ProtectedRoute";

// Patient Pages
import PatientDashboard from "./pages/patient/PatientDashboard";
import UploadRecord from "./pages/patient/UploadRecord";
import MyRecords from "./pages/patient/MyRecords";
import AccessRequests from "./pages/patient/AccessRequests";
import GrantedAccess from "./pages/patient/GrantedAccess";
import PatientAudit from "./pages/patient/PatientAudit";

// Doctor Pages
import DoctorDashboard from "./pages/doctor/DoctorDashboard";
import SearchPatient from "./pages/doctor/SearchPatient";
import MyRequests from "./pages/doctor/MyRequests";
import AuthorizedRecords from "./pages/doctor/AuthorizedRecords";
import DoctorAudit from "./pages/doctor/DoctorAudit";

// Admin Pages
import AdminDashboard from "./pages/admin/AdminDashboard";
import DoctorVerification from "./pages/admin/DoctorVerification";
import AdminAudit from "./pages/admin/AdminAudit";

// Component to handle post-login root redirection
function RootRedirect() {
  const { user, isAuthenticated, loading } = useAuth();
  if (loading) return null;
  if (!isAuthenticated) return <Landing />;
  return <Navigate to={`/${user.role}`} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <WalletProvider>
          <Routes>
            {/* Public Routes */}
            <Route path="/" element={<RootRedirect />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />

            {/* Patient Routes */}
            <Route
              path="/patient"
              element={
                <ProtectedRoute allowedRoles={["patient"]}>
                  <PatientDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/patient/upload"
              element={
                <ProtectedRoute allowedRoles={["patient"]}>
                  <UploadRecord />
                </ProtectedRoute>
              }
            />
            <Route
              path="/patient/records"
              element={
                <ProtectedRoute allowedRoles={["patient"]}>
                  <MyRecords />
                </ProtectedRoute>
              }
            />
            <Route
              path="/patient/requests"
              element={
                <ProtectedRoute allowedRoles={["patient"]}>
                  <AccessRequests />
                </ProtectedRoute>
              }
            />
            <Route
              path="/patient/granted"
              element={
                <ProtectedRoute allowedRoles={["patient"]}>
                  <GrantedAccess />
                </ProtectedRoute>
              }
            />
            <Route
              path="/patient/audit"
              element={
                <ProtectedRoute allowedRoles={["patient"]}>
                  <PatientAudit />
                </ProtectedRoute>
              }
            />

            {/* Doctor Routes */}
            <Route
              path="/doctor"
              element={
                <ProtectedRoute allowedRoles={["doctor"]}>
                  <DoctorDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/doctor/search"
              element={
                <ProtectedRoute allowedRoles={["doctor"]} requireApproved={true}>
                  <SearchPatient />
                </ProtectedRoute>
              }
            />
            <Route
              path="/doctor/requests"
              element={
                <ProtectedRoute allowedRoles={["doctor"]}>
                  <MyRequests />
                </ProtectedRoute>
              }
            />
            <Route
              path="/doctor/records"
              element={
                <ProtectedRoute allowedRoles={["doctor"]} requireApproved={true}>
                  <AuthorizedRecords />
                </ProtectedRoute>
              }
            />
            <Route
              path="/doctor/audit"
              element={
                <ProtectedRoute allowedRoles={["doctor"]} requireApproved={true}>
                  <DoctorAudit />
                </ProtectedRoute>
              }
            />

            {/* Admin Routes */}
            <Route
              path="/admin"
              element={
                <ProtectedRoute allowedRoles={["admin"]}>
                  <AdminDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/doctors"
              element={
                <ProtectedRoute allowedRoles={["admin"]}>
                  <DoctorVerification />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/audit"
              element={
                <ProtectedRoute allowedRoles={["admin"]}>
                  <AdminAudit />
                </ProtectedRoute>
              }
            />

            {/* 404 Route */}
            <Route path="*" element={<NotFound />} />
          </Routes>

          {/* Global Toast Container */}
          <ToastContainer
            position="top-right"
            autoClose={4000}
            hideProgressBar={false}
            newestOnTop
            closeOnClick
            rtl={false}
            pauseOnFocusLoss
            draggable
            pauseOnHover
            theme="colored"
          />
        </WalletProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
