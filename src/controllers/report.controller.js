const ExcelJS = require("exceljs");
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
