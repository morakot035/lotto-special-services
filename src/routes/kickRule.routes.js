// src/routes/kickRule.routes.js
import express from "express";
const router = express.Router();

import {
  listKickRules,
  createKickRule,
  updateKickRule,
  deleteKickRule,
} from "../controllers/kickRule.controller.js";

import { verifyToken } from "../middlewares/verifyToken.js";

router.get("/", verifyToken, listKickRules);
router.post("/", verifyToken, createKickRule);
router.put("/:id", verifyToken, updateKickRule);
router.delete("/:id", verifyToken, deleteKickRule);

export default router;
