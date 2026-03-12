const ExcelJS = require("exceljs");
const puppeteer = require("puppeteer");

const Order = require("../models/Order");

function mergeRowsToMatrix2D(rows) {
  const map = new Map();

  for (const row of rows) {
    const number = String(row._id.number || "").trim();
    const betType = String(row._id.bet_type || "").trim();
    const amount = Number(row.amount || 0);
    const isLocked = !!row.is_locked;

    if (!number) continue;

    if (!map.has(number)) {
      map.set(number, {
        number,
        two_top: 0,
        two_bottom: 0,
        is_locked: false,
      });
    }

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

    if (!map.has(number)) {
      map.set(number, {
        number,
        three_top: 0,
        three_bottom: 0,
        three_tod: 0,
        is_locked: false,
      });
    }

    const item = map.get(number);

    if (betType === "สามตัวบน") item.three_top = amount;
    if (betType === "สามตัวล่าง") item.three_bottom = amount;
    if (betType === "สามตัวโต๊ด") item.three_tod = amount;
    if (isLocked) item.is_locked = true;
  }

  return Array.from(map.values()).sort((a, b) =>
    a.number.localeCompare(b.number),
  );
}

function sortDiagonal(rows) {
  return [...rows].sort((a, b) => {
    const aNum = String(a.number).padStart(2, "0");
    const bNum = String(b.number).padStart(2, "0");
    const aSum = parseInt(aNum[0]) + parseInt(aNum[1]);
    const bSum = parseInt(bNum[0]) + parseInt(bNum[1]);
    if (aSum !== bSum) return aSum - bSum;
    return parseInt(aNum) - parseInt(bNum);
  });
}

