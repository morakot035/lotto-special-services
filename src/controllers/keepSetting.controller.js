// src/controllers/keepSetting.controller.js
const KeepSetting = require("../models/KeepSetting");
const Order = require("../models/Order");

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

function betTypeToKeepKey(betType) {
  const t = String(betType || "").trim();
  if (t === "สามตัวบน") return "three_top";
  if (t === "สามตัวล่าง") return "three_bottom";
  if (t === "สามตัวโต๊ด") return "three_tod";
  if (t === "สองตัวบน") return "two_top";
  if (t === "สองตัวล่าง") return "two_bottom";
  return null;
}

function splitKeepSend(keepDoc, betType, amount) {
  const key = betTypeToKeepKey(betType);
  const keepLimit =
    key && keepDoc && typeof keepDoc[key] === "number" ? keepDoc[key] : 0;

  const keep = Math.min(amount, keepLimit);
  const send = Math.max(0, amount - keepLimit);

  return { keep_limit: keepLimit, keep_amount: keep, send_amount: send };
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

async function recalcOrdersForToday(ownerId, keepDoc) {
  if (!ownerId) return { matched: 0, modified: 0 };

  const from = startOfToday();

  const orders = await Order.find({
    created_by: ownerId,
    createdAt: { $gte: from },
  }).lean();

  if (!orders.length) return { matched: 0, modified: 0 };

  const ops = orders.map((o) => {
    const newItems = (o.items || []).map((it) => {
      const amt = Number(it.amount || 0);
      const split = splitKeepSend(keepDoc, it.bet_type, amt);
      return { ...it, ...split };
    });

    return {
      updateOne: {
        filter: { _id: o._id },
        update: { $set: { items: newItems } },
      },
    };
  });

  const r = await Order.bulkWrite(ops, { ordered: false });
  return { matched: r.matchedCount || 0, modified: r.modifiedCount || 0 };
}

// GET /api/keep-settings
exports.getKeepSettings = async (req, res) => {
  try {
    const ownerId = req.user?.id || req.user?._id || null;

    let doc = await KeepSetting.findOne({ ownerId }).lean();
    if (!doc) {
      const created = await KeepSetting.create({ ownerId });
      doc = created.toObject();
    }

    return res.json({ success: true, data: doc });
  } catch (err) {
    return res
      .status(500)
      .json({
        success: false,
        message: "getKeepSettings failed",
        error: String(err),
      });
  }
};

// PUT /api/keep-settings
exports.updateKeepSettings = async (req, res) => {
  try {
    const ownerId = req.user?.id || req.user?._id || null;
    const payload = sanitizePayload(req.body);

    const doc = await KeepSetting.findOneAndUpdate(
      { ownerId },
      { $set: payload },
      { new: true, upsert: true },
    ).lean();

    // ✅ อัปเดต order ของ “วันนี้” ให้คำนวณใหม่
    const recalc = await recalcOrdersForToday(ownerId, doc);

    return res.json({ success: true, data: doc, recalc });
  } catch (err) {
    return res
      .status(500)
      .json({
        success: false,
        message: "updateKeepSettings failed",
        error: String(err),
      });
  }
};
