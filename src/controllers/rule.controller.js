// src/controllers/rule.controller.js
const Rule = require("../models/Rule");

function normKind(v) {
  const s = String(v || "")
    .trim()
    .toUpperCase();
  return s === "LOCK" || s === "BLOCK" ? s : null;
}

function normDigits(v) {
  const n = Number(v);
  return n === 2 || n === 3 ? n : null;
}

function normNumber(s) {
  return String(s || "").trim();
}

function isValidNumber(number, digits) {
  const re = digits === 2 ? /^\d{2}$/ : /^\d{3}$/;
  return re.test(number);
}

function splitNumbers(input) {
  // รองรับ array หรือ string ที่คั่นด้วย space/comma/newline
  if (Array.isArray(input)) {
    return input.map(normNumber).filter(Boolean);
  }
  const text = String(input || "");
  return text
    .split(/[\s,]+/g)
    .map(normNumber)
    .filter(Boolean);
}

// GET /api/rules?kind=LOCK&digits=2&active=true&q=12
exports.listRules = async (req, res) => {
  try {
    const kind = req.query.kind ? normKind(req.query.kind) : null;
    const digits = req.query.digits ? normDigits(req.query.digits) : null;
    const active =
      typeof req.query.active === "string"
        ? req.query.active === "true"
        : undefined;

    const q = String(req.query.q || "").trim();

    const filter = {};
    if (kind) filter.kind = kind;
    if (digits) filter.digits = digits;
    if (typeof active === "boolean") filter.active = active;
    if (q) filter.number = { $regex: q, $options: "i" };

    const items = await Rule.find(filter).sort({ number: 1, createdAt: -1 });

    return res.json({ ok: true, data: items });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: "โหลดรายการ rules ไม่สำเร็จ",
      error: { message: err?.message || "unknown" },
    });
  }
};

// POST /api/rules
// body: { kind:"LOCK", digits:2, numbers:["12","34"] } หรือ {numbersText:"12 34"}
exports.createRules = async (req, res) => {
  try {
    const kind = normKind(req.body.kind);
    const digits = normDigits(req.body.digits);

    if (!kind) {
      return res
        .status(400)
        .json({ ok: false, message: "kind ต้องเป็น LOCK หรือ BLOCK" });
    }
    if (!digits) {
      return res
        .status(400)
        .json({ ok: false, message: "digits ต้องเป็น 2 หรือ 3" });
    }

    const numbers = splitNumbers(req.body.numbers ?? req.body.numbersText);
    if (numbers.length === 0) {
      return res
        .status(400)
        .json({ ok: false, message: "กรุณาส่ง numbers หรือ numbersText" });
    }

    const invalid = numbers.filter((n) => !isValidNumber(n, digits));
    if (invalid.length > 0) {
      return res.status(400).json({
        ok: false,
        message: `พบเลขไม่ถูกต้องสำหรับ ${digits} ตัว`,
        data: { invalid: invalid.slice(0, 50) },
      });
    }

    // เตรียม bulk upsert (ถ้าซ้ำ จะไม่สร้างใหม่)
    const userId = req.user?.id || req.user?._id || null;

    const ops = numbers.map((n) => ({
      updateOne: {
        filter: { kind, digits, number: n },
        update: {
          $setOnInsert: { kind, digits, number: n, created_by: userId },
          $set: { active: true, updated_by: userId },
        },
        upsert: true,
      },
    }));

    const result = await Rule.bulkWrite(ops, { ordered: false });

    // ดึงรายการล่าสุดของเลขที่ส่งไป (เพื่อส่งกลับให้ UI)
    const createdOrUpdated = await Rule.find({
      kind,
      digits,
      number: { $in: numbers },
    }).sort({ number: 1 });

    return res.json({
      ok: true,
      message: "บันทึกสำเร็จ",
      data: {
        matched: result.matchedCount,
        upserted: result.upsertedCount,
        modified: result.modifiedCount,
        items: createdOrUpdated,
      },
    });
  } catch (err) {
    // กรณี unique error ตอนชนกัน
    const msg = err?.message || "unknown";
    return res.status(500).json({
      ok: false,
      message: "บันทึก rules ไม่สำเร็จ",
      error: { message: msg },
    });
  }
};

// PATCH /api/rules/:id   body: { active: true/false }
exports.updateRule = async (req, res) => {
  try {
    const { id } = req.params;
    const active = req.body.active;

    if (typeof active !== "boolean") {
      return res
        .status(400)
        .json({ ok: false, message: "active ต้องเป็น boolean" });
    }

    const userId = req.user?.id || req.user?._id || null;

    const doc = await Rule.findByIdAndUpdate(
      id,
      { $set: { active, updated_by: userId } },
      { new: true },
    );

    if (!doc) {
      return res.status(404).json({ ok: false, message: "ไม่พบ rule นี้" });
    }

    return res.json({ ok: true, message: "อัปเดตสำเร็จ", data: doc });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: "อัปเดต rule ไม่สำเร็จ",
      error: { message: err?.message || "unknown" },
    });
  }
};

// DELETE /api/rules/:id
exports.deleteRule = async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await Rule.findByIdAndDelete(id);
    if (!doc) {
      return res.status(404).json({ ok: false, message: "ไม่พบ rule นี้" });
    }
    return res.json({ ok: true, message: "ลบสำเร็จ" });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: "ลบ rule ไม่สำเร็จ",
      error: { message: err?.message || "unknown" },
    });
  }
};

// DELETE /api/rules/delete-all?kind=LOCK|BLOCK (optional)
exports.deleteAllRules = async (req, res) => {
  try {
    const kind = req.query.kind ? normKind(req.query.kind) : null;
    const filter = {};
    if (kind) filter.kind = kind;

    const result = await Rule.deleteMany(filter);
    return res.json({
      ok: true,
      message: `ลบสำเร็จ ${result.deletedCount} รายการ`,
      data: { deletedCount: result.deletedCount },
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: "ลบทั้งหมดไม่สำเร็จ",
      error: { message: err?.message || "unknown" },
    });
  }
};
