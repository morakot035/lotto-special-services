// src/models/KeepSetting.js
const mongoose = require("mongoose");

const KeepSettingSchema = new mongoose.Schema(
  {
    // ถ้าคุณมีระบบหลายเจ้ามือ แนะนำใส่ ownerId (user/admin id)
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // ไม่เอาเลขวิ่ง => มีแค่นี้พอ
    three_top: { type: Number, default: 0 }, // สามตัวบน
    three_bottom: { type: Number, default: 0 }, // สามตัวล่าง
    three_tod: { type: Number, default: 0 }, // สามตัวโต๊ด
    two_top: { type: Number, default: 0 }, // สองตัวบน
    two_bottom: { type: Number, default: 0 }, // สองตัวล่าง
  },
  { timestamps: true },
);

// ให้ 1 owner มีได้ 1 เอกสาร
KeepSettingSchema.index({ ownerId: 1 }, { unique: true });

module.exports = mongoose.model("KeepSetting", KeepSettingSchema);
