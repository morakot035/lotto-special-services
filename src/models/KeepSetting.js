// src/models/KeepSetting.js
const mongoose = require("mongoose");

const KeepSettingSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // ✅ ตอนนี้หมายถึง "เพดานรวมต่อประเภท"
    three_top: { type: Number, default: 0 },
    three_bottom: { type: Number, default: 0 },
    three_tod: { type: Number, default: 0 },
    two_top: { type: Number, default: 0 },
    two_bottom: { type: Number, default: 0 },
  },
  { timestamps: true, collection: "keep_settings" },
);

KeepSettingSchema.index({ ownerId: 1 }, { unique: true });

module.exports =
  mongoose.models.KeepSetting ||
  mongoose.model("KeepSetting", KeepSettingSchema);
