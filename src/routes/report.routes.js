// src/routes/report.routes.js
import express from "express";
const router = express.Router();

import {
  getTwoDigitSummaryReport,
  getThreeDigitSummaryReport,
  exportSummary2DExcel,
  exportSummary3DExcel,
} from "../controllers/report.controller.js";
import { verifyToken } from "../middlewares/verifyToken.js";
// ถ้ามี auth middleware ให้ใส่เหมือน route อื่น ๆ
// const auth = require("../middlewares/auth");
// router.get("/summary", auth, reportController.getSummaryReport);

router.get("/summary/2d", verifyToken, getTwoDigitSummaryReport);
router.get("/summary/3d", verifyToken, getThreeDigitSummaryReport);

// export excel
router.get("/summary/2d/export-excel", verifyToken, exportSummary2DExcel);
router.get("/summary/3d/export-excel", verifyToken, exportSummary3DExcel);

export default router;
