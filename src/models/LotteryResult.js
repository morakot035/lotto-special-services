// src/models/LotteryResult.js
const mongoose = require("mongoose");

const LotteryResultSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    draw_date: { type: String, required: true, trim: true }, // เช่น 1/3/69
    three_top: { type: String, required: true, trim: true }, // สามตัวบน / เลขท้าย 3 ตัว
    two_bottom: { type: String, required: true, trim: true }, // สองตัวล่าง

    three_bottom_1: { type: String, required: true, trim: true },
    three_bottom_2: { type: String, required: true, trim: true },
    three_bottom_3: { type: String, required: true, trim: true },
    three_bottom_4: { type: String, required: true, trim: true },
  },
  { timestamps: true, collection: "lottery_results" },
);

LotteryResultSchema.index({ ownerId: 1, draw_date: 1 }, { unique: true });

module.exports =
  mongoose.models.LotteryResult ||
  mongoose.model("LotteryResult", LotteryResultSchema);
