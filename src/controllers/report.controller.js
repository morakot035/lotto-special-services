const ExcelJS = require("exceljs");
// ❌ ลบ puppeteer ออก — ใช้ HTML print แทน

const Order = require("../models/Order");

// ── helpers ────────────────────────────────────────────────────────────────

function mergeRowsToMatrix2D(rows) {
  const map = new Map();
  for (const row of rows) {
    const number = String(row._id.number || "").trim();
    const betType = String(row._id.bet_type || "").trim();
    const amount = Number(row.amount || 0);
    const isLocked = !!row.is_locked;
    if (!number) continue;
    if (!map.has(number))
      map.set(number, { number, two_top: 0, two_bottom: 0, is_locked: false });
    const item = map.get(number);
    if (betType === "สองตัวบน") item.two_top = amount;
    if (betType === "สองตัวล่าง") item.two_bottom = amount;
    if (isLocked) item.is_locked = true;
  }
  return Array.from(map.values()).sort((a, b) =>
    a.number.localeCompare(b.number),
  );
}

function mergeRowsToMatrix3D(rows) {
  const map = new Map();
  for (const row of rows) {
    const number = String(row._id.number || "").trim();
    const betType = String(row._id.bet_type || "").trim();
    const amount = Number(row.amount || 0);
    const isLocked = !!row.is_locked;
    if (!number) continue;
    if (!map.has(number))
      map.set(number, {
        number,
        three_top: 0,
        three_bottom: 0,
        three_tod: 0,
        is_locked: false,
      });
    const item = map.get(number);
    if (betType === "สามตัวบน") item.three_top = amount;
    if (betType === "สามตัวล่าง") item.three_bottom = amount;
    if (betType === "สามตัวโต๊ด") item.three_tod = amount;
    if (isLocked) item.is_locked = true;
  }
  return Array.from(map.values())
    .filter((r) => r.three_top > 0 || r.three_bottom > 0 || r.three_tod > 0)
    .sort((a, b) => a.number.localeCompare(b.number));
}

function sortDiagonal(rows) {
  return [...rows].sort((a, b) => {
    const aNum = String(a.number).padStart(2, "0");
    const bNum = String(b.number).padStart(2, "0");
    const aD0 = parseInt(aNum[0]),
      aD1 = parseInt(aNum[1]);
    const bD0 = parseInt(bNum[0]),
      bD1 = parseInt(bNum[1]);
    const aMin = Math.min(aD0, aD1);
    const bMin = Math.min(bD0, bD1);
    const aMax = Math.max(aD0, aD1);
    const bMax = Math.max(bD0, bD1);
    // 1. เรียงตาม min digit (00→01,10→02,20→03,30→...→09,90→11→12,21→...)
    if (aMin !== bMin) return aMin - bMin;
    // 2. min เท่ากัน → เรียงตาม max digit
    if (aMax !== bMax) return aMax - bMax;
    // 3. max เท่ากัน (เช่น 12 vs 21) → เรียงตามตัวเลขจริง
    return parseInt(aNum) - parseInt(bNum);
  });
}

// ── aggregate helpers ──────────────────────────────────────────────────────

// แยก buyer ตาม suffix (1 = ไม่อั้น, 2 = อั้น, อื่นๆ = รวมทั้งหมด)
function getBuyerGroupFilter(group) {
  if (group === "1") {
    // buyer_name ลงท้ายด้วย space+1 หรือ ตัวเลข 1 ท้ายสุด
    return { buyer_name: { $regex: /\s*1\s*$/ } };
  }
  if (group === "2") {
    return { buyer_name: { $regex: /\s*2\s*$/ } };
  }
  return {}; // all
}

function make2DFacet(amountField) {
  return [
    {
      $group: {
        _id: { number: "$items.number", bet_type: "$items.bet_type" },
        amount: { $sum: { $ifNull: [amountField, 0] } },
        is_locked: {
          $max: { $cond: [{ $eq: ["$items.is_locked", true] }, 1, 0] },
        },
      },
    },
    { $sort: { "_id.number": 1, "_id.bet_type": 1 } },
  ];
}

