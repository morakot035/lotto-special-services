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

// สร้าง permutations ทั้งหมดของเลข 3 ตัว (สำหรับโต๊ด)
function getPermutations3(input) {
  const s = String(input || "");
  if (s.length !== 3) return [];
  const arr = s.split("");
  const set = new Set();
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      for (let k = 0; k < 3; k++)
        if (i !== j && j !== k && i !== k)
          set.add(`${arr[i]}${arr[j]}${arr[k]}`);
  return Array.from(set);
}

// canonical key สำหรับโต๊ด (เรียงตัวเลข) เช่น 321 → 123
function canonicalTod(n) {
  return String(n || "")
    .split("")
    .sort()
    .join("");
}

function buildEmptyGroup(label) {
  return { bet_type: label, total_amount: 0, total_count: 0, rows: [] };
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

    if (!draw_date)
      return res
        .status(400)
        .json({ success: false, message: "กรุณากรอกวันที่หวยออก/งวด" });

    if (
      !isThreeDigits(three_top) ||
      !isTwoDigits(two_bottom) ||
      !isThreeDigits(three_bottom_1) ||
      !isThreeDigits(three_bottom_2) ||
      !isThreeDigits(three_bottom_3) ||
      !isThreeDigits(three_bottom_4)
    )
      return res
        .status(400)
        .json({
          success: false,
          message: "กรุณากรอกผลหวยให้ครบและรูปแบบตัวเลขให้ถูกต้อง",
        });

    // บันทึกผล
    await LotteryResult.findOneAndUpdate(
      { ownerId: ownerId || null, draw_date },
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

    // ── เตรียม lookup values ────────────────────────────────────────────────

    // 2 ตัวบน = 2 ตัวท้ายของ 3 ตัวบน
    const two_top = three_top.slice(-2);

    // 3 ตัวล่าง (ชุด 4 เลข)
    const threeBottomSet = new Set([
      three_bottom_1,
      three_bottom_2,
      three_bottom_3,
      three_bottom_4,
    ]);

    // โต๊ด = permutation ทั้งหมดของ 3 ตัวบน
    // รองรับทั้งเลขที่ store เป็นตัวจริง (321) และ canonical (123)
    const threeTodPerms = new Set(getPermutations3(three_top)); // เลขจริงทุก permutation
    const threeTodCanon = canonicalTod(three_top); // canonical key

    // ── ดึง orders ─────────────────────────────────────────────────────────
    const orderQuery = {};
    if (ownerId) orderQuery.created_by = new mongoose.Types.ObjectId(ownerId);

    const orders = await Order.find(orderQuery)
      .sort({ createdAt: -1, _id: -1 })
      .lean();

    // ── groups (รวม 3ตัวบน + โต๊ด เป็น group เดียว) ───────────────────────
    const groups = {
      "สามตัวบน+โต๊ด": buildEmptyGroup("สามตัวบน+โต๊ด"),
      สามตัวล่าง: buildEmptyGroup("สามตัวล่าง"),
      สองตัวบน: buildEmptyGroup("สองตัวบน"),
      สองตัวล่าง: buildEmptyGroup("สองตัวล่าง"),
    };

    for (const order of orders) {
      for (const item of order.items || []) {
        const betType = String(item.bet_type || "").trim();
        const number = String(item.number || "").trim();
        const amount = Number(item.amount || 0);

        const baseRow = {
          order_id: String(order._id),
          buyer_id: order.buyer_id ? String(order.buyer_id) : "",
          buyer_name: order.buyer_name || "-",
          bet_type: betType,
          number,
          amount,
          created_at: item.created_at || order.createdAt,
        };

        // ✅ 3 ตัวบน
        if (betType === "สามตัวบน" && number === three_top) {
          pushWinner(groups["สามตัวบน+โต๊ด"], baseRow);
          continue;
        }

        // ✅ 3 ตัวโต๊ด — รองรับทั้ง store เป็นตัวจริงและ canonical
        if (betType === "สามตัวโต๊ด") {
          const isMatch =
            threeTodPerms.has(number) || // เลขตรง permutation
            canonicalTod(number) === threeTodCanon; // canonical ตรงกัน
          if (isMatch) {
            pushWinner(groups["สามตัวบน+โต๊ด"], baseRow);
            continue;
          }
        }

        // ✅ 2 ตัวบน (2 ตัวท้ายของ 3 ตัวบน)
        if (betType === "สองตัวบน" && number === two_top) {
          pushWinner(groups["สองตัวบน"], baseRow);
          continue;
        }

        // ✅ 2 ตัวล่าง
        if (betType === "สองตัวล่าง" && number === two_bottom) {
          pushWinner(groups["สองตัวล่าง"], baseRow);
          continue;
        }

        // ✅ 3 ตัวล่าง
        if (betType === "สามตัวล่าง" && threeBottomSet.has(number)) {
          pushWinner(groups["สามตัวล่าง"], baseRow);
          continue;
        }
      }
    }

    const summary = [
      groups["สามตัวบน+โต๊ด"],
      groups["สามตัวล่าง"],
      groups["สองตัวบน"],
      groups["สองตัวล่าง"],
    ].filter((g) => g.total_count > 0);

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
    return res
      .status(500)
      .json({ success: false, message: "saveAndCheckLottery failed" });
  }
};

// GET /api/lottery-results/latest
exports.getLatestLotteryResult = async (req, res) => {
  try {
    const ownerId = req.user?.id || req.user?._id || null;
    const row = await LotteryResult.findOne({ ownerId: ownerId || null })
      .sort({ updatedAt: -1, createdAt: -1 })
      .lean();
    return res.json({ success: true, data: row || null });
  } catch (err) {
    console.error("getLatestLotteryResult error:", err);
    return res
      .status(500)
      .json({ success: false, message: "getLatestLotteryResult failed" });
  }
};
