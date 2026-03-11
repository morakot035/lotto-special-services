// src/routes/lotteryResult.routes.js
import express from "express";
const router = express.Router();

import {
  getLatestLotteryResult,
  saveAndCheckLottery,
} from "../controllers/lotteryResult.controller.js";
import { verifyToken } from "../middlewares/verifyToken.js";

router.get("/latest", verifyToken, getLatestLotteryResult);
router.post("/check", verifyToken, saveAndCheckLottery);

export default router;
