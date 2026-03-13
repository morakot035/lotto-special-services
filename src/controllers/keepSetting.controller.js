// src/controllers/keepSetting.controller.js
const KeepSetting = require("../models/KeepSetting");
const { recalcOrdersForToday } = require("../utils/keepPool");

function toNonNegativeNumber(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n;
}

function sanitizePayload(body) {
  return {
    three_top: toNonNegativeNumber(body.three_top),
    three_bottom: toNonNegativeNumber(body.three_bottom),
    three_tod: toNonNegativeNumber(body.three_tod),
    two_top: toNonNegativeNumber(body.two_top),
    two_bottom: toNonNegativeNumber(body.two_bottom),
  };
}

exports.getKeepSettings = async (req, res) => {
  try {
    const ownerId = null; // ✅ global — ไม่แยก user

    let doc = await KeepSetting.findOne({ ownerId: null }).lean();

    if (!doc) {
      const created = await KeepSetting.create({
        ownerId: null,
        three_top: 0,
        three_bottom: 0,
        three_tod: 0,
        two_top: 0,
        two_bottom: 0,
      });
      doc = created.toObject();
    }

    return res.json({ success: true, data: doc });
  } catch (err) {
    console.error("getKeepSettings failed:", err);
    return res.status(500).json({
      success: false,
      message: "getKeepSettings failed",
    });
  }
};

exports.updateKeepSettings = async (req, res) => {
  try {
    const ownerId = null; // ✅ global — ไม่แยก user
    const payload = sanitizePayload(req.body);

    const doc = await KeepSetting.findOneAndUpdate(
      { ownerId: null },
      { $set: payload },
      { new: true, upsert: true },
    ).lean();

    const recalc = await recalcOrdersForToday(null, doc);

    return res.json({
      success: true,
      data: doc,
      recalc,
    });
  } catch (err) {
    console.error("updateKeepSettings failed:", err);
    return res.status(500).json({
      success: false,
      message: "updateKeepSettings failed",
    });
  }
};
