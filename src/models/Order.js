// src/models/Order.js
const mongoose = require("mongoose");

const OrderItemSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["special", "quick"], required: true }, // special | quick
    bet_type: { type: String, required: true }, // เช่น "สามตัวบน", "สองตัวล่าง"
    number: { type: String, required: true }, // เช่น "123"
    amount: { type: Number, required: true, min: 0 }, // ✅ ยอดซื้อเต็ม
    created_at: { type: String, required: true },

    // ✅ เลขอั้น (มีผลตอน "จ่าย" ไม่ใช่ตอนซื้อ)
    is_locked: { type: Boolean, default: false },
    lock_rate: { type: Number, default: 1 }, // 1=จ่ายเต็ม, 0.5=จ่ายครึ่ง

    // ✅ เก็บค่าไว้ช่วยตอนคำนวณตอนจ่าย (optional)
    payout_amount: { type: Number, default: null }, // ถ้าอยากเก็บ = amount*lock_rate
  },
  { _id: false },
);

const OrderSchema = new mongoose.Schema(
  {
    buyer_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Buyer",
      required: true,
    },
    buyer_name: { type: String },
    total_amount: { type: Number, required: true, min: 0 }, // ✅ ยอดซื้อรวม (เต็ม)
    items: { type: [OrderItemSchema], required: true },

    created_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    updated_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true, collection: "orders" },
);

module.exports = mongoose.models.Order || mongoose.model("Order", OrderSchema);
