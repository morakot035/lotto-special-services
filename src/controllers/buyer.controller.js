import Buyer from "../models/Buyer.js";
import { sendErrorResponse } from "../utils/sendError.js";

// ✅ GET /api/buyers
export const getBuyers = async (req, res) => {
  try {
    const buyers = await Buyer.find();
    res.json({ success: true, data: buyers });
  } catch (error) {
    sendErrorResponse(res, 500, "SERVER_ERROR", "เกิดข้อผิดพลาดจากเซิร์ฟเวอร์");
  }
};

// ✅ POST /api/buyers
export const createBuyer = async (req, res) => {
  try {
    const { name, phone } = req.body;
    const newBuyer = new Buyer({ name, phone });
    await newBuyer.save();
    res.status(201).json({ success: true, data: newBuyer });
  } catch (error) {
    return sendErrorResponse(
      res,
      400,
      "VALIDATION_ERROR",
      "ไม่สามารถเพิ่มผู้ซื้อได้",
    );
  }
};

// ✅ PUT /api/buyers/:id
export const updateBuyer = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, phone } = req.body;
    const updated = await Buyer.findByIdAndUpdate(
      id,
      { name, phone },
      { new: true },
    );

    if (!updated) {
      return sendErrorResponse(res, 404, "NOT_FOUND", "ไม่พบผู้ซื้อ");
    }

    res.json({ success: true, data: updated });
  } catch (error) {
    return sendErrorResponse(
      res,
      400,
      "UPDATE_ERROR",
      "ไม่สามารถแก้ไขข้อมูลได้",
    );
  }
};

export const deleteBuyer = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Buyer.findByIdAndDelete(id);

    if (!deleted) {
      return sendErrorResponse(
        res,
        404,
        "NOT_FOUND",
        "ไม่พบผู้ซื้อที่ต้องการลบ",
      );
    }

    res.json({ success: true, message: "ลบผู้ซื้อเรียบร้อยแล้ว" });
  } catch (error) {
    return sendErrorResponse(res, 400, "DELETE_ERROR", "ไม่สามารถลบข้อมูลได้");
  }
};
