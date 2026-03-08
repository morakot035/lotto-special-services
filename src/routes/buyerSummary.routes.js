import express from "express";
const router = express.Router();

import {
  listBuyerSummaries,
  getBuyerSummaryDetails,
} from "../controllers/buyerSummary.controller.js";
import { verifyToken } from "../middlewares/verifyToken.js";

router.get("/", verifyToken, listBuyerSummaries);
router.get("/:buyerId/details", verifyToken, getBuyerSummaryDetails);

export default router;
