// src/models/Order.js
const mongoose = require("mongoose");

const OrderItemSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["special", "quick"], required: true }, // special | quick
    bet_type: { type: String, required: true }, // เช่น "สามตัวบน", "สองตัวล่าง", หรือ label ที่ส่งมา
    number: { type: String, required: true }, // เช่น "123"
    amount: { type: Number, required: true, min: 0 },
    created_at: { type: String, required: true },
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
    total_amount: { type: Number, required: true, min: 0 },
    items: { type: [OrderItemSchema], required: true },
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // ถ้ามี user จาก token
  },
  { timestamps: true, collection: "orders" },
);

module.exports = mongoose.models.Order || mongoose.model("Order", OrderSchema);
