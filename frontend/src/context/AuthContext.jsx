import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import api, { getErrorMessage } from "../api/axios";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem("token") || null);
  const [loading, setLoading] = useState(true);

  // Restore session via /auth/me
  const loadUser = useCallback(async () => {
    const storedToken = localStorage.getItem("token");
    if (!storedToken) {
      setUser(null);
      setLoading(false);
      return;
    }

    try {
      const res = await api.get("/auth/me");
      if (res.data?.success && res.data?.data?.user) {
        setUser(res.data.data.user);
      } else {
        throw new Error("Invalid user data response");
      }
    } catch {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      setToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUser();

    // Listen for 401 unauthorized event from axios interceptor
    const handleUnauthorized = () => {
      setToken(null);
      setUser(null);
      setLoading(false);
    };

    window.addEventListener("medichain_auth_unauthorized", handleUnauthorized);
    return () => {
      window.removeEventListener("medichain_auth_unauthorized", handleUnauthorized);
    };
  }, [loadUser]);

  // Login handler
  const login = async (email, password) => {
    try {
      const res = await api.post("/auth/login", { email, password });
      const { token: receivedToken, user: receivedUser } = res.data.data;
      localStorage.setItem("token", receivedToken);
      localStorage.setItem("user", JSON.stringify(receivedUser));
      setToken(receivedToken);
      setUser(receivedUser);
      return receivedUser;
    } catch (err) {
      throw new Error(getErrorMessage(err));
    }
  };

  // Register handler
  const register = async (formData) => {
    try {
      const res = await api.post("/auth/register", formData);
      const { token: receivedToken, user: receivedUser } = res.data.data;
      localStorage.setItem("token", receivedToken);
      localStorage.setItem("user", JSON.stringify(receivedUser));
      setToken(receivedToken);
      setUser(receivedUser);
      return receivedUser;
    } catch (err) {
      throw new Error(getErrorMessage(err));
    }
  };

  // Logout handler
  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setToken(null);
    setUser(null);
  };

  // Refresh user data (e.g. after profile update)
  const refreshUser = async () => {
    await loadUser();
  };

  const value = {
    user,
    token,
    loading,
    isAuthenticated: !!user,
    login,
    register,
    logout,
    refreshUser
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
