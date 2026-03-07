// src/models/Order.js
const mongoose = require("mongoose");

const OrderItemSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["special", "quick"], required: true },
    bet_type: { type: String, required: true },
    number: { type: String, required: true },
    amount: { type: Number, required: true, min: 0 },
    created_at: { type: String, required: true },

    // keep/send
    keep_base_limit: { type: Number, default: 0 }, // keep setting เดิม
    keep_limit: { type: Number, default: 0 }, // effective keep หลังเตะเพิ่ม
    keep_amount: { type: Number, default: 0, min: 0 },
    send_amount: { type: Number, default: 0, min: 0 },

    // kick rule snapshot
    kick_mode: { type: String, default: null }, // FULL_SEND | REDUCE_KEEP | null
    kick_amount: { type: Number, default: 0 },

    is_locked: { type: Boolean, default: false },
    lock_rate: { type: Number, default: 1 },
    payout_amount: { type: Number, default: null },
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

    created_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    updated_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true, collection: "orders" },
);

module.exports = mongoose.models.Order || mongoose.model("Order", OrderSchema);
