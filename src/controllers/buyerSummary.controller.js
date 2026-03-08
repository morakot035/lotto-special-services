const mongoose = require("mongoose");
const Order = require("../models/Order");

function toPositiveInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

// GET /api/buyer-summary?page=1&pageSize=10
exports.listBuyerSummaries = async (req, res) => {
  try {
    const page = toPositiveInt(req.query.page, 1);
    const pageSize = Math.min(toPositiveInt(req.query.pageSize, 10), 100);
    const skip = (page - 1) * pageSize;

    const userId = req.user?.id || req.user?._id || null;

    const match = {};
    if (userId) {
      match.created_by = new mongoose.Types.ObjectId(userId);
    }

    const grouped = await Order.aggregate([
      { $match: match },
      {
        $group: {
          _id: {
            buyer_id: "$buyer_id",
            buyer_name: "$buyer_name",
          },
          total_amount: { $sum: { $ifNull: ["$total_amount", 0] } },
          order_count: { $sum: 1 },
          last_created_at: { $max: "$createdAt" },
        },
      },
      {
        $project: {
          _id: 0,
          buyer_id: "$_id.buyer_id",
          buyer_name: { $ifNull: ["$_id.buyer_name", "-"] },
          total_amount: 1,
          order_count: 1,
          last_created_at: 1,
        },
      },
      { $sort: { total_amount: -1, buyer_name: 1 } },
      {
        $facet: {
          rows: [{ $skip: skip }, { $limit: pageSize }],
          totalCount: [{ $count: "count" }],
        },
      },
    ]);

    const payload = grouped[0] || { rows: [], totalCount: [] };
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
    console.error("listBuyerSummaries error:", err);
    return res.status(500).json({
      success: false,
      message: "listBuyerSummaries failed",
    });
  }
};

// GET /api/buyer-summary/:buyerId/details?page=1&pageSize=50
exports.getBuyerSummaryDetails = async (req, res) => {
  try {
    const { buyerId } = req.params;
    const page = toPositiveInt(req.query.page, 1);
    const pageSize = Math.min(toPositiveInt(req.query.pageSize, 50), 500);
    const skip = (page - 1) * pageSize;

    if (!mongoose.Types.ObjectId.isValid(buyerId)) {
      return res.status(400).json({
        success: false,
        message: "buyerId ไม่ถูกต้อง",
      });
    }

    const userId = req.user?.id || req.user?._id || null;

    const match = {
      buyer_id: new mongoose.Types.ObjectId(buyerId),
    };

    if (userId) {
      match.created_by = new mongoose.Types.ObjectId(userId);
    }

    const result = await Order.aggregate([
      { $match: match },
      { $sort: { createdAt: -1, _id: -1 } },
      {
        $facet: {
          meta: [
            {
              $group: {
                _id: "$buyer_id",
                buyer_name: { $first: "$buyer_name" },
                total_amount: { $sum: { $ifNull: ["$total_amount", 0] } },
                order_count: { $sum: 1 },
              },
            },
          ],
          rows: [
            { $skip: skip },
            { $limit: pageSize },
            { $unwind: "$items" },
            {
              $project: {
                _id: 0,
                order_id: "$_id",
                buyer_name: "$buyer_name",
                order_created_at: "$createdAt",
                bet_type: "$items.bet_type",
                number: "$items.number",
                amount: { $ifNull: ["$items.amount", 0] },
                keep_amount: { $ifNull: ["$items.keep_amount", 0] },
                send_amount: { $ifNull: ["$items.send_amount", 0] },
                is_locked: { $ifNull: ["$items.is_locked", false] },
                kick_mode: { $ifNull: ["$items.kick_mode", null] },
              },
            },
          ],
          orderCount: [{ $count: "count" }],
        },
      },
    ]);

    const payload = result[0] || { meta: [], rows: [], orderCount: [] };
    const meta = payload.meta?.[0] || {
      buyer_name: "-",
      total_amount: 0,
      order_count: 0,
    };
    const totalOrders = payload.orderCount?.[0]?.count || 0;
    const totalPages = Math.max(1, Math.ceil(totalOrders / pageSize));

    return res.json({
      success: true,
      data: {
        buyer: meta,
        rows: payload.rows || [],
        pagination: {
          page,
          pageSize,
          total: totalOrders,
          totalPages,
        },
      },
    });
  } catch (err) {
    console.error("getBuyerSummaryDetails error:", err);
    return res.status(500).json({
      success: false,
      message: "getBuyerSummaryDetails failed",
    });
  }
};
