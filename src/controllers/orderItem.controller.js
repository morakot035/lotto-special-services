const mongoose = require("mongoose");
const Order = require("../models/Order");
const KeepSetting = require("../models/KeepSetting");
const { recalcOrdersForToday } = require("../utils/keepPool");

function toPositiveInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

// GET /api/order-items?page=1&pageSize=100&betType=ทั้งหมด&q=45
exports.listOrderItems = async (req, res) => {
  try {
    const page = toPositiveInt(req.query.page, 1);
    const pageSize = Math.min(toPositiveInt(req.query.pageSize, 100), 500);
    const skip = (page - 1) * pageSize;

    const betType =
      typeof req.query.betType === "string" ? req.query.betType.trim() : "";
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";

    const userId = req.user?.id || req.user?._id || null;

    const matchOrder = {};
    if (userId) {
      matchOrder.created_by = new mongoose.Types.ObjectId(userId);
    }

    const pipeline = [
      { $match: matchOrder },
      {
        $unwind: {
          path: "$items",
          includeArrayIndex: "item_index",
        },
      },
    ];

    const matchItem = {};

    if (betType && betType !== "ทั้งหมด") {
      matchItem["items.bet_type"] = betType;
    }

    if (q) {
      matchItem.$or = [
        { "items.number": { $regex: q, $options: "i" } },
        { buyer_name: { $regex: q, $options: "i" } },
      ];
    }

    if (Object.keys(matchItem).length > 0) {
      pipeline.push({ $match: matchItem });
    }

    pipeline.push(
      { $sort: { createdAt: -1, _id: -1, item_index: -1 } },
      {
        $facet: {
          rows: [
            { $skip: skip },
            { $limit: pageSize },
            {
              $project: {
                _id: 0,
                order_id: "$_id",
                item_index: 1,
                bet_type: "$items.bet_type",
                number: "$items.number",
                amount: { $ifNull: ["$items.amount", 0] },
                created_at: {
                  $ifNull: ["$items.created_at", "$createdAt"],
                },
                buyer_name: { $ifNull: ["$buyer_name", "-"] },
                is_locked: { $ifNull: ["$items.is_locked", false] },
                kick_mode: { $ifNull: ["$items.kick_mode", null] },
              },
            },
          ],
          totalCount: [{ $count: "count" }],
        },
      },
    );

    const result = await Order.aggregate(pipeline);
    const payload = result[0] || { rows: [], totalCount: [] };
    const total = payload.totalCount?.[0]?.count || 0;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    return res.json({
      success: true,
      data: {
        rows: payload.rows || [],
        pagination: {
          page,
          pageSize,
          total,
          totalPages,
        },
      },
    });
  } catch (err) {
    console.error("listOrderItems error:", err);
    return res.status(500).json({
      success: false,
      message: "listOrderItems failed",
    });
  }
};

// POST /api/order-items/bulk-delete
// body: { items: [{ order_id, item_index }] }
exports.bulkDeleteOrderItems = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id || null;
    const payloadItems = Array.isArray(req.body?.items) ? req.body.items : [];

    if (payloadItems.length === 0) {
      return res.status(400).json({
        success: false,
        message: "items ต้องเป็น array และห้ามว่าง",
      });
    }

    const grouped = new Map();

    for (const item of payloadItems) {
      const orderId = String(item?.order_id || "").trim();
      const itemIndex = Number(item?.item_index);

      if (!mongoose.Types.ObjectId.isValid(orderId)) {
        return res.status(400).json({
          success: false,
          message: `order_id ไม่ถูกต้อง: ${orderId}`,
        });
      }

      if (!Number.isInteger(itemIndex) || itemIndex < 0) {
        return res.status(400).json({
          success: false,
          message: `item_index ไม่ถูกต้อง: ${itemIndex}`,
        });
      }

      if (!grouped.has(orderId)) {
        grouped.set(orderId, []);
      }
      grouped.get(orderId).push(itemIndex);
    }

    let deletedCount = 0;

    for (const [orderId, indexes] of grouped.entries()) {
      const q = { _id: orderId };
      if (userId) {
        q.created_by = new mongoose.Types.ObjectId(userId);
      }

      const order = await Order.findOne(q);
      if (!order) continue;

      const sortedIndexes = [...indexes].sort((a, b) => b - a);

      for (const idx of sortedIndexes) {
        if (idx >= 0 && idx < order.items.length) {
          order.items.splice(idx, 1);
          deletedCount += 1;
        }
      }

      if (order.items.length === 0) {
        await Order.deleteOne({ _id: order._id });
      } else {
        order.total_amount = order.items.reduce(
          (sum, it) => sum + Number(it.amount || 0),
          0,
        );
        if (userId) {
          order.updated_by = userId;
        }
        await order.save();
      }
    }

    const keepDoc = (await KeepSetting.findOne({
      ownerId: userId || null,
    }).lean()) || {
      three_top: 0,
      three_bottom: 0,
      three_tod: 0,
      two_top: 0,
      two_bottom: 0,
    };

    const recalc = await recalcOrdersForToday(userId, keepDoc);

    return res.json({
      success: true,
      data: {
        deletedCount,
        recalc,
      },
    });
  } catch (err) {
    console.error("bulkDeleteOrderItems error:", err);
    return res.status(500).json({
      success: false,
      message: "bulkDeleteOrderItems failed",
    });
  }
};