async function get2DAggregated() {
  const betMatch = { "items.bet_type": { $in: ["สองตัวบน", "สองตัวล่าง"] } };

  // ── query แยก 3 กลุ่มพร้อมกัน ──────────────────────────────────────────
  const [allRows, group1Rows, group2Rows] = await Promise.all([
    // ทั้งหมด
    Order.aggregate([
      { $unwind: "$items" },
      { $match: betMatch },
      {
        $facet: {
          keep: make2DFacet("$items.keep_amount"),
          send: make2DFacet("$items.send_amount"),
        },
      },
    ]),
    // ชื่อ+1 (ไม่อั้น)
    Order.aggregate([
      { $match: { buyer_name: { $regex: /\s*1\s*$/ } } },
      { $unwind: "$items" },
      { $match: betMatch },
      {
        $facet: {
          keep: make2DFacet("$items.keep_amount"),
          send: make2DFacet("$items.send_amount"),
        },
      },
    ]),
    // ชื่อ+2 (อั้น)
    Order.aggregate([
      { $match: { buyer_name: { $regex: /\s*2\s*$/ } } },
      { $unwind: "$items" },
      { $match: betMatch },
      {
        $facet: {
          keep: make2DFacet("$items.keep_amount"),
          send: make2DFacet("$items.send_amount"),
        },
      },
    ]),
  ]);

  const all = allRows[0] || { keep: [], send: [] };
  const grp1 = group1Rows[0] || { keep: [], send: [] };
  const grp2 = group2Rows[0] || { keep: [], send: [] };

  return {
    // รวมทั้งหมด
    keep: sortDiagonal(mergeRowsToMatrix2D(all.keep || [])),
    send: sortDiagonal(mergeRowsToMatrix2D(all.send || [])),
    // ชื่อ+1 ไม่อั้น
    keep1: sortDiagonal(mergeRowsToMatrix2D(grp1.keep || [])),
    send1: sortDiagonal(mergeRowsToMatrix2D(grp1.send || [])),
    // ชื่อ+2 อั้น
    keep2: sortDiagonal(mergeRowsToMatrix2D(grp2.keep || [])),
    send2: sortDiagonal(mergeRowsToMatrix2D(grp2.send || [])),
  };
}

async function get3DAggregated() {
  const rows = await Order.aggregate([
    { $unwind: "$items" },
    {
      $match: {
        "items.bet_type": { $in: ["สามตัวบน", "สามตัวล่าง", "สามตัวโต๊ด"] },
      },
    },
    {
      $facet: {
        keep: [
          {
            $group: {
              _id: { number: "$items.number", bet_type: "$items.bet_type" },
              amount: { $sum: { $ifNull: ["$items.keep_amount", 0] } },
              is_locked: {
                $max: { $cond: [{ $eq: ["$items.is_locked", true] }, 1, 0] },
              },
            },
          },
          { $sort: { "_id.number": 1, "_id.bet_type": 1 } },
        ],
        send: [
          {
            $group: {
              _id: { number: "$items.number", bet_type: "$items.bet_type" },
              amount: { $sum: { $ifNull: ["$items.send_amount", 0] } },
              is_locked: {
                $max: { $cond: [{ $eq: ["$items.is_locked", true] }, 1, 0] },
              },
            },
          },
          { $sort: { "_id.number": 1, "_id.bet_type": 1 } },
        ],
      },
    },
  ]);
  const data = rows[0] || { keep: [], send: [] };
  return {
    keep: mergeRowsToMatrix3D(data.keep || []),
    send: mergeRowsToMatrix3D(data.send || []),
  };
}

// ── summary report endpoints ───────────────────────────────────────────────

exports.getTwoDigitSummaryReport = async (req, res) => {
  try {
    const data = await get2DAggregated();
    return res.json({ success: true, data });
  } catch (err) {
    console.error("getTwoDigitSummaryReport error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.getThreeDigitSummaryReport = async (req, res) => {
  try {
    const data = await get3DAggregated();
    console.log("3D KEEP ROWS:", data.keep?.length || 0);
    console.log("3D SEND ROWS:", data.send?.length || 0);
    return res.json({ success: true, data });
  } catch (err) {
    console.error("getThreeDigitSummaryReport error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// ── Excel export ── แยก kept / sent ───────────────────────────────────────

function autoFitColumns(ws, minWidth = 12) {
  ws.columns.forEach((col) => {
    let maxLength = minWidth;
    col.eachCell?.({ includeEmpty: true }, (cell) => {
      maxLength = Math.max(maxLength, String(cell.value || "").length + 2);
    });
    col.width = maxLength;
  });
}

function styleHeaderRow(row) {
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.alignment = { vertical: "middle", horizontal: "center" };
  row.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "0F172A" },
    };
    cell.border = {
      top: { style: "thin", color: { argb: "D1D5DB" } },
      left: { style: "thin", color: { argb: "D1D5DB" } },
      bottom: { style: "thin", color: { argb: "D1D5DB" } },
      right: { style: "thin", color: { argb: "D1D5DB" } },
    };
  });
}

function styleDataBorders(row) {
  row.eachCell((cell) => {
    cell.border = {
      top: { style: "thin", color: { argb: "E5E7EB" } },
      left: { style: "thin", color: { argb: "E5E7EB" } },
      bottom: { style: "thin", color: { argb: "E5E7EB" } },
      right: { style: "thin", color: { argb: "E5E7EB" } },
    };
  });
}

function fillLockedRow(row) {
  row.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFF1F2" },
    };
  });
}

