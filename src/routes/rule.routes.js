// src/routes/rule.routes.js
import express from "express";

import { verifyToken } from "../middlewares/verifyToken.js";
import {
  listRules,
  createRules,
  updateRule,
  deleteRule,
} from "../controllers/rule.controller.js";

const router = express.Router();

// ต้อง login ก่อน (เหมือน buyer/order)
router.get("/rules", verifyToken, listRules);
router.post("/rules", verifyToken, createRules);
router.put("/rules/:id", verifyToken, updateRule);
router.delete("/rules/:id", verifyToken, deleteRule);

export default router;
