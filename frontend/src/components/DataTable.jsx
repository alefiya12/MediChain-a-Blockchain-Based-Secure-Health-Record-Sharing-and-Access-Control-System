import React, { useState, useMemo } from "react";

export default function DataTable({
  columns = [],
  data = [],
  searchable = true,
  searchPlaceholder = "Search records...",
  emptyMessage = "No records found.",
  pageSize = 10
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  // Search filter
  const filteredData = useMemo(() => {
    if (!searchTerm.trim()) return data;
    const term = searchTerm.toLowerCase();
    return data.filter((item) => {
      return columns.some((col) => {
        let val = "";
        if (typeof col.accessor === "function") {
          val = String(col.accessor(item) || "");
        } else if (col.accessor) {
          val = String(item[col.accessor] || "");
        }
        return val.toLowerCase().includes(term);
      });
    });
  }, [data, columns, searchTerm]);

  // Pagination
  const totalPages = Math.ceil(filteredData.length / pageSize) || 1;
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredData.slice(start, start + pageSize);
  }, [filteredData, currentPage, pageSize]);

  return (
    <div className="table-responsive">
      {searchable && (
        <div className="d-flex justify-content-between align-items-center mb-3">
          <div className="input-group" style={{ maxWidth: "320px" }}>
            <span className="input-group-text bg-white border-end-0">
              <i className="bi bi-search text-muted"></i>
            </span>
            <input
              type="text"
              className="form-control border-start-0 ps-0"
              placeholder={searchPlaceholder}
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
            />
          </div>
          <span className="text-muted small">
            Showing {filteredData.length} {filteredData.length === 1 ? "entry" : "entries"}
          </span>
        </div>
      )}

      <table className="table-modern">
        <thead>
          <tr>
            {columns.map((col, idx) => (
              <th key={idx} style={col.style}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {paginatedData.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="text-center py-4 text-muted">
                <i className="bi bi-inbox d-block fs-3 mb-2 opacity-50"></i>
                {emptyMessage}
              </td>
            </tr>
          ) : (
            paginatedData.map((row, rIdx) => (
              <tr key={row._id || row.id || rIdx}>
                {columns.map((col, cIdx) => (
                  <td key={cIdx} style={col.style}>
                    {col.render
                      ? col.render(row)
                      : typeof col.accessor === "function"
                      ? col.accessor(row)
                      : row[col.accessor]}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>

      {totalPages > 1 && (
        <div className="d-flex justify-content-between align-items-center mt-3 pt-2 border-top">
          <span className="text-muted small">
            Page {currentPage} of {totalPages}
          </span>
          <div className="btn-group btn-group-sm">
            <button
              className="btn btn-outline-secondary"
              onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
              disabled={currentPage === 1}
            >
              Previous
            </button>
            <button
              className="btn btn-outline-secondary"
              onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
              disabled={currentPage === totalPages}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