function build2DSheet(ws, rows, title) {
  ws.mergeCells("A1:D1");
  ws.getCell("A1").value = title;
  ws.getCell("A1").font = { bold: true, size: 16 };
  ws.getCell("A1").alignment = { horizontal: "center", vertical: "middle" };
  ws.addRow([]);
  styleHeaderRow(ws.addRow(["เลข", "2 ตัวบน", "2 ตัวล่าง", "หมายเหตุ"]));
  rows.forEach((item) => {
    const row = ws.addRow([
      item.number,
      item.two_top,
      item.two_bottom,
      item.is_locked ? "อั้น" : "",
    ]);
    styleDataBorders(row);
    if (item.is_locked) fillLockedRow(row);
  });
  const totalTop = rows.reduce((s, x) => s + Number(x.two_top || 0), 0);
  const totalBottom = rows.reduce((s, x) => s + Number(x.two_bottom || 0), 0);
  const totalRow = ws.addRow(["รวม", totalTop, totalBottom, ""]);
  totalRow.font = { bold: true };
  styleDataBorders(totalRow);
  ws.getColumn(2).numFmt = "#,##0.00";
  ws.getColumn(3).numFmt = "#,##0.00";
  autoFitColumns(ws);
}

function build3DSheet(ws, rows, title) {
  ws.mergeCells("A1:E1");
  ws.getCell("A1").value = title;
  ws.getCell("A1").font = { bold: true, size: 16 };
  ws.getCell("A1").alignment = { horizontal: "center", vertical: "middle" };
  ws.addRow([]);
  styleHeaderRow(
    ws.addRow(["เลข", "3 ตัวบน", "3 ตัวล่าง", "3 ตัวโต๊ด", "หมายเหตุ"]),
  );
  rows.forEach((item) => {
    const row = ws.addRow([
      item.number,
      item.three_top,
      item.three_bottom,
      item.three_tod,
      item.is_locked ? "อั้น" : "",
    ]);
    styleDataBorders(row);
    if (item.is_locked) fillLockedRow(row);
  });
  const totalTop = rows.reduce((s, x) => s + Number(x.three_top || 0), 0);
  const totalBottom = rows.reduce((s, x) => s + Number(x.three_bottom || 0), 0);
  const totalTod = rows.reduce((s, x) => s + Number(x.three_tod || 0), 0);
  const totalRow = ws.addRow(["รวม", totalTop, totalBottom, totalTod, ""]);
  totalRow.font = { bold: true };
  styleDataBorders(totalRow);
  ws.getColumn(2).numFmt = "#,##0.00";
  ws.getColumn(3).numFmt = "#,##0.00";
  ws.getColumn(4).numFmt = "#,##0.00";
  autoFitColumns(ws);
}

// GET /api/reports/summary/2d/export-excel?mode=keep|send|all&group=1|2 (optional)
exports.exportSummary2DExcel = async (req, res) => {
  try {
    const mode = String(req.query.mode || "all").toLowerCase();
    const group = String(req.query.group || "").trim(); // "1", "2", หรือ "" = รวม
    const data = await get2DAggregated();

    // เลือก dataset ตาม group
    const keepData =
      group === "1" ? data.keep1 : group === "2" ? data.keep2 : data.keep;
    const sendData =
      group === "1" ? data.send1 : group === "2" ? data.send2 : data.send;
    const groupLabel =
      group === "1"
        ? " (กลุ่ม 1 ไม่อั้น)"
        : group === "2"
          ? " (กลุ่ม 2 อั้น)"
          : "";

    const wb = new ExcelJS.Workbook();
    wb.creator = "LOTTO";
    wb.created = new Date();

    if (mode === "keep" || mode === "all") {
      build2DSheet(
        wb.addWorksheet("2D_Kept"),
        keepData,
        `สรุปยอดตัดเก็บ เลข 2 ตัว${groupLabel}`,
      );
    }
    if (mode === "send" || mode === "all") {
      build2DSheet(
        wb.addWorksheet("2D_Sent"),
        sendData,
        `สรุปยอดตัดส่ง เลข 2 ตัว${groupLabel}`,
      );
    }

    const gSuffix = group ? `_g${group}` : "";
    const filename =
      mode === "keep"
        ? `report_2d_kept${gSuffix}.xlsx`
        : mode === "send"
          ? `report_2d_sent${gSuffix}.xlsx`
          : `report_2d${gSuffix}.xlsx`;
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error("exportSummary2DExcel error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Export excel failed" });
  }
};

