// src/controllers/order.controller.js
const mongoose = require("mongoose");
const Order = require("../models/Order");
const KeepSetting = require("../models/KeepSetting");

function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

function toNumber(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : NaN;
}

function toBool(x) {
  if (typeof x === "boolean") return x;
  if (typeof x === "string") {
    if (x.toLowerCase() === "true") return true;
    if (x.toLowerCase() === "false") return false;
  }
  return null;
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

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// ✅ ยอด keep ที่ใช้ไปแล้วของวันนี้ "แยกตาม bet_type + number"
async function getTodayKeptTotals(userId) {
  const from = startOfToday();

  const match = {
    createdAt: { $gte: from },
  };

  if (userId) {
    match.created_by = new mongoose.Types.ObjectId(userId);
  }

  const rows = await Order.aggregate([
    { $match: match },
    { $unwind: "$items" },
    {
      $group: {
        _id: {
          bet_type: "$items.bet_type",
          number: "$items.number",
        },
        total_keep: { $sum: { $ifNull: ["$items.keep_amount", 0] } },
      },
    },
  ]);

  const totals = {};
  for (const row of rows) {
    const key = buildPoolKey(row._id.bet_type, row._id.number);
    totals[key] = Number(row.total_keep || 0);
  }

  return totals;
}

// ✅ ตัดเก็บตาม "ยอดต่อเลข" ของแต่ละประเภท
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

exports.createOrder = async (req, res) => {
  try {
    const { buyer_id, buyer_name, total_amount, items } = req.body || {};

    if (!buyer_id || !isValidObjectId(buyer_id)) {
      return res
        .status(400)
        .json({ ok: false, message: "buyer_id ไม่ถูกต้อง" });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res
        .status(400)
        .json({ ok: false, message: "items ต้องเป็น array และห้ามว่าง" });
    }

    const userId = req.user?.id || req.user?._id || null;

    const keepDoc = (await KeepSetting.findOne({ ownerId: userId }).lean()) || {
      three_top: 0,
      three_bottom: 0,
      three_tod: 0,
      two_top: 0,
      two_bottom: 0,
    };

    // ✅ ยอดที่ keep ไปแล้ววันนี้ แยกตาม "bet_type + number"
    const runningTotals = await getTodayKeptTotals(userId);

    const normalizedItems = [];

    for (const it of items) {
      if (!it) {
        return res.status(400).json({ ok: false, message: "items มีค่าว่าง" });
      }

      if (it.type !== "special" && it.type !== "quick") {
        return res
          .status(400)
          .json({ ok: false, message: "type ต้องเป็น special|quick" });
      }

      if (typeof it.bet_type !== "string" || !it.bet_type.trim()) {
        return res
          .status(400)
          .json({ ok: false, message: "bet_type ห้ามว่าง" });
      }

      if (typeof it.number !== "string" || !it.number.trim()) {
        return res.status(400).json({ ok: false, message: "number ห้ามว่าง" });
      }

      const amt = toNumber(it.amount);
      if (!Number.isFinite(amt) || amt <= 0) {
        return res
          .status(400)
          .json({ ok: false, message: "amount ต้องมากกว่า 0" });
      }

      const created_at = typeof it.created_at === "string" ? it.created_at : "";
      if (!created_at.trim()) {
        return res
          .status(400)
          .json({ ok: false, message: "created_at ห้ามว่าง" });
      }

      const betType = String(it.bet_type).trim();
      const number = String(it.number).trim();

      const is_locked_raw = it.is_locked;
      const lock_rate_raw = it.lock_rate;

      let is_locked = false;
      let lock_rate = 1;

      const b = toBool(is_locked_raw);
      if (b !== null) is_locked = b;

      if (
        lock_rate_raw !== undefined &&
        lock_rate_raw !== null &&
        lock_rate_raw !== ""
      ) {
        const lr = toNumber(lock_rate_raw);
        if (!Number.isFinite(lr) || lr <= 0 || lr > 1) {
          return res.status(400).json({
            ok: false,
            message: "lock_rate ต้องเป็นตัวเลข (0 < lock_rate <= 1)",
          });
        }
        lock_rate = lr;
      } else {
        if (is_locked) lock_rate = 0.5;
      }

      const payout_amount = is_locked ? amt * lock_rate : amt;

      // ✅ logic ใหม่: ตัดเก็บตามยอดสะสม "ต่อเลข"
      const split = splitKeepSendByNumberPool(
        keepDoc,
        runningTotals,
        betType,
        number,
        amt,
      );

      normalizedItems.push({
        type: it.type,
        bet_type: betType,
        number,
        amount: amt,
        created_at: String(created_at),

        keep_limit: split.keep_limit,
        keep_amount: split.keep_amount,
        send_amount: split.send_amount,

        is_locked,
        lock_rate,
        payout_amount,
      });
    }

    const computedTotal = normalizedItems.reduce(
      (s, it) => s + Number(it.amount || 0),
      0,
    );

    const total = toNumber(total_amount);
    if (!Number.isFinite(total) || total <= 0) {
      return res
        .status(400)
        .json({ ok: false, message: "total_amount ต้องมากกว่า 0" });
    }

    if (Math.abs(total - computedTotal) > 0.0001) {
      return res.status(400).json({
        ok: false,
        message: `total_amount ไม่ตรงกับผลรวมรายการ (ส่งมา ${total} แต่ควรเป็น ${computedTotal})`,
      });
    }

    const doc = await Order.create({
      buyer_id,
      buyer_name:
        typeof buyer_name === "string" ? buyer_name.trim() : undefined,
      total_amount: total,
      items: normalizedItems,
      created_by: userId || undefined,
      updated_by: userId || undefined,
    });

    return res.json({
      ok: true,
      message: "บันทึกคำสั่งซื้อสำเร็จ",
      data: {
        id: String(doc._id),
        buyer_id: String(doc.buyer_id),
        total_amount: doc.total_amount,
        createdAt: doc.createdAt,
      },
    });
  } catch (err) {
    console.error("createOrder error:", err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
};

exports.listOrders = async (req, res) => {
  try {
    const { buyer_id, limit } = req.query;

    const q = {};
    if (buyer_id) {
      if (!isValidObjectId(buyer_id)) {
        return res
          .status(400)
          .json({ ok: false, message: "buyer_id ไม่ถูกต้อง" });
      }
      q.buyer_id = buyer_id;
    }

    const lim = Math.min(Number(limit || 50), 200);

    const rows = await Order.find(q).sort({ createdAt: -1 }).limit(lim).lean();

    return res.json({ ok: true, data: rows });
  } catch (err) {
    console.error("listOrders error:", err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
};

exports.deleteEntry = async (req, res) => {
  try {
    const result = await Order.deleteMany({});
    res.status(200).json({ message: "ลบข้อมูลทั้งหมดสำเร็จ", result });
  } catch (error) {
    res.status(500).json({ message: "เกิดข้อผิดพลาด", error });
  }
};
