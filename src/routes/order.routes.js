// src/routes/order.routes.js
import express from "express";

import { createOrder, listOrders } from "../controllers/order.controller.js";
const router = express.Router();

// ใช้ middleware auth ของคุณ (ดูชื่อไฟล์จริงในโปรเจกต์คุณ)
import { verifyToken } from "../middlewares/verifyToken.js";
// ถ้าคุณชื่อไฟล์/ฟังก์ชันไม่เหมือน ให้แก้บรรทัดนี้ให้ตรง

router.post("/orders", verifyToken, createOrder);
router.get("/orders", verifyToken, listOrders);

export default router;
