// src/utils/keepPool.js
const mongoose = require("mongoose");
const Order = require("../models/Order");
const KickRule = require("../models/KickRule");

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

function ownerIdToFilter(ownerId) {
  if (!ownerId) return null;
  return new mongoose.Types.ObjectId(ownerId);
}

async function loadActiveKickRulesMap(ownerId) {
  const q = {
    active: true,
    ownerId: ownerId ? ownerIdToFilter(ownerId) : null,
  };

  const rows = await KickRule.find(q).lean();

  const map = {};
  for (const row of rows) {
    const key = buildPoolKey(row.bet_type, row.number);
    map[key] = row;
  }

  return map;
}

function getRuleInfo(keepDoc, kickRulesMap, betType, number) {
  const keepSettingKey = betTypeToKeepKey(betType);
  const baseLimit =
    keepSettingKey && keepDoc && typeof keepDoc[keepSettingKey] === "number"
      ? Number(keepDoc[keepSettingKey])
      : 0;

  const ruleKey = buildPoolKey(betType, number);
  const rule = kickRulesMap?.[ruleKey];

  if (!rule || !rule.active) {
    return {
      base_limit: baseLimit,
      effective_limit: baseLimit,
      kick_mode: null,
      kick_amount: 0,
    };
  }

  if (rule.mode === "FULL_SEND") {
    return {
      base_limit: baseLimit,
      effective_limit: 0,
      kick_mode: "FULL_SEND",
      kick_amount: baseLimit,
    };
  }

  if (rule.mode === "REDUCE_KEEP") {
    const reduceAmount = Number(rule.amount || 0);
    return {
      base_limit: baseLimit,
      // ✅ เพดาน keep หลังหักเตะเพิ่ม
      effective_limit: Math.max(0, baseLimit - reduceAmount),
      kick_mode: "REDUCE_KEEP",
      kick_amount: reduceAmount,
    };
  }

  return {
    base_limit: baseLimit,
    effective_limit: baseLimit,
    kick_mode: null,
    kick_amount: 0,
  };
}

/**
 * logic ใหม่:
 * - FULL_SEND => ส่งทั้งหมด
 * - REDUCE_KEEP => บังคับส่งออกก่อนตาม kick_amount
 *                  และเพดาน keep ของเลขนี้จะเหลือ base_limit - kick_amount
 */
function splitKeepSendByNumberPool(
  keepDoc,
  kickRulesMap,
  runningKeepTotals,
  runningKickSentTotals,
  betType,
  number,
  amount,
) {
  const poolKey = buildPoolKey(betType, number);

  const { base_limit, effective_limit, kick_mode, kick_amount } = getRuleInfo(
    keepDoc,
    kickRulesMap,
    betType,
    number,
  );

  const currentKeepUsed =
    typeof runningKeepTotals[poolKey] === "number"
      ? Number(runningKeepTotals[poolKey])
      : 0;

  const currentKickSentUsed =
    typeof runningKickSentTotals[poolKey] === "number"
      ? Number(runningKickSentTotals[poolKey])
      : 0;

  // เตะออกหมด
  if (kick_mode === "FULL_SEND") {
    runningKickSentTotals[poolKey] = currentKickSentUsed + amount;

    return {
      keep_base_limit: base_limit,
      keep_limit: 0,
      keep_amount: 0,
      send_amount: amount,
      kick_mode,
      kick_amount,
      kick_send_amount: amount,
    };
  }

  let forcedKickSend = 0;
  let remainingAmount = amount;

  // ✅ REDUCE_KEEP = ต้องโดนส่งออกก่อนตามยอดที่กำหนด
  if (kick_mode === "REDUCE_KEEP") {
    const kickSendRemain = Math.max(0, kick_amount - currentKickSentUsed);
    forcedKickSend = Math.min(amount, kickSendRemain);
    remainingAmount = amount - forcedKickSend;
    runningKickSentTotals[poolKey] = currentKickSentUsed + forcedKickSend;
  }

  // ✅ keep ใช้เพดานหลังหักเตะเพิ่มแล้ว
  const keepRemain = Math.max(0, effective_limit - currentKeepUsed);
  const keep = Math.min(remainingAmount, keepRemain);
  const send = forcedKickSend + Math.max(0, remainingAmount - keep);

  runningKeepTotals[poolKey] = currentKeepUsed + keep;

  return {
    keep_base_limit: base_limit,
    keep_limit: effective_limit,
    keep_amount: keep,
    send_amount: send,
    kick_mode,
    kick_amount,
    kick_send_amount: forcedKickSend,
  };
}

// ✅ คำนวณ progress ของวันนี้ใหม่จาก order ทั้งหมดตามลำดับเวลา
async function getTodayPoolProgress(ownerId, keepDoc, kickRulesMap) {
  const from = startOfToday();

  const query = {
    createdAt: { $gte: from },
  };

  if (ownerId) {
    query.created_by = ownerIdToFilter(ownerId);
  }

  const orders = await Order.find(query).sort({ createdAt: 1, _id: 1 }).lean();

  const runningKeepTotals = {};
  const runningKickSentTotals = {};

  for (const order of orders) {
    for (const it of order.items || []) {
      splitKeepSendByNumberPool(
        keepDoc,
        kickRulesMap,
        runningKeepTotals,
        runningKickSentTotals,
        it.bet_type,
        it.number,
        Number(it.amount || 0),
      );
    }
  }

  return {
    runningKeepTotals,
    runningKickSentTotals,
  };
}

async function recalcOrdersForToday(ownerId, keepDoc) {
  const from = startOfToday();

  const query = {
    createdAt: { $gte: from },
  };

  if (ownerId) {
    query.created_by = ownerIdToFilter(ownerId);
  }

  const kickRulesMap = await loadActiveKickRulesMap(ownerId);

  const orders = await Order.find(query).sort({ createdAt: 1, _id: 1 }).lean();

  if (!orders.length) {
    return { matched: 0, modified: 0 };
  }

  const runningKeepTotals = {};
  const runningKickSentTotals = {};
  const ops = [];

  for (const order of orders) {
    const newItems = (order.items || []).map((it) => {
      const amt = Number(it.amount || 0);

      const split = splitKeepSendByNumberPool(
        keepDoc,
        kickRulesMap,
        runningKeepTotals,
        runningKickSentTotals,
        it.bet_type,
        it.number,
        amt,
      );

      return {
        ...it,
        keep_base_limit: split.keep_base_limit,
        keep_limit: split.keep_limit,
        keep_amount: split.keep_amount,
        send_amount: split.send_amount,
        kick_mode: split.kick_mode,
        kick_amount: split.kick_amount,
        kick_send_amount: split.kick_send_amount,
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

module.exports = {
  betTypeToKeepKey,
  buildPoolKey,
  startOfToday,
  loadActiveKickRulesMap,
  getTodayPoolProgress,
  splitKeepSendByNumberPool,
  recalcOrdersForToday,
};
