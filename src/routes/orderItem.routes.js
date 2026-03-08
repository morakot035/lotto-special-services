import express from "express";
const router = express.Router();

import {
  listOrderItems,
  bulkDeleteOrderItems,
} from "../controllers/orderItem.controller.js";
import { verifyToken } from "../middlewares/verifyToken.js";

router.get("/", verifyToken, listOrderItems);
router.post("/bulk-delete", verifyToken, bulkDeleteOrderItems);
export default router;
