// src/controllers/kickRule.controller.js
const mongoose = require("mongoose");
const KickRule = require("../models/KickRule");
const KeepSetting = require("../models/KeepSetting");
const { recalcOrdersForToday } = require("../utils/keepPool");

function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

function normalizeNumber(v) {
  return String(v || "").trim();
}

function normalizeBetType(v) {
  return String(v || "").trim();
}

function toNonNegativeNumber(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n;
}

function validatePayload(body) {
  const number = normalizeNumber(body.number);
  const bet_type = normalizeBetType(body.bet_type);
  const mode = String(body.mode || "").trim();
  const active = body.active === undefined ? true : !!body.active;
  const amount = toNonNegativeNumber(body.amount);

  const allowedBetTypes = [
    "สองตัวบน",
    "สองตัวล่าง",
    "สามตัวบน",
    "สามตัวล่าง",
    "สามตัวโต๊ด",
  ];
  const allowedModes = ["FULL_SEND", "REDUCE_KEEP"];

  if (!number) return "number ห้ามว่าง";
  if (!allowedBetTypes.includes(bet_type)) return "bet_type ไม่ถูกต้อง";
  if (!allowedModes.includes(mode)) return "mode ไม่ถูกต้อง";

  if (mode === "REDUCE_KEEP" && amount <= 0) {
    return "amount ต้องมากกว่า 0 เมื่อ mode = REDUCE_KEEP";
  }

  return null;
}

exports.listKickRules = async (req, res) => {
  try {
    const ownerId = null; // ✅ global — ไม่แยก user

    const rows = await KickRule.find({
      ownerId: null,
    })
      .sort({ updatedAt: -1, createdAt: -1 })
      .lean();

    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error("listKickRules failed:", err);
    return res
      .status(500)
      .json({ success: false, message: "listKickRules failed" });
  }
};

exports.createKickRule = async (req, res) => {
  try {
    const ownerId = null; // ✅ global — ไม่แยก user

    const errMsg = validatePayload(req.body || {});
    if (errMsg) {
      return res.status(400).json({ success: false, message: errMsg });
    }

    const payload = {
      ownerId: null,
      number: normalizeNumber(req.body.number),
      bet_type: normalizeBetType(req.body.bet_type),
      mode: String(req.body.mode).trim(),
      amount: toNonNegativeNumber(req.body.amount),
      active: req.body.active === undefined ? true : !!req.body.active,
    };

    const doc = await KickRule.findOneAndUpdate(
      {
        ownerId: null,
        number: payload.number,
        bet_type: payload.bet_type,
      },
      { $set: payload },
      { new: true, upsert: true },
    ).lean();

    const keepDoc = (await KeepSetting.findOne({
      ownerId: null,
    }).lean()) || {
      three_top: 0,
      three_bottom: 0,
      three_tod: 0,
      two_top: 0,
      two_bottom: 0,
    };

    const recalc = await recalcOrdersForToday(null, keepDoc);

    return res.json({ success: true, data: doc, recalc });
  } catch (err) {
    console.error("createKickRule failed:", err);
    return res
      .status(500)
      .json({ success: false, message: "createKickRule failed" });
  }
};

exports.updateKickRule = async (req, res) => {
  try {
    const ownerId = null; // ✅ global — ไม่แยก user
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "id ไม่ถูกต้อง" });
    }

    const current = await KickRule.findOne({
      _id: id,
      ownerId: null,
    }).lean();
    if (!current) {
      return res
        .status(404)
        .json({ success: false, message: "ไม่พบ kick rule" });
    }

    const next = {
      number: req.body.number ?? current.number,
      bet_type: req.body.bet_type ?? current.bet_type,
      mode: req.body.mode ?? current.mode,
      amount: req.body.amount ?? current.amount,
      active: req.body.active ?? current.active,
    };

    const errMsg = validatePayload(next);
    if (errMsg) {
      return res.status(400).json({ success: false, message: errMsg });
    }

    const doc = await KickRule.findOneAndUpdate(
      { _id: id, ownerId: null },
      {
        $set: {
          number: normalizeNumber(next.number),
          bet_type: normalizeBetType(next.bet_type),
          mode: String(next.mode).trim(),
          amount: toNonNegativeNumber(next.amount),
          active: !!next.active,
        },
      },
      { new: true },
    ).lean();

    const keepDoc = (await KeepSetting.findOne({
      ownerId: null,
    }).lean()) || {
      three_top: 0,
      three_bottom: 0,
      three_tod: 0,
      two_top: 0,
      two_bottom: 0,
    };

    const recalc = await recalcOrdersForToday(null, keepDoc);

    return res.json({ success: true, data: doc, recalc });
  } catch (err) {
    console.error("updateKickRule failed:", err);
    return res
      .status(500)
      .json({ success: false, message: "updateKickRule failed" });
  }
};

exports.deleteKickRule = async (req, res) => {
  try {
    const ownerId = null; // ✅ global — ไม่แยก user
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "id ไม่ถูกต้อง" });
    }

    const doc = await KickRule.findOneAndDelete({
      _id: id,
      ownerId: null,
    }).lean();
    if (!doc) {
      return res
        .status(404)
        .json({ success: false, message: "ไม่พบ kick rule" });
    }

    const keepDoc = (await KeepSetting.findOne({
      ownerId: null,
    }).lean()) || {
      three_top: 0,
      three_bottom: 0,
      three_tod: 0,
      two_top: 0,
      two_bottom: 0,
    };

    const recalc = await recalcOrdersForToday(null, keepDoc);

    return res.json({ success: true, data: doc, recalc });
  } catch (err) {
    console.error("deleteKickRule failed:", err);
    return res
      .status(500)
      .json({ success: false, message: "deleteKickRule failed" });
  }
};
