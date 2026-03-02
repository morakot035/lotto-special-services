// src/models/Rule.js
const mongoose = require("mongoose");

const RuleSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ["LOCK", "BLOCK"], required: true }, // LOCK=อั้น, BLOCK=ไม่รับซื้อ
    digits: { type: Number, enum: [2, 3], required: true }, // 2 หรือ 3
    number: { type: String, required: true }, // "12" หรือ "123"
    active: { type: Boolean, default: true },

    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    updated_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true },
);

// unique: ห้ามซ้ำ (ชนิดเดียวกัน+digitsเดียวกัน+เลขเดียวกัน)
RuleSchema.index({ kind: 1, digits: 1, number: 1 }, { unique: true });

module.exports = mongoose.model("Rule", RuleSchema);
