// src/controllers/order.controller.js
const mongoose = require("mongoose");
const Order = require("../models/Order");
const KeepSetting = require("../models/KeepSetting");
const {
  loadActiveKickRulesMap,
  getTodayPoolProgress,
  splitKeepSendByNumberPool,
} = require("../utils/keepPool");

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

    const kickRulesMap = await loadActiveKickRulesMap(userId);

    // ✅ replay วันนี้ทั้งหมดก่อน เพื่อให้รู้ progress จริงของ keep + kick send
    const { runningKeepTotals, runningKickSentTotals } =
      await getTodayPoolProgress(userId, keepDoc, kickRulesMap);

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

      const split = splitKeepSendByNumberPool(
        keepDoc,
        kickRulesMap,
        runningKeepTotals,
        runningKickSentTotals,
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

        keep_base_limit: split.keep_base_limit,
        keep_limit: split.keep_limit,
        keep_amount: split.keep_amount,
        send_amount: split.send_amount,
        kick_mode: split.kick_mode,
        kick_amount: split.kick_amount,
        kick_send_amount: split.kick_send_amount,

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
