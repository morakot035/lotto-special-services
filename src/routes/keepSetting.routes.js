// src/routes/keepSetting.routes.js
import express from "express";

import {
  updateKeepSettings,
  getKeepSettings,
} from "../controllers/keepSetting.controller.js";

// ถ้าคุณมี middleware auth อยู่แล้ว ให้เปิดใช้
import { verifyToken } from "../middlewares/verifyToken.js";
const router = express.Router();

router.get("/fetch", verifyToken, getKeepSettings);
router.put("/update", verifyToken, updateKeepSettings);

export default router;
