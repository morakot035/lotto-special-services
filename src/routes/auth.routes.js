import { Router } from "express";
import { register, login, me } from "../controllers/auth.controller.js";
import { verifyToken } from "../middlewares/verifyToken.js";

const router = Router();

router.post("/register", register); // ✅ เปิดให้คนทั่วไปสมัคร
router.post("/login", login); // ✅ เปิดให้ login
router.get("/me", verifyToken, me); // ✅ ต้องมี token ถึงเข้าได้

export default router;
