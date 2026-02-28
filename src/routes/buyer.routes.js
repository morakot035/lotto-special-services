import express from "express";
import {
  getBuyers,
  createBuyer,
  updateBuyer,
  deleteBuyer,
} from "../controllers/buyer.controller.js";
import { verifyToken } from "../middlewares/verifyToken.js";

const router = express.Router();

router.get("/", verifyToken, getBuyers);
router.post("/", verifyToken, createBuyer);
router.put("/:id", verifyToken, updateBuyer);
router.delete("/:id", verifyToken, deleteBuyer);

export default router;
