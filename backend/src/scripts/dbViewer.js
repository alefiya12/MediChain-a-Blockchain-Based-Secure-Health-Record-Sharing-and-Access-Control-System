import express from "express";
import mongoose from "mongoose";
import { env } from "../config/env.js";

export const createDbViewerApp = () => {
  const app = express();
  app.use(express.json());

  // Helper to get connected native db
  const getDb = () => {
    if (mongoose.connection && mongoose.connection.readyState === 1) {
      return mongoose.connection.db;
    }
    throw new Error("MongoDB connection is not open");
  };

  // API: Get database overview and collections
  app.get("/api/overview", async (req, res) => {
    try {
      const db = getDb();
      const collectionsRaw = await db.listCollections().toArray();
      const collections = [];

      for (const col of collectionsRaw) {
        if (col.name.startsWith("system.")) continue;
        const count = await db.collection(col.name).countDocuments();
        collections.push({ name: col.name, count });
      }

      // Sort alphabetically
      collections.sort((a, b) => a.name.localeCompare(b.name));

      res.json({
        success: true,
        database: db.databaseName,
        collections,
        connected: true,
        host: mongoose.connection.host,
        port: mongoose.connection.port
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // API: Get documents from a collection with pagination & search
  app.get("/api/collections/:name", async (req, res) => {
    try {
      const db = getDb();
      const { name } = req.params;
      const page = parseInt(req.query.page, 10) || 1;
      const limit = parseInt(req.query.limit, 10) || 25;
      const search = (req.query.search || "").trim();
      const sortField = req.query.sortField || "_id";
      const sortOrder = req.query.sortOrder === "asc" ? 1 : -1;

      let filter = {};
      if (search) {
        if (search.startsWith("{") && search.endsWith("}")) {
          try {
            filter = JSON.parse(search);
          } catch {
            // fallback to regex if JSON parse fails
            filter = { $text: { $search: search } };
          }
        } else {
          // Check if valid ObjectId
          const isObjectId = mongoose.Types.ObjectId.isValid(search) && search.length === 24;
          if (isObjectId) {
            filter = { _id: new mongoose.Types.ObjectId(search) };
          } else {
            // Search across common fields
            filter = {
              $or: [
                { email: { $regex: search, $options: "i" } },
                { name: { $regex: search, $options: "i" } },
                { role: { $regex: search, $options: "i" } },
                { patientId: { $regex: search, $options: "i" } },
                { action: { $regex: search, $options: "i" } },
                { status: { $regex: search, $options: "i" } },
                { licenseNumber: { $regex: search, $options: "i" } },
                { walletAddress: { $regex: search, $options: "i" } },
                { title: { $regex: search, $options: "i" } }
              ]
            };
          }
        }
      }

      const collection = db.collection(name);
      const total = await collection.countDocuments(filter).catch(() => 0);
      const docs = await collection
        .find(filter)
        .sort({ [sortField]: sortOrder })
        .skip((page - 1) * limit)
        .limit(limit)
        .toArray();

      res.json({
        success: true,
        collection: name,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
        documents: docs
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // API: Get single document
  app.get("/api/collections/:name/:id", async (req, res) => {
    try {
      const db = getDb();
      const { name, id } = req.params;
      const query = mongoose.Types.ObjectId.isValid(id) && id.length === 24 ? { _id: new mongoose.Types.ObjectId(id) } : { _id: id };
      const doc = await db.collection(name).findOne(query);
      if (!doc) return res.status(404).json({ success: false, error: "Document not found" });
      res.json({ success: true, document: doc });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // API: Create new document
  app.post("/api/collections/:name", async (req, res) => {
    try {
      const db = getDb();
      const { name } = req.params;
      const docData = req.body;
      const result = await db.collection(name).insertOne(docData);
      res.status(201).json({ success: true, insertedId: result.insertedId });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // API: Update document
  app.put("/api/collections/:name/:id", async (req, res) => {
    try {
      const db = getDb();
      const { name, id } = req.params;
      const query = mongoose.Types.ObjectId.isValid(id) && id.length === 24 ? { _id: new mongoose.Types.ObjectId(id) } : { _id: id };
      const updateData = { ...req.body };
      delete updateData._id; // cannot modify immutable _id

      const result = await db.collection(name).updateOne(query, { $set: updateData });
      res.json({ success: true, matchedCount: result.matchedCount, modifiedCount: result.modifiedCount });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // API: Delete document
  app.delete("/api/collections/:name/:id", async (req, res) => {
    try {
      const db = getDb();
      const { name, id } = req.params;
      const query = mongoose.Types.ObjectId.isValid(id) && id.length === 24 ? { _id: new mongoose.Types.ObjectId(id) } : { _id: id };
      const result = await db.collection(name).deleteOne(query);
      res.json({ success: true, deletedCount: result.deletedCount });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // Serve Single Page Application UI
  const serveUI = (req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MediChain Database Explorer</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-main: #0a0e17;
      --bg-panel: #111827;
      --bg-card: #162032;
      --bg-hover: #1f2c42;
      --border-color: #243247;
      --text-main: #f3f4f6;
      --text-muted: #94a3b8;
      --accent: #06b6d4;
      --accent-glow: rgba(6, 182, 212, 0.2);
      --success: #10b981;
      --danger: #ef4444;
      --warning: #f59e0b;
      --purple: #8b5cf6;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Plus Jakarta Sans', -apple-system, sans-serif;
      background: var(--bg-main);
      color: var(--text-main);
      display: flex;
      height: 100vh;
      overflow: hidden;
    }
    code, pre { font-family: 'JetBrains Mono', monospace; }

    /* Sidebar */
    .sidebar {
      width: 280px;
      background: var(--bg-panel);
      border-right: 1px solid var(--border-color);
      display: flex;
      flex-direction: column;
      flex-shrink: 0;
    }
    .brand {
      padding: 1.25rem;
      border-bottom: 1px solid var(--border-color);
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }
    .brand-icon {
      width: 38px;
      height: 38px;
      border-radius: 10px;
      background: linear-gradient(135deg, #06b6d4, #3b82f6);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.2rem;
      box-shadow: 0 4px 12px var(--accent-glow);
    }
    .brand-title {
      font-size: 1.05rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      background: linear-gradient(90deg, #38bdf8, #818cf8);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .brand-sub {
      font-size: 0.75rem;
      color: var(--text-muted);
    }
    .db-status {
      padding: 0.75rem 1.25rem;
      background: rgba(16, 185, 129, 0.08);
      border-bottom: 1px solid var(--border-color);
      font-size: 0.8rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--success);
      box-shadow: 0 0 8px var(--success);
      display: inline-block;
      margin-right: 6px;
    }
    .sidebar-heading {
      padding: 1rem 1.25rem 0.5rem;
      font-size: 0.72rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--text-muted);
      font-weight: 700;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .collection-list {
      flex: 1;
      overflow-y: auto;
      padding: 0.5rem;
    }
    .collection-item {
      padding: 0.65rem 0.85rem;
      border-radius: 8px;
      margin-bottom: 0.25rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      cursor: pointer;
      color: var(--text-muted);
      transition: all 0.15s ease;
      font-size: 0.88rem;
      font-weight: 500;
    }
    .collection-item:hover {
      background: var(--bg-hover);
      color: var(--text-main);
    }
    .collection-item.active {
      background: rgba(6, 182, 212, 0.15);
      color: #38bdf8;
      border: 1px solid rgba(6, 182, 212, 0.3);
      font-weight: 600;
    }
    .badge {
      font-size: 0.72rem;
      padding: 0.15rem 0.5rem;
      border-radius: 12px;
      background: var(--bg-card);
      color: var(--text-muted);
      font-weight: 600;
    }
    .collection-item.active .badge {
      background: rgba(6, 182, 212, 0.25);
      color: #7dd3fc;
    }

    /* Main Area */
    .main {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      background: var(--bg-main);
    }
    .topbar {
      height: 64px;
      border-bottom: 1px solid var(--border-color);
      background: var(--bg-panel);
      padding: 0 1.5rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
    }
    .topbar-left {
      display: flex;
      align-items: center;
      gap: 1rem;
    }
    .active-col-name {
      font-size: 1.25rem;
      font-weight: 700;
      color: var(--text-main);
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .search-box {
      position: relative;
      width: 320px;
    }
    .search-input {
      width: 100%;
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 0.5rem 0.85rem;
      color: var(--text-main);
      font-size: 0.85rem;
      outline: none;
      transition: border 0.15s;
    }
    .search-input:focus {
      border-color: var(--accent);
      box-shadow: 0 0 0 2px var(--accent-glow);
    }
    .btn {
      padding: 0.5rem 0.9rem;
      border-radius: 8px;
      border: none;
      font-size: 0.82rem;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      transition: all 0.15s;
    }
    .btn-primary {
      background: linear-gradient(135deg, #06b6d4, #2563eb);
      color: white;
    }
    .btn-primary:hover {
      opacity: 0.92;
      box-shadow: 0 2px 10px var(--accent-glow);
    }
    .btn-secondary {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      color: var(--text-main);
    }
    .btn-secondary:hover {
      background: var(--bg-hover);
    }
    .btn-danger {
      background: rgba(239, 68, 68, 0.15);
      border: 1px solid rgba(239, 68, 68, 0.3);
      color: #fca5a5;
    }
    .btn-danger:hover {
      background: var(--danger);
      color: white;
    }
    .btn-group {
      display: inline-flex;
      border-radius: 8px;
      overflow: hidden;
      border: 1px solid var(--border-color);
    }
    .btn-group button {
      background: var(--bg-card);
      border: none;
      color: var(--text-muted);
      padding: 0.45rem 0.8rem;
      font-size: 0.8rem;
      cursor: pointer;
    }
    .btn-group button.active {
      background: var(--accent);
      color: #0b0f19;
      font-weight: 700;
    }

    /* Content Area */
    .content {
      flex: 1;
      overflow: auto;
      padding: 1.5rem;
    }
    .card {
      background: var(--bg-panel);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      overflow: hidden;
    }

    /* Table */
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.84rem;
      text-align: left;
    }
    th {
      background: var(--bg-card);
      padding: 0.75rem 1rem;
      font-weight: 600;
      color: var(--text-muted);
      border-bottom: 1px solid var(--border-color);
      white-space: nowrap;
    }
    td {
      padding: 0.8rem 1rem;
      border-bottom: 1px solid var(--border-color);
      vertical-align: middle;
      max-width: 260px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    tr:hover td {
      background: rgba(255, 255, 255, 0.02);
    }
    .id-pill {
      font-family: 'JetBrains Mono', monospace;
      color: #38bdf8;
      background: rgba(56, 189, 248, 0.1);
      padding: 0.15rem 0.45rem;
      border-radius: 6px;
      font-size: 0.75rem;
      cursor: pointer;
    }
    .role-badge {
      display: inline-block;
      padding: 0.2rem 0.55rem;
      border-radius: 6px;
      font-size: 0.72rem;
      font-weight: 600;
      text-transform: uppercase;
    }
    .role-admin { background: rgba(245, 158, 11, 0.15); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.3); }
    .role-doctor { background: rgba(139, 92, 246, 0.15); color: #c084fc; border: 1px solid rgba(139, 92, 246, 0.3); }
    .role-patient { background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); }

    /* JSON Cards View */
    .json-card {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 10px;
      margin-bottom: 1rem;
      overflow: hidden;
    }
    .json-card-header {
      padding: 0.6rem 1rem;
      background: rgba(0, 0, 0, 0.2);
      border-bottom: 1px solid var(--border-color);
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.8rem;
    }
    .json-card pre {
      padding: 1rem;
      font-size: 0.82rem;
      line-height: 1.5;
      overflow-x: auto;
      color: #e2e8f0;
    }
    .key { color: #38bdf8; }
    .string { color: #a3e635; }
    .number { color: #f59e0b; }
    .boolean { color: #ec4899; }
    .null { color: #94a3b8; }

    /* Pagination */
    .pagination-bar {
      padding: 1rem 1.5rem;
      background: var(--bg-panel);
      border-top: 1px solid var(--border-color);
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.82rem;
      color: var(--text-muted);
    }

    /* Modal / Drawer */
    .modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.7);
      backdrop-filter: blur(4px);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 50;
    }
    .modal {
      width: 90%;
      max-width: 650px;
      background: var(--bg-panel);
      border: 1px solid var(--border-color);
      border-radius: 14px;
      display: flex;
      flex-direction: column;
      max-height: 85vh;
      box-shadow: 0 20px 40px rgba(0,0,0,0.5);
    }
    .modal-header {
      padding: 1rem 1.25rem;
      border-bottom: 1px solid var(--border-color);
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-weight: 700;
    }
    .modal-body {
      padding: 1.25rem;
      overflow-y: auto;
      flex: 1;
    }
    .modal-footer {
      padding: 1rem 1.25rem;
      border-top: 1px solid var(--border-color);
      display: flex;
      justify-content: flex-end;
      gap: 0.5rem;
    }
    .code-editor {
      width: 100%;
      height: 320px;
      background: #070a10;
      border: 1px solid var(--border-color);
      border-radius: 8px;
      color: #38bdf8;
      font-family: 'JetBrains Mono', monospace;
      padding: 0.75rem;
      font-size: 0.82rem;
      outline: none;
      resize: vertical;
    }

    .empty-state {
      padding: 4rem 2rem;
      text-align: center;
      color: var(--text-muted);
    }
  </style>
</head>
<body>

  <!-- Sidebar -->
  <aside class="sidebar">
    <div class="brand">
      <div class="brand-icon">🗄️</div>
      <div>
        <div class="brand-title">MediChain Explorer</div>
        <div class="brand-sub">MongoDB Web Interface</div>
      </div>
    </div>
    <div class="db-status">
      <div><span class="status-dot"></span> <span id="dbNameLabel">medichain</span></div>
      <span class="badge" id="portBadge">Port 27017</span>
    </div>
    <div class="sidebar-heading">
      <span>Collections</span>
      <button class="btn btn-secondary" style="padding: 0.2rem 0.4rem; font-size: 0.7rem;" onclick="loadOverview()">↺</button>
    </div>
    <div class="collection-list" id="collectionList">
      <div style="padding: 1rem; color: var(--text-muted); font-size: 0.82rem;">Loading collections...</div>
    </div>
  </aside>

  <!-- Main Content -->
  <main class="main">
    <header class="topbar">
      <div class="topbar-left">
        <div class="active-col-name" id="currentColTitle">Select Collection</div>
        <span class="badge" id="docCountBadge">0 records</span>
      </div>
      <div style="display: flex; align-items: center; gap: 0.75rem;">
        <div class="search-box">
          <input type="text" id="searchInput" class="search-input" placeholder="Search string or { query }..." onkeydown="if(event.key==='Enter') searchDocuments()">
        </div>
        <div class="btn-group">
          <button id="btnTableView" class="active" onclick="setViewMode('table')">Table</button>
          <button id="btnJsonView" onclick="setViewMode('json')">JSON</button>
        </div>
        <button class="btn btn-primary" onclick="openNewDocModal()">+ Insert Document</button>
      </div>
    </header>

    <div class="content">
      <div id="dataContainer" class="card">
        <div class="empty-state">Select a collection on the left to inspect documents.</div>
      </div>
    </div>

    <div class="pagination-bar">
      <div id="paginationInfo">Showing 0 of 0</div>
      <div style="display: flex; gap: 0.5rem; align-items: center;">
        <button class="btn btn-secondary" id="btnPrev" onclick="changePage(-1)">Previous</button>
        <span id="pageNumber">Page 1</span>
        <button class="btn btn-secondary" id="btnNext" onclick="changePage(1)">Next</button>
      </div>
    </div>
  </main>

  <!-- Document Edit/Insert Modal -->
  <div class="modal-backdrop" id="docModal">
    <div class="modal">
      <div class="modal-header">
        <span id="modalTitle">Document Editor</span>
        <button style="background: none; border: none; color: var(--text-muted); font-size: 1.2rem; cursor: pointer;" onclick="closeModal()">✕</button>
      </div>
      <div class="modal-body">
        <textarea id="jsonEditor" class="code-editor" spellcheck="false"></textarea>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="saveDocument()">Save to Database</button>
      </div>
    </div>
  </div>

  <script>
    let currentCollection = "";
    let currentPage = 1;
    let totalPages = 1;
    let viewMode = "table";
    let activeEditingId = null;
    let currentDocs = [];

    async function loadOverview() {
      try {
        const res = await fetch("/api/overview");
        const data = await res.json();
        if (data.success) {
          document.getElementById("dbNameLabel").innerText = data.database;
          document.getElementById("portBadge").innerText = "Port " + (data.port || 27017);
          const list = document.getElementById("collectionList");
          list.innerHTML = "";

          data.collections.forEach(col => {
            const el = document.createElement("div");
            el.className = "collection-item" + (col.name === currentCollection ? " active" : "");
            el.onclick = () => selectCollection(col.name);
            el.innerHTML = '<span>📁 ' + col.name + '</span><span class="badge">' + col.count + '</span>';
            list.appendChild(el);
          });

          if (!currentCollection && data.collections.length > 0) {
            selectCollection(data.collections[0].name);
          }
        }
      } catch (err) {
        console.error("Failed to load overview:", err);
      }
    }

    async function selectCollection(name) {
      currentCollection = name;
      currentPage = 1;
      document.getElementById("currentColTitle").innerText = "📁 " + name;
      document.querySelectorAll(".collection-item").forEach(item => {
        item.classList.toggle("active", item.innerText.includes(name));
      });
      loadDocuments();
    }

    async function loadDocuments() {
      if (!currentCollection) return;
      const search = document.getElementById("searchInput").value;
      const url = "/api/collections/" + currentCollection + "?page=" + currentPage + "&limit=25&search=" + encodeURIComponent(search);

      try {
        const res = await fetch(url);
        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        currentDocs = data.documents;
        totalPages = data.totalPages;
        document.getElementById("docCountBadge").innerText = data.total + " records";
        document.getElementById("paginationInfo").innerText = "Showing " + data.documents.length + " of " + data.total + " documents";
        document.getElementById("pageNumber").innerText = "Page " + data.page + " of " + data.totalPages;
        document.getElementById("btnPrev").disabled = data.page <= 1;
        document.getElementById("btnNext").disabled = data.page >= data.totalPages;

        renderDocuments();
      } catch (err) {
        document.getElementById("dataContainer").innerHTML = '<div class="empty-state" style="color: var(--danger)">Error: ' + err.message + '</div>';
      }
    }

    function renderDocuments() {
      const container = document.getElementById("dataContainer");
      if (!currentDocs || currentDocs.length === 0) {
        container.innerHTML = '<div class="empty-state">No documents found in ' + currentCollection + '.</div>';
        return;
      }

      if (viewMode === "table") {
        // Collect common keys
        const keySet = new Set(["_id"]);
        currentDocs.forEach(d => Object.keys(d).forEach(k => keySet.add(k)));
        const keys = Array.from(keySet).slice(0, 7); // Show top 7 fields

        let html = '<table><thead><tr>';
        keys.forEach(k => html += '<th>' + k + '</th>');
        html += '<th style="text-align: right;">Actions</th></tr></thead><tbody>';

        currentDocs.forEach(doc => {
          html += '<tr>';
          keys.forEach(k => {
            let val = doc[k];
            if (k === "_id") {
              html += '<td><span class="id-pill" onclick="editDoc(\\'' + val + '\\')">' + String(val).slice(-8) + '...</span></td>';
            } else if (k === "role") {
              html += '<td><span class="role-badge role-' + val + '">' + val + '</span></td>';
            } else if (typeof val === "object" && val !== null) {
              html += '<td style="color: var(--text-muted)">{...}</td>';
            } else {
              html += '<td>' + (val !== undefined ? String(val) : '<span style="color:var(--text-muted)">-</span>') + '</td>';
            }
          });
          html += '<td style="text-align: right; white-space: nowrap;">' +
            '<button class="btn btn-secondary" style="padding: 0.25rem 0.5rem; font-size: 0.75rem; margin-right: 0.35rem;" onclick="editDoc(\\'' + doc._id + '\\')">View</button>' +
            '<button class="btn btn-danger" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;" onclick="deleteDoc(\\'' + doc._id + '\\')">Delete</button>' +
            '</td></tr>';
        });

        html += '</tbody></table>';
        container.innerHTML = html;
      } else {
        // JSON cards view
        let html = '<div style="padding: 1rem;">';
        currentDocs.forEach(doc => {
          html += '<div class="json-card">' +
            '<div class="json-card-header">' +
            '<span class="id-pill" style="font-size: 0.8rem;">_id: ' + doc._id + '</span>' +
            '<div>' +
            '<button class="btn btn-secondary" style="padding: 0.2rem 0.5rem; font-size: 0.75rem; margin-right: 0.4rem;" onclick="copyJson(\\'' + doc._id + '\\')">Copy</button>' +
            '<button class="btn btn-secondary" style="padding: 0.2rem 0.5rem; font-size: 0.75rem; margin-right: 0.4rem;" onclick="editDoc(\\'' + doc._id + '\\')">Edit</button>' +
            '<button class="btn btn-danger" style="padding: 0.2rem 0.5rem; font-size: 0.75rem;" onclick="deleteDoc(\\'' + doc._id + '\\')">Delete</button>' +
            '</div>' +
            '</div>' +
            '<pre>' + syntaxHighlight(JSON.stringify(doc, null, 2)) + '</pre>' +
            '</div>';
        });
        html += '</div>';
        container.innerHTML = html;
      }
    }

    function syntaxHighlight(json) {
      json = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return json.replace(/("(\\\\u[a-zA-Z0-9]{4}|\\\\[^u]|[^\\\\"])*"(\\s*:)?|\\b(true|false|null)\\b|-?\\d+(?:\\.\\d*)?(?:[eE][+\\-]?\\d+)?)/g, function (match) {
        var cls = 'number';
        if (/^"/.test(match)) {
          if (/:$/.test(match)) {
            cls = 'key';
          } else {
            cls = 'string';
          }
        } else if (/true|false/.test(match)) {
          cls = 'boolean';
        } else if (/null/.test(match)) {
          cls = 'null';
        }
        return '<span class="' + cls + '">' + match + '</span>';
      });
    }

    function setViewMode(mode) {
      viewMode = mode;
      document.getElementById("btnTableView").classList.toggle("active", mode === "table");
      document.getElementById("btnJsonView").classList.toggle("active", mode === "json");
      renderDocuments();
    }

    function changePage(delta) {
      currentPage = Math.max(1, Math.min(totalPages, currentPage + delta));
      loadDocuments();
    }

    function searchDocuments() {
      currentPage = 1;
      loadDocuments();
    }

    function editDoc(id) {
      const doc = currentDocs.find(d => String(d._id) === String(id));
      if (!doc) return;
      activeEditingId = id;
      document.getElementById("modalTitle").innerText = "Edit Document (" + id + ")";
      document.getElementById("jsonEditor").value = JSON.stringify(doc, null, 2);
      document.getElementById("docModal").style.display = "flex";
    }

    function openNewDocModal() {
      activeEditingId = null;
      document.getElementById("modalTitle").innerText = "Insert New Document into " + currentCollection;
      document.getElementById("jsonEditor").value = JSON.stringify({ createdAt: new Date() }, null, 2);
      document.getElementById("docModal").style.display = "flex";
    }

    function closeModal() {
      document.getElementById("docModal").style.display = "none";
    }

    async function saveDocument() {
      try {
        const parsed = JSON.parse(document.getElementById("jsonEditor").value);
        let res;
        if (activeEditingId) {
          res = await fetch("/api/collections/" + currentCollection + "/" + activeEditingId, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(parsed)
          });
        } else {
          res = await fetch("/api/collections/" + currentCollection, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(parsed)
          });
        }
        const data = await res.json();
        if (!data.success) throw new Error(data.error);
        closeModal();
        loadDocuments();
        loadOverview();
      } catch (err) {
        alert("Save failed: " + err.message);
      }
    }

    async function deleteDoc(id) {
      if (!confirm("Are you sure you want to permanently delete document " + id + "?")) return;
      try {
        const res = await fetch("/api/collections/" + currentCollection + "/" + id, { method: "DELETE" });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);
        loadDocuments();
        loadOverview();
      } catch (err) {
        alert("Delete failed: " + err.message);
      }
    }

    function copyJson(id) {
      const doc = currentDocs.find(d => String(d._id) === String(id));
      if (doc) {
        navigator.clipboard.writeText(JSON.stringify(doc, null, 2));
        alert("Document JSON copied to clipboard!");
      }
    }

    // Initial boot
    loadOverview();
  </script>
</body>
</html>`);
  };

  app.get("/", serveUI);
  app.use(serveUI);

  return app;
};

// Standalone runner
export const startDbViewer = (port = 8081) => {
  const app = createDbViewerApp();
  return new Promise((resolve, reject) => {
    const server = app.listen(port, () => {
      console.log(`🗄️  MediChain Web Database Explorer active at: http://localhost:${port}`);
      resolve(server);
    });
    server.on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        console.warn(`⚠️ Port ${port} is in use, trying ${port + 1}...`);
        resolve(startDbViewer(port + 1));
      } else {
        reject(err);
      }
    });
  });
};

// CLI execution
import { fileURLToPath } from "url";
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { connectDB } = await import("../config/db.js");
  await connectDB();
  await startDbViewer(8081);
}

export default startDbViewer;