exports.getTwoDigitSummaryReport = async (req, res) => {
  try {
    // ✅ เอา filter created_by ออกก่อน เพื่อเช็คข้อมูลจริงในระบบ
    const rows = await Order.aggregate([
      { $unwind: "$items" },
      {
        $match: {
          "items.bet_type": { $in: ["สองตัวบน", "สองตัวล่าง"] },
        },
      },
      {
        $facet: {
          keep: [
            {
              $group: {
                _id: {
                  number: "$items.number",
                  bet_type: "$items.bet_type",
                },
                amount: { $sum: { $ifNull: ["$items.keep_amount", 0] } },
                is_locked: {
                  $max: {
                    $cond: [{ $eq: ["$items.is_locked", true] }, 1, 0],
                  },
                },
              },
            },
            { $sort: { "_id.number": 1, "_id.bet_type": 1 } },
          ],
          send: [
            {
              $group: {
                _id: {
                  number: "$items.number",
                  bet_type: "$items.bet_type",
                },
                amount: { $sum: { $ifNull: ["$items.send_amount", 0] } },
                is_locked: {
                  $max: {
                    $cond: [{ $eq: ["$items.is_locked", true] }, 1, 0],
                  },
                },
              },
            },
            { $sort: { "_id.number": 1, "_id.bet_type": 1 } },
          ],
        },
      },
    ]);

    const data = rows[0] || { keep: [], send: [] };

    console.log("2D KEEP ROWS:", data.keep?.length || 0);
    console.log("2D SEND ROWS:", data.send?.length || 0);

    return res.json({
      success: true,
      data: {
        keep: sortDiagonal(mergeRowsToMatrix2D(data.keep || [])),
        send: sortDiagonal(mergeRowsToMatrix2D(data.send || [])),
      },
    });
  } catch (err) {
    console.error("getTwoDigitSummaryReport error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

exports.getThreeDigitSummaryReport = async (req, res) => {
  try {
    // ✅ เอา filter created_by ออกก่อน เพื่อเช็คข้อมูลจริงในระบบ
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
                _id: {
                  number: "$items.number",
                  bet_type: "$items.bet_type",
                },
                amount: { $sum: { $ifNull: ["$items.keep_amount", 0] } },
                is_locked: {
                  $max: {
                    $cond: [{ $eq: ["$items.is_locked", true] }, 1, 0],
                  },
                },
              },
            },
            { $sort: { "_id.number": 1, "_id.bet_type": 1 } },
          ],
          send: [
            {
              $group: {
                _id: {
                  number: "$items.number",
                  bet_type: "$items.bet_type",
                },
                amount: { $sum: { $ifNull: ["$items.send_amount", 0] } },
                is_locked: {
                  $max: {
                    $cond: [{ $eq: ["$items.is_locked", true] }, 1, 0],
                  },
                },
              },
            },
            { $sort: { "_id.number": 1, "_id.bet_type": 1 } },
          ],
        },
      },
    ]);

    const data = rows[0] || { keep: [], send: [] };

    console.log("3D KEEP ROWS:", data.keep?.length || 0);
    console.log("3D SEND ROWS:", data.send?.length || 0);

    return res.json({
      success: true,
      data: {
        keep: mergeRowsToMatrix3D(data.keep || []),
        send: mergeRowsToMatrix3D(data.send || []),
      },
    });
  } catch (err) {
    console.error("getThreeDigitSummaryReport error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

function autoFitColumns(ws, minWidth = 12) {
  ws.columns.forEach((column) => {
    let maxLength = minWidth;
    column.eachCell?.({ includeEmpty: true }, (cell) => {
      const value = cell.value ? String(cell.value) : "";
      maxLength = Math.max(maxLength, value.length + 2);
    });
    column.width = maxLength;
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

function mergeRowsToMatrix2D(rows) {
  const map = new Map();

  for (const row of rows) {
    const number = String(row._id.number || "").trim();
    const betType = String(row._id.bet_type || "").trim();
    const amount = Number(row.amount || 0);
    const isLocked = !!row.is_locked;

    if (!number) continue;

    if (!map.has(number)) {
      map.set(number, {
        number,
        two_top: 0,
        two_bottom: 0,
        is_locked: false,
      });
    }

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

    if (!map.has(number)) {
      map.set(number, {
        number,
        three_top: 0,
        three_bottom: 0,
        three_tod: 0,
        is_locked: false,
      });
    }

    const item = map.get(number);

    if (betType === "สามตัวบน") item.three_top = amount;
    if (betType === "สามตัวล่าง") item.three_bottom = amount;
    if (betType === "สามตัวโต๊ด") item.three_tod = amount;
    if (isLocked) item.is_locked = true;
  }

  return Array.from(map.values()).sort((a, b) =>
    a.number.localeCompare(b.number),
  );
}

async function get2DAggregated() {
  const rows = await Order.aggregate([
    { $unwind: "$items" },
    {
      $match: {
        "items.bet_type": { $in: ["สองตัวบน", "สองตัวล่าง"] },
      },
    },
    {
      $facet: {
        keep: [
          {
            $group: {
              _id: {
                number: "$items.number",
                bet_type: "$items.bet_type",
              },
              amount: { $sum: { $ifNull: ["$items.keep_amount", 0] } },
              is_locked: {
                $max: {
                  $cond: [{ $eq: ["$items.is_locked", true] }, 1, 0],
                },
              },
            },
          },
          { $sort: { "_id.number": 1, "_id.bet_type": 1 } },
        ],
        send: [
          {
            $group: {
              _id: {
                number: "$items.number",
                bet_type: "$items.bet_type",
              },
              amount: { $sum: { $ifNull: ["$items.send_amount", 0] } },
              is_locked: {
                $max: {
                  $cond: [{ $eq: ["$items.is_locked", true] }, 1, 0],
                },
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
    keep: mergeRowsToMatrix2D(data.keep || []),
    send: mergeRowsToMatrix2D(data.send || []),
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
              _id: {
                number: "$items.number",
                bet_type: "$items.bet_type",
              },
              amount: { $sum: { $ifNull: ["$items.keep_amount", 0] } },
              is_locked: {
                $max: {
                  $cond: [{ $eq: ["$items.is_locked", true] }, 1, 0],
                },
              },
            },
          },
          { $sort: { "_id.number": 1, "_id.bet_type": 1 } },
        ],
        send: [
          {
            $group: {
              _id: {
                number: "$items.number",
                bet_type: "$items.bet_type",
              },
              amount: { $sum: { $ifNull: ["$items.send_amount", 0] } },
              is_locked: {
                $max: {
                  $cond: [{ $eq: ["$items.is_locked", true] }, 1, 0],
                },
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

function build2DSheet(ws, rows, title) {
  ws.mergeCells("A1:D1");
  ws.getCell("A1").value = title;
  ws.getCell("A1").font = { bold: true, size: 16 };
  ws.getCell("A1").alignment = { horizontal: "center", vertical: "middle" };

  ws.addRow([]);
  const header = ws.addRow(["เลข", "2 ตัวบน", "2 ตัวล่าง", "หมายเหตุ"]);
  styleHeaderRow(header);

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

  const totalTop = rows.reduce((sum, x) => sum + Number(x.two_top || 0), 0);
  const totalBottom = rows.reduce(
    (sum, x) => sum + Number(x.two_bottom || 0),
    0,
  );

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
  const header = ws.addRow([
    "เลข",
    "3 ตัวบน",
    "3 ตัวล่าง",
    "3 ตัวโต๊ด",
    "หมายเหตุ",
  ]);
  styleHeaderRow(header);

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

  const totalTop = rows.reduce((sum, x) => sum + Number(x.three_top || 0), 0);
  const totalBottom = rows.reduce(
    (sum, x) => sum + Number(x.three_bottom || 0),
    0,
  );
  const totalTod = rows.reduce((sum, x) => sum + Number(x.three_tod || 0), 0);

  const totalRow = ws.addRow(["รวม", totalTop, totalBottom, totalTod, ""]);
  totalRow.font = { bold: true };
  styleDataBorders(totalRow);

  ws.getColumn(2).numFmt = "#,##0.00";
  ws.getColumn(3).numFmt = "#,##0.00";
  ws.getColumn(4).numFmt = "#,##0.00";
  autoFitColumns(ws);
}

exports.exportSummary2DExcel = async (req, res) => {
  try {
    const data = await get2DAggregated();

    const wb = new ExcelJS.Workbook();
    wb.creator = "LOTTO";
    wb.created = new Date();

    build2DSheet(
      wb.addWorksheet("2D_Kept"),
      data.keep,
      "สรุปยอดตัดเก็บ เลข 2 ตัว",
    );
    build2DSheet(
      wb.addWorksheet("2D_Sent"),
      data.send,
      "สรุปยอดตัดส่ง เลข 2 ตัว",
    );

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="report_2d.xlsx"',
    );

    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error("exportSummary2DExcel error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Export excel failed" });
  }
};

exports.exportSummary3DExcel = async (req, res) => {
  try {
    const data = await get3DAggregated();

    const wb = new ExcelJS.Workbook();
    wb.creator = "LOTTO";
    wb.created = new Date();

    build3DSheet(
      wb.addWorksheet("3D_Kept"),
      data.keep,
      "สรุปยอดตัดเก็บ เลข 3 ตัว",
    );
    build3DSheet(
      wb.addWorksheet("3D_Sent"),
      data.send,
      "สรุปยอดตัดส่ง เลข 3 ตัว",
    );

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="report_3d.xlsx"',
    );

    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error("exportSummary3DExcel error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Export excel failed" });
  }
};

function sumAmount(rows, key) {
  return rows.reduce((sum, row) => sum + Number(row[key] || 0), 0);
}

exports.getOverallSummaryReport = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id || null;

    const match = {};
    // if (userId) {
    //   match.created_by = userId;
    // }

    const rows = await Order.aggregate([
      { $match: match },
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
      const betType = row._id;
      const total = Number(row.total_amount || 0);

      if (betType === "สองตัวบน") result.two_top = total;
      if (betType === "สองตัวล่าง") result.two_bottom = total;
      if (betType === "สามตัวบน") result.three_top = total;
      if (betType === "สามตัวล่าง") result.three_bottom = total;
      if (betType === "สามตัวโต๊ด") result.three_tod = total;
    }

    result.grand_total =
      result.two_top +
      result.two_bottom +
      result.three_top +
      result.three_bottom +
      result.three_tod;

    return res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    console.error("getOverallSummaryReport error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// ── helper: สร้าง HTML สำหรับ 2D ──────────────────────────────────────────
function build2DHTML(data) {
  const formatMoney = (n) =>
    Number(n || 0).toLocaleString("th-TH", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });

  const buildRows = (rows) => {
    if (!rows.length)
      return `<tr><td colspan="3" class="empty">ไม่มีข้อมูล</td></tr>`;
    return rows
      .map(
        (r) => `
        <tr class="${r.is_locked ? "locked" : ""}">
          <td class="center bold">${r.number}</td>
          <td class="center">${formatMoney(r.two_top)}</td>
          <td class="center">${formatMoney(r.two_bottom)}</td>
        </tr>`,
      )
      .join("");
  };

  const buildTotal = (rows) => {
    const top = rows.reduce((s, r) => s + Number(r.two_top || 0), 0);
    const bot = rows.reduce((s, r) => s + Number(r.two_bottom || 0), 0);
    return `<tr class="total">
      <td class="center bold">รวม</td>
      <td class="center bold">${formatMoney(top)}</td>
      <td class="center bold">${formatMoney(bot)}</td>
    </tr>`;
  };

  return `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8"/>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;700;800&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Sarabun', sans-serif; background: #f8fafc; padding: 32px; font-size: 13px; color: #1e293b; }
  h1 { font-size: 20px; font-weight: 800; color: #1e293b; margin-bottom: 4px; }
  .subtitle { font-size: 12px; color: #64748b; margin-bottom: 24px; font-weight: 600; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
  .card { background: #fff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.06); }
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
  tr.total { background: #f8fafc; }
  tr.total td { font-weight: 800; border-bottom: none; }
  td.empty { text-align: center; padding: 28px; color: #94a3b8; }
  .printed-at { margin-top: 20px; font-size: 11px; color: #94a3b8; text-align: right; }
</style>
</head>
<body>
  <h1>รายงานสรุปเลข 2 ตัว</h1>
  <p class="subtitle">สรุปยอดตัดเก็บ / ตัดส่ง แยกเป็น 2 ตัวบน และ 2 ตัวล่าง</p>

  <div class="grid">
    <!-- KEPT -->
    <div class="card">
      <div class="card-header">
        <span class="card-title title-emerald">สรุปยอดตัดเก็บ (kept)</span>
        <span class="pill pill-emerald">KEPT</span>
      </div>
      <table>
        <thead>
          <tr><th>เลข</th><th>2 ตัวบน</th><th>2 ตัวล่าง</th></tr>
        </thead>
        <tbody>${buildRows(data.keep)}</tbody>
        <tfoot>${buildTotal(data.keep)}</tfoot>
      </table>
    </div>

    <!-- SENT -->
    <div class="card">
      <div class="card-header">
        <span class="card-title title-sky">สรุปยอดตัดส่ง (sent)</span>
        <span class="pill pill-sky">SENT</span>
      </div>
      <table>
        <thead>
          <tr><th>เลข</th><th>2 ตัวบน</th><th>2 ตัวล่าง</th></tr>
        </thead>
        <tbody>${buildRows(data.send)}</tbody>
        <tfoot>${buildTotal(data.send)}</tfoot>
      </table>
    </div>
  </div>

</body>
</html>`;
}

// ── helper: สร้าง HTML สำหรับ 3D ──────────────────────────────────────────
function build3DHTML(data) {
  const formatMoney = (n) =>
    Number(n || 0).toLocaleString("th-TH", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });

  const buildRows = (rows) => {
    if (!rows.length)
      return `<tr><td colspan="4" class="empty">ไม่มีข้อมูล</td></tr>`;
    return rows
      .map(
        (r) => `
        <tr class="${r.is_locked ? "locked" : ""}">
          <td class="center bold">${r.number}</td>
          <td class="center">${formatMoney(r.three_top)}</td>
          <td class="center">${formatMoney(r.three_bottom)}</td>
          <td class="center">${formatMoney(r.three_toad)}</td>
        </tr>`,
      )
      .join("");
  };

  const buildTotal = (rows) => {
    const top = rows.reduce((s, r) => s + Number(r.three_top || 0), 0);
    const bot = rows.reduce((s, r) => s + Number(r.three_bottom || 0), 0);
    const toad = rows.reduce((s, r) => s + Number(r.three_toad || 0), 0);
    return `<tr class="total">
      <td class="center bold">รวม</td>
      <td class="center bold">${formatMoney(top)}</td>
      <td class="center bold">${formatMoney(bot)}</td>
      <td class="center bold">${formatMoney(toad)}</td>
    </tr>`;
  };

  return `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8"/>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;700;800&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Sarabun', sans-serif; background: #f8fafc; padding: 32px; font-size: 13px; color: #1e293b; }
  h1 { font-size: 20px; font-weight: 800; color: #1e293b; margin-bottom: 4px; }
  .subtitle { font-size: 12px; color: #64748b; margin-bottom: 24px; font-weight: 600; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
  .card { background: #fff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.06); }
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
  tr.total { background: #f8fafc; }
  tr.total td { font-weight: 800; border-bottom: none; }
  td.empty { text-align: center; padding: 28px; color: #94a3b8; }
  .printed-at { margin-top: 20px; font-size: 11px; color: #94a3b8; text-align: right; }
</style>
</head>
<body>
  <h1>รายงานสรุปเลข 3 ตัว</h1>
  <p class="subtitle">สรุปยอดตัดเก็บ / ตัดส่ง เลข 3 ตัวบน / 3 ตัวล่าง / 3 ตัวโต๊ด</p>

  <div class="grid">
    <div class="card">
      <div class="card-header">
        <span class="card-title title-emerald">สรุปยอดตัดเก็บ (kept)</span>
        <span class="pill pill-emerald">KEPT</span>
      </div>
      <table>
        <thead>
          <tr>
            <th>เลข</th>
            <th>3 ตัวบน</th>
            <th>3 ตัวล่าง</th>
            <th>3 ตัวโต๊ด</th>
          </tr>
        </thead>
        <tbody>${buildRows(data.keep)}</tbody>
        <tfoot>${buildTotal(data.keep)}</tfoot>
      </table>
    </div>

    <div class="card">
      <div class="card-header">
        <span class="card-title title-sky">สรุปยอดตัดส่ง (sent)</span>
        <span class="pill pill-sky">SENT</span>
      </div>
      <table>
        <thead>
          <tr>
            <th>เลข</th>
            <th>3 ตัวบน</th>
            <th>3 ตัวล่าง</th>
            <th>3 ตัวโต๊ด</th>
          </tr>
        </thead>
        <tbody>${buildRows(data.send)}</tbody>
        <tfoot>${buildTotal(data.send)}</tfoot>
      </table>
    </div>
  </div>

  <p class="printed-at">พิมพ์เมื่อ: ${new Date().toLocaleString("th-TH")}</p>
</body>
</html>`;
}

// ── controllers ────────────────────────────────────────────────────────────
exports.exportSummary2DPDF = async (req, res) => {
  try {
    const data = await get2DAggregated();
    const html = build2DHTML(data);

    const browser = await puppeteer.launch({
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" }); // รอ font โหลด
    const pdf = await page.pdf({
      format: "A4",
      landscape: true,
      printBackground: true,
    });
    await browser.close();

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="report_2d.pdf"',
    );
    res.end(pdf);
  } catch (err) {
    console.error("exportSummary2DPDF error:", err);
    res.status(500).json({ success: false, message: "Export PDF failed" });
  }
};

exports.exportSummary3DPDF = async (req, res) => {
  try {
    const data = await get3DAggregated();
    const html = build3DHTML(data);

    const browser = await puppeteer.launch({
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdf = await page.pdf({
      format: "A4",
      landscape: true,
      printBackground: true,
    });
    await browser.close();

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="report_3d.pdf"',
    );
    res.end(pdf);
  } catch (err) {
    console.error("exportSummary3DPDF error:", err);
    res.status(500).json({ success: false, message: "Export PDF failed" });
  }
};
