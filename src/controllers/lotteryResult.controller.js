// src/controllers/lotteryResult.controller.js
const mongoose = require("mongoose");
const LotteryResult = require("../models/LotteryResult");
const Order = require("../models/Order");

function normalizeDigits(value) {
  return String(value || "")
    .replace(/\D/g, "")
    .trim();
}

function isThreeDigits(value) {
  return /^\d{3}$/.test(String(value || ""));
}

function isTwoDigits(value) {
  return /^\d{2}$/.test(String(value || ""));
}

function getPermutations3(input) {
  const s = String(input || "");
  if (s.length !== 3) return [];
  const arr = s.split("");
  const set = new Set();

  for (let i = 0; i < arr.length; i += 1) {
    for (let j = 0; j < arr.length; j += 1) {
      for (let k = 0; k < arr.length; k += 1) {
        if (i !== j && j !== k && i !== k) {
          set.add(`${arr[i]}${arr[j]}${arr[k]}`);
        }
      }
    }
  }

  return Array.from(set);
}

function buildEmptyGroup(label) {
  return {
    bet_type: label,
    total_amount: 0,
    total_count: 0,
    rows: [],
  };
}

function pushWinner(group, row) {
  group.total_amount += Number(row.amount || 0);
  group.total_count += 1;
  group.rows.push(row);
}

// POST /api/lottery-results/check
exports.saveAndCheckLottery = async (req, res) => {
  try {
    const ownerId = req.user?.id || req.user?._id || null;

    const draw_date = String(req.body?.draw_date || "").trim();
    const three_top = normalizeDigits(req.body?.three_top);
    const two_bottom = normalizeDigits(req.body?.two_bottom);
    const three_bottom_1 = normalizeDigits(req.body?.three_bottom_1);
    const three_bottom_2 = normalizeDigits(req.body?.three_bottom_2);
    const three_bottom_3 = normalizeDigits(req.body?.three_bottom_3);
    const three_bottom_4 = normalizeDigits(req.body?.three_bottom_4);

    if (!draw_date) {
      return res.status(400).json({
        success: false,
        message: "กรุณากรอกวันที่หวยออก/งวด",
      });
    }

    if (
      !isThreeDigits(three_top) ||
      !isTwoDigits(two_bottom) ||
      !isThreeDigits(three_bottom_1) ||
      !isThreeDigits(three_bottom_2) ||
      !isThreeDigits(three_bottom_3) ||
      !isThreeDigits(three_bottom_4)
    ) {
      return res.status(400).json({
        success: false,
        message: "กรุณากรอกผลหวยให้ครบและรูปแบบตัวเลขให้ถูกต้อง",
      });
    }

    const savedResult = await LotteryResult.findOneAndUpdate(
      {
        ownerId: ownerId || null,
        draw_date,
      },
      {
        $set: {
          ownerId: ownerId || null,
          draw_date,
          three_top,
          two_bottom,
          three_bottom_1,
          three_bottom_2,
          three_bottom_3,
          three_bottom_4,
        },
      },
      { new: true, upsert: true },
    ).lean();

    const orderQuery = {};
    if (ownerId) {
      orderQuery.created_by = new mongoose.Types.ObjectId(ownerId);
    }

    const orders = await Order.find(orderQuery)
      .sort({ createdAt: -1, _id: -1 })
      .lean();

    const two_top = three_top.slice(-2);
    const threeBottomSet = new Set([
      three_bottom_1,
      three_bottom_2,
      three_bottom_3,
      three_bottom_4,
    ]);
    const threeTodSet = new Set(getPermutations3(three_top));

    const groups = {
      สามตัวล่าง: buildEmptyGroup("สามตัวล่าง"),
      สามตัวบน: buildEmptyGroup("สามตัวบน"),
      สามตัวโต๊ด: buildEmptyGroup("สามตัวโต๊ด"),
      สองตัวล่าง: buildEmptyGroup("สองตัวล่าง"),
      สองตัวบน: buildEmptyGroup("สองตัวบน"),
    };

    for (const order of orders) {
      for (const item of order.items || []) {
        const betType = String(item.bet_type || "").trim();
        const number = String(item.number || "").trim();
        const amount = Number(item.amount || 0);

        let isWin = false;

        if (betType === "สามตัวบน" && number === three_top) {
          isWin = true;
        }

        if (betType === "สามตัวโต๊ด" && threeTodSet.has(number)) {
          isWin = true;
        }

        if (betType === "สองตัวบน" && number === two_top) {
          isWin = true;
        }

        if (betType === "สองตัวล่าง" && number === two_bottom) {
          isWin = true;
        }

        if (betType === "สามตัวล่าง" && threeBottomSet.has(number)) {
          isWin = true;
        }

        if (!isWin) continue;

        pushWinner(groups[betType], {
          order_id: String(order._id),
          buyer_id: order.buyer_id ? String(order.buyer_id) : "",
          buyer_name: order.buyer_name || "-",
          bet_type: betType,
          number,
          amount,
          created_at: item.created_at || order.createdAt,
        });
      }
    }

    const summary = [
      groups["สามตัวล่าง"],
      groups["สามตัวบน"],
      groups["สามตัวโต๊ด"],
      groups["สองตัวล่าง"],
      groups["สองตัวบน"],
    ].filter((x) => x.total_count > 0);

    return res.json({
      success: true,
      data: {
        result: {
          draw_date,
          three_top,
          two_top,
          two_bottom,
          three_bottom_1,
          three_bottom_2,
          three_bottom_3,
          three_bottom_4,
        },
        summary,
      },
    });
  } catch (err) {
    console.error("saveAndCheckLottery error:", err);
    return res.status(500).json({
      success: false,
      message: "saveAndCheckLottery failed",
    });
  }
};

// GET /api/lottery-results/latest
exports.getLatestLotteryResult = async (req, res) => {
  try {
    const ownerId = req.user?.id || req.user?._id || null;

    const q = { ownerId: ownerId || null };

    const row = await LotteryResult.findOne(q)
      .sort({ updatedAt: -1, createdAt: -1 })
      .lean();

    return res.json({
      success: true,
      data: row || null,
    });
  } catch (err) {
    console.error("getLatestLotteryResult error:", err);
    return res.status(500).json({
      success: false,
      message: "getLatestLotteryResult failed",
    });
  }
};
