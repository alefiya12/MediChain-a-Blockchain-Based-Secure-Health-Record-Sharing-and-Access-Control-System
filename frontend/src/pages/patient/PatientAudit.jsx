import React, { useState, useEffect, useCallback } from "react";
import api, { getErrorMessage } from "../../api/axios";
import AuditTable, { ALL_ACTION_OPTIONS } from "../../components/AuditTable";
import { toast } from "react-toastify";

const PATIENT_ACTIONS = ALL_ACTION_OPTIONS.filter((a) =>
  [
    "all",
    "RECORD_UPLOADED",
    "RECORD_CHAIN_CONFIRMED",
    "RECORD_VERIFIED",
    "RECORD_TAMPER_DETECTED",
    "ACCESS_REQUESTED",
    "ACCESS_GRANTED",
    "ACCESS_REJECTED",
    "ACCESS_REVOKED",
    "RECORD_VIEWED"
  ].includes(a.value)
);

export default function PatientAudit() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });

  // On-chain events state
  const [onChainEvents, setOnChainEvents] = useState([]);
  const [onChainLoading, setOnChainLoading] = useState(false);

  // Fetch DB audit logs
  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      let url = `/audit?page=${page}&limit=20`;
      if (actionFilter !== "all") {
        url += `&action=${actionFilter}`;
      }
      const res = await api.get(url);
      if (res.data?.success && res.data?.data) {
        setLogs(res.data.data.logs || []);
        if (res.data.data.pagination) {
          setPagination(res.data.data.pagination);
        }
      }
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [actionFilter, page]);

  // Fetch live on-chain events
  const fetchOnChainEvents = useCallback(async () => {
    setOnChainLoading(true);
    try {
      const res = await api.get("/audit/on-chain");
      if (res.data?.success && Array.isArray(res.data?.data?.events)) {
        setOnChainEvents(res.data.data.events);
      }
    } catch {
      // Non-blocking
    } finally {
      setOnChainLoading(false);
    }
  }, []);

  const refreshAll = () => {
    fetchLogs();
    fetchOnChainEvents();
  };

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    fetchOnChainEvents();
  }, [fetchOnChainEvents]);

  return (
    <AuditTable
      title="Patient Audit Trail"
      subtitle="Complete chronological history of your encrypted health records and doctor consent permissions"
      logs={logs}
      loading={loading}
      role="patient"
      actionFilter={actionFilter}
      onActionFilterChange={(val) => {
        setActionFilter(val);
        setPage(1);
      }}
      pagination={pagination}
      onPageChange={(p) => setPage(p)}
      onRefresh={refreshAll}
      onChainEvents={onChainEvents}
      onChainLoading={onChainLoading}
      availableActions={PATIENT_ACTIONS}
    />
  );
}
