// src/routes/report.routes.js
import express from "express";
const router = express.Router();

import {
  getTwoDigitSummaryReport,
  getThreeDigitSummaryReport,
  exportSummary2DExcel,
  exportSummary3DExcel,
  getOverallSummaryReport,
  exportSummary2DPDF,
  exportSummary3DPDF,
} from "../controllers/report.controller.js";

import { verifyToken } from "../middlewares/verifyToken.js";

// ── summary report ─────────────────────────────────────────────────────────
router.get("/summary/2d", verifyToken, getTwoDigitSummaryReport);
router.get("/summary/3d", verifyToken, getThreeDigitSummaryReport);
router.get("/summary/overall", verifyToken, getOverallSummaryReport);

// ── Excel: ?mode=keep | send | all ────────────────────────────────────────
router.get("/summary/2d/export-excel", verifyToken, exportSummary2DExcel);
router.get("/summary/3d/export-excel", verifyToken, exportSummary3DExcel);

// ── PDF: ส่ง HTML กลับ → browser print เอง ────────────────────────────────
// apiClient fetch ด้วย Bearer header → ใช้ verifyToken ปกติได้เลย
router.get("/summary/2d/export-pdf", verifyToken, exportSummary2DPDF);
router.get("/summary/3d/export-pdf", verifyToken, exportSummary3DPDF);

export default router;
