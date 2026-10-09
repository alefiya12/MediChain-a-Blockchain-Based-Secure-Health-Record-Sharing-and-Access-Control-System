// Phase 1 stub — real implementation in Phase 3
import express from "express";

const app = express();
const PORT = process.env.PORT || 5000;

app.get("/api/health", (_req, res) => {
  res.json({ success: true, message: "MediChain backend up" });
});

app.listen(PORT, () => {
  console.log(`MediChain backend up on port ${PORT}`);
});