// GET /api/reports/summary/3d/export-excel?mode=keep|send|all
exports.exportSummary3DExcel = async (req, res) => {
  try {
    const mode = String(req.query.mode || "all").toLowerCase();
    const data = await get3DAggregated();

    const wb = new ExcelJS.Workbook();
    wb.creator = "LOTTO";
    wb.created = new Date();

    if (mode === "keep" || mode === "all") {
      build3DSheet(
        wb.addWorksheet("3D_Kept"),
        data.keep,
        "สรุปยอดตัดเก็บ เลข 3 ตัว",
      );
    }
    if (mode === "send" || mode === "all") {
      build3DSheet(
        wb.addWorksheet("3D_Sent"),
        data.send,
        "สรุปยอดตัดส่ง เลข 3 ตัว",
      );
    }

    const filename =
      mode === "keep"
        ? "report_3d_kept.xlsx"
        : mode === "send"
          ? "report_3d_sent.xlsx"
          : "report_3d.xlsx";
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error("exportSummary3DExcel error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Export excel failed" });
  }
};

// ── PDF = ส่ง HTML กลับ → เบราว์เซอร์ print เอง (รองรับ tablet ทุกยี่ห้อ) ──

const BASE_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;700;800&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Sarabun', sans-serif; background: #f8fafc; padding: 24px; font-size: 13px; color: #1e293b; }
  h1 { font-size: 20px; font-weight: 800; margin-bottom: 4px; }
  .subtitle { font-size: 12px; color: #64748b; margin-bottom: 20px; font-weight: 600; }
  .card { background: #fff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.06); margin-bottom: 24px; }
  .card-header { display: flex; align-items: center; justify-content: space-between; padding: 14px 18px; border-bottom: 1px solid #e2e8f0; }
  .card-title { font-size: 15px; font-weight: 800; }
  .pill { border-radius: 999px; padding: 4px 12px; font-size: 11px; font-weight: 800; border: 1px solid; }
  .pill-emerald { background: #ecfdf5; color: #065f46; border-color: #a7f3d0; }
  .pill-sky     { background: #f0f9ff; color: #0369a1; border-color: #bae6fd; }
  .title-emerald { color: #065f46; }
  .title-sky     { color: #0369a1; }
  table { width: 100%; border-collapse: collapse; }
  thead tr { background: #f8fafc; }
  th { padding: 10px 14px; text-align: center; font-weight: 800; font-size: 13px; border-bottom: 1px solid #e2e8f0; }
  td { padding: 9px 14px; border-bottom: 1px solid #f1f5f9; }
  td.center { text-align: center; }
  td.bold { font-weight: 800; }
  tr.locked { background: #fff1f2; }
  tr.total td { font-weight: 800; background: #f8fafc; border-bottom: none; }
  td.empty { text-align: center; padding: 28px; color: #94a3b8; }
  .printed-at { margin-top: 16px; font-size: 11px; color: #94a3b8; text-align: right; }
  .print-btn {
    display: inline-flex; align-items: center; gap: 8px;
    margin-bottom: 20px; padding: 10px 24px;
    background: #0f172a; color: #fff; border: none; border-radius: 999px;
    font-size: 14px; font-weight: 800; font-family: 'Sarabun', sans-serif;
    cursor: pointer;
  }
  @media print {
    .print-btn { display: none !important; }
    body { background: #fff; padding: 0; }
    .card { box-shadow: none; border: 1px solid #e2e8f0; }
  }
`;

function fmt(n) {
  return Number(n || 0).toLocaleString("th-TH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function build2DRows(rows) {
  if (!rows.length)
    return `<tr><td colspan="3" class="empty">ไม่มีข้อมูล</td></tr>`;
  return rows
    .map(
      (r) => `
    <tr class="${r.is_locked ? "locked" : ""}">
      <td class="center bold">${r.number}</td>
      <td class="center">${fmt(r.two_top)}</td>
      <td class="center">${fmt(r.two_bottom)}</td>
    </tr>`,
    )
    .join("");
}

function build2DTotal(rows) {
  const top = rows.reduce((s, r) => s + Number(r.two_top || 0), 0);
  const bot = rows.reduce((s, r) => s + Number(r.two_bottom || 0), 0);
  return `<tr class="total"><td class="center bold">รวม</td><td class="center">${fmt(top)}</td><td class="center">${fmt(bot)}</td></tr>`;
}

function build3DRows(rows) {
  if (!rows.length)
    return `<tr><td colspan="4" class="empty">ไม่มีข้อมูล</td></tr>`;
  return rows
    .map(
      (r) => `
    <tr class="${r.is_locked ? "locked" : ""}">
      <td class="center bold">${r.number}</td>
      <td class="center">${fmt(r.three_top)}</td>
      <td class="center">${fmt(r.three_bottom)}</td>
      <td class="center">${fmt(r.three_tod)}</td>
    </tr>`,
    )
    .join("");
}

function build3DTotal(rows) {
  const top = rows.reduce((s, r) => s + Number(r.three_top || 0), 0);
  const bot = rows.reduce((s, r) => s + Number(r.three_bottom || 0), 0);
  const tod = rows.reduce((s, r) => s + Number(r.three_tod || 0), 0);
  return `<tr class="total"><td class="center bold">รวม</td><td class="center">${fmt(top)}</td><td class="center">${fmt(bot)}</td><td class="center">${fmt(tod)}</td></tr>`;
}

function wrapHtml(title, subtitle, bodyHtml) {
  return `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${title}</title>
<style>${BASE_CSS}</style>
</head>
<body>
  <button class="print-btn" onclick="window.print()">🖨️ พิมพ์ / บันทึก PDF</button>
  <h1>${title}</h1>
  <p class="subtitle">${subtitle}</p>
  ${bodyHtml}
  <p class="printed-at">พิมพ์เมื่อ: ${new Date().toLocaleString("th-TH")}</p>
</body>
</html>`;
}

function card2D(rows, titleTh, pillClass, titleClass, pill) {
  return `
  <div class="card">
    <div class="card-header">
      <span class="card-title ${titleClass}">${titleTh}</span>
      <span class="pill ${pillClass}">${pill}</span>
    </div>
    <table>
      <thead><tr><th>เลข</th><th>2 ตัวบน</th><th>2 ตัวล่าง</th></tr></thead>
      <tbody>${build2DRows(rows)}</tbody>
      <tfoot>${build2DTotal(rows)}</tfoot>
    </table>
  </div>`;
}

function card3D(rows, titleTh, pillClass, titleClass, pill) {
  return `
  <div class="card">
    <div class="card-header">
      <span class="card-title ${titleClass}">${titleTh}</span>
      <span class="pill ${pillClass}">${pill}</span>
    </div>
    <table>
      <thead><tr><th>เลข</th><th>3 ตัวบน</th><th>3 ตัวล่าง</th><th>3 ตัวโต๊ด</th></tr></thead>
      <tbody>${build3DRows(rows)}</tbody>
      <tfoot>${build3DTotal(rows)}</tfoot>
    </table>
  </div>`;
}

// GET /api/reports/summary/2d/export-pdf?mode=keep|send|all&group=1|2 (optional)
exports.exportSummary2DPDF = async (req, res) => {
  try {
    const mode = String(req.query.mode || "all").toLowerCase();
    const group = String(req.query.group || "").trim();
    const data = await get2DAggregated();

    const keepData =
      group === "1" ? data.keep1 : group === "2" ? data.keep2 : data.keep;
    const sendData =
      group === "1" ? data.send1 : group === "2" ? data.send2 : data.send;
    const groupLabel =
      group === "1"
        ? " — กลุ่ม 1 (ไม่อั้น)"
        : group === "2"
          ? " — กลุ่ม 2 (อั้น)"
          : "";

    let body = "";
    if (mode === "keep") {
      body = card2D(
        keepData,
        `สรุปยอดตัดเก็บ (kept)${groupLabel}`,
        "pill-emerald",
        "title-emerald",
        "KEPT",
      );
    } else if (mode === "send") {
      body = card2D(
        sendData,
        `สรุปยอดตัดส่ง (sent)${groupLabel}`,
        "pill-sky",
        "title-sky",
        "SENT",
      );
    } else {
      body =
        card2D(
          keepData,
          `สรุปยอดตัดเก็บ (kept)${groupLabel}`,
          "pill-emerald",
          "title-emerald",
          "KEPT",
        ) +
        card2D(
          sendData,
          `สรุปยอดตัดส่ง (sent)${groupLabel}`,
          "pill-sky",
          "title-sky",
          "SENT",
        );
    }

    const subtitle =
      group === "1"
        ? "กลุ่ม 1 — ไม่อั้น"
        : group === "2"
          ? "กลุ่ม 2 — อั้น"
          : mode === "keep"
            ? "ยอดที่เก็บไว้กินเอง"
            : mode === "send"
              ? "ยอดที่ตัดส่งเจ้ามือใหญ่"
              : "สรุปยอดตัดเก็บ / ตัดส่ง แยกเป็น 2 ตัวบน และ 2 ตัวล่าง";
    const html = wrapHtml("รายงานสรุปเลข 2 ตัว", subtitle, body);

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  } catch (err) {
    console.error("exportSummary2DPDF error:", err);
    res.status(500).json({ success: false, message: "Export PDF failed" });
  }
};

// GET /api/reports/summary/3d/export-pdf?mode=keep|send|all
exports.exportSummary3DPDF = async (req, res) => {
  try {
    const mode = String(req.query.mode || "all").toLowerCase();
    const data = await get3DAggregated();

    let body = "";
    if (mode === "keep") {
      body = card3D(
        data.keep,
        "สรุปยอดตัดเก็บ (kept)",
        "pill-emerald",
        "title-emerald",
        "KEPT",
      );
    } else if (mode === "send") {
      body = card3D(
        data.send,
        "สรุปยอดตัดส่ง (sent)",
        "pill-sky",
        "title-sky",
        "SENT",
      );
    } else {
      body =
        card3D(
          data.keep,
          "สรุปยอดตัดเก็บ (kept)",
          "pill-emerald",
          "title-emerald",
          "KEPT",
        ) +
        card3D(
          data.send,
          "สรุปยอดตัดส่ง (sent)",
          "pill-sky",
          "title-sky",
          "SENT",
        );
    }

    const subtitle =
      mode === "keep"
        ? "ยอดที่เก็บไว้กินเอง"
        : mode === "send"
          ? "ยอดที่ตัดส่งเจ้ามือใหญ่"
          : "สรุปยอดตัดเก็บ / ตัดส่ง เลข 3 ตัวบน / 3 ตัวล่าง / 3 ตัวโต๊ด";
    const html = wrapHtml("รายงานสรุปเลข 3 ตัว", subtitle, body);

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  } catch (err) {
    console.error("exportSummary3DPDF error:", err);
    res.status(500).json({ success: false, message: "Export PDF failed" });
  }
};

// ── overall summary ────────────────────────────────────────────────────────

exports.getOverallSummaryReport = async (req, res) => {
  try {
    const rows = await Order.aggregate([
      { $unwind: "$items" },
      {
        $match: {
          "items.bet_type": {
            $in: [
              "สองตัวบน",
              "สองตัวล่าง",
              "สามตัวบน",
              "สามตัวล่าง",
              "สามตัวโต๊ด",
            ],
          },
        },
      },
      {
        $group: {
          _id: "$items.bet_type",
          total_amount: { $sum: { $ifNull: ["$items.amount", 0] } },
        },
      },
    ]);

    const result = {
      two_top: 0,
      two_bottom: 0,
      three_top: 0,
      three_bottom: 0,
      three_tod: 0,
      grand_total: 0,
    };
    for (const row of rows) {
      const t = Number(row.total_amount || 0);
      if (row._id === "สองตัวบน") result.two_top = t;
      if (row._id === "สองตัวล่าง") result.two_bottom = t;
      if (row._id === "สามตัวบน") result.three_top = t;
      if (row._id === "สามตัวล่าง") result.three_bottom = t;
      if (row._id === "สามตัวโต๊ด") result.three_tod = t;
    }
    result.grand_total =
      result.two_top +
      result.two_bottom +
      result.three_top +
      result.three_bottom +
      result.three_tod;

    return res.json({ success: true, data: result });
  } catch (err) {
    console.error("getOverallSummaryReport error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};
