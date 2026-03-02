// src/controllers/order.controller.js
const mongoose = require("mongoose");
const Order = require("../models/Order");

function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

function toNumber(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : NaN;
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

    // validate items
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

      // created_at
      //   const dt = new Date(it.created_at);
      //   if (Number.isNaN(dt.getTime())) {
      //     return res
      //       .status(400)
      //       .json({ ok: false, message: "created_at ไม่ถูกต้อง" });
      //   }
    }

    // compute total from items (กันยิงมั่ว)
    const computedTotal = items.reduce(
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
      items: items.map((it) => ({
        type: it.type,
        bet_type: String(it.bet_type),
        number: String(it.number),
        amount: Number(it.amount),
        created_at: String(it.created_at),
      })),
      created_by: req.user?.id || req.user?._id || undefined, // ถ้า middleware ใส่ user
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
