// src/controllers/keepSetting.controller.js
const mongoose = require("mongoose");
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

function buildPoolKey(betType, number) {
  return `${String(betType || "").trim()}|${String(number || "").trim()}`;
}

function splitKeepSendByNumberPool(
  keepDoc,
  runningTotals,
  betType,
  number,
  amount,
) {
  const keepSettingKey = betTypeToKeepKey(betType);
  const limit =
    keepSettingKey && keepDoc && typeof keepDoc[keepSettingKey] === "number"
      ? Number(keepDoc[keepSettingKey])
      : 0;

  const poolKey = buildPoolKey(betType, number);
  const used =
    typeof runningTotals[poolKey] === "number"
      ? Number(runningTotals[poolKey])
      : 0;

  const remain = Math.max(0, limit - used);
  const keep = Math.min(amount, remain);
  const send = Math.max(0, amount - keep);

  runningTotals[poolKey] = used + keep;

  return {
    keep_limit: limit,
    keep_amount: keep,
    send_amount: send,
  };
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

async function recalcOrdersForToday(ownerId, keepDoc) {
  const from = startOfToday();

  const query = {
    createdAt: { $gte: from },
  };

  if (ownerId) {
    query.created_by = new mongoose.Types.ObjectId(ownerId);
  }

  // ✅ เรียงตามเวลาจริง เพื่อให้กินโควต้าต่อเลขตามลำดับ
  const orders = await Order.find(query).sort({ createdAt: 1, _id: 1 }).lean();

  if (!orders.length) {
    return { matched: 0, modified: 0 };
  }

  // ✅ สะสม keep แยกตาม bet_type + number
  const runningTotals = {};

  const ops = [];

  for (const order of orders) {
    const newItems = (order.items || []).map((it) => {
      const amt = Number(it.amount || 0);

      const split = splitKeepSendByNumberPool(
        keepDoc,
        runningTotals,
        it.bet_type,
        it.number,
        amt,
      );

      return {
        ...it,
        keep_limit: split.keep_limit,
        keep_amount: split.keep_amount,
        send_amount: split.send_amount,
      };
    });

    ops.push({
      updateOne: {
        filter: { _id: order._id },
        update: { $set: { items: newItems } },
      },
    });
  }

  const r = await Order.bulkWrite(ops, { ordered: true });

  return {
    matched: r.matchedCount || 0,
    modified: r.modifiedCount || 0,
  };
}

// GET /api/keep-settings
exports.getKeepSettings = async (req, res) => {
  try {
    const ownerId = req.user?.id || req.user?._id || null;

    let doc = await KeepSetting.findOne({ ownerId }).lean();

    if (!doc) {
      const created = await KeepSetting.create({
        ownerId,
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

    // ✅ recalc ของวันนี้ใหม่ทั้งหมด แบบ "ต่อเลข"
    const recalc = await recalcOrdersForToday(ownerId, doc);

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
