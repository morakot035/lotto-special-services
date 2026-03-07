// src/models/KickRule.js
const mongoose = require("mongoose");

const KickRuleSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    number: { type: String, required: true, trim: true },
    bet_type: {
      type: String,
      required: true,
      enum: ["สองตัวบน", "สองตัวล่าง", "สามตัวบน", "สามตัวล่าง", "สามตัวโต๊ด"],
    },

    // FULL_SEND = เตะออกหมด
    // REDUCE_KEEP = ลด keep ลงจาก keep setting
    mode: {
      type: String,
      required: true,
      enum: ["FULL_SEND", "REDUCE_KEEP"],
    },

    amount: { type: Number, default: 0, min: 0 }, // ใช้ตอน REDUCE_KEEP
    active: { type: Boolean, default: true },
  },
  { timestamps: true, collection: "kick_rules" },
);

KickRuleSchema.index({ ownerId: 1, number: 1, bet_type: 1 }, { unique: true });

module.exports =
  mongoose.models.KickRule || mongoose.model("KickRule", KickRuleSchema);
