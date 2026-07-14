// Импорт отчёта iiko «Задолженность перед контрагентами» (Excel) → реальный долг
// по каждому поставщику. Балансовый API iiko этого не даёт (там только счета),
// а этот отчёт — по документам с «Осталось оплатить» и сроком оплаты. Разбор
// терпим к порядку колонок: ищем строку заголовка и колонки по названиям.
import ExcelJS from "exceljs";
import { db } from "../db.js";

export async function parseDebtWorkbook(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets[0];
  if (!ws) return { rows: [] };

  // Строка заголовка — первая, где встречается «Контрагент».
  let hdr = -1;
  const col = {};
  ws.eachRow((row, rn) => {
    if (hdr >= 0) return;
    const vals = (row.values || []).map((v) => (v == null ? "" : String(v)));
    if (vals.some((v) => v.includes("Контрагент"))) {
      hdr = rn;
      vals.forEach((v, i) => {
        const k = String(v).trim();
        if (k) col[k] = i;
      });
    }
  });
  if (hdr < 0) return { rows: [] };

  const find = (...names) => {
    for (const n of names) if (col[n] != null) return col[n];
    return null;
  };
  const cCon = find("Контрагент");
  const cRem = find("Осталось оплатить, c", "Осталось оплатить");
  const cAmt = find("Сумма, c", "Сумма");
  const cPaid = find("Оплачено, c", "Оплачено");
  const cDue = find("Срок оплаты");
  const cDate = find("Дата");
  const cNum = find("№ документа", "№");
  const cType = find("Тип документа");
  const cWh = find("Склад");

  const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  const str = (v) => (v == null ? "" : String(v).trim());
  const dt = (v) => {
    if (!v) return null;
    const d = v instanceof Date ? v : new Date(v);
    return isNaN(d) ? null : d;
  };

  const rows = [];
  ws.eachRow((row, rn) => {
    if (rn <= hdr) return;
    const supplier = cCon ? str(row.getCell(cCon).value) : "";
    if (!supplier) return;
    rows.push({
      docNumber: cNum ? str(row.getCell(cNum).value) : "",
      docType: cType ? str(row.getCell(cType).value) : "",
      supplier,
      date: cDate ? dt(row.getCell(cDate).value) : null,
      dueDate: cDue ? dt(row.getCell(cDue).value) : null,
      amount: cAmt ? num(row.getCell(cAmt).value) : 0,
      paid: cPaid ? num(row.getCell(cPaid).value) : 0,
      remaining: cRem ? num(row.getCell(cRem).value) : 0,
      warehouse: cWh ? str(row.getCell(cWh).value) : "",
    });
  });
  return { rows };
}

// Импорт: разобрать буфер и заменить прошлые данные (каждый импорт — свежий срез).
export async function importDebtWorkbook(buffer) {
  const { rows } = await parseDebtWorkbook(buffer);
  if (!rows.length) {
    return {
      imported: 0,
      suppliers: 0,
      error:
        "В файле не найдены строки с контрагентами. Загрузите отчёт iiko «Задолженность перед контрагентами» (Excel).",
    };
  }
  await db.supplierDebtDoc.deleteMany({});
  const importedAt = new Date();
  await db.supplierDebtDoc.createMany({
    data: rows.map((r) => ({ ...r, importedAt })),
  });
  const suppliers = new Set(rows.map((r) => r.supplier)).size;
  return { imported: rows.length, suppliers };
}

// Сводка долга по поставщикам из импортированных документов (или null, если
// импорта ещё не было). Долг = сумма «Осталось оплатить»; просрочка — по сроку.
export async function importedDebtSummary() {
  const docs = await db.supplierDebtDoc.findMany({ take: 100000 });
  if (!docs.length) return null;
  const today = new Date();
  const bySup = new Map();
  let total = 0;
  let overdueTotal = 0;
  for (const d of docs) {
    const rem = Number(d.remaining) || 0;
    if (rem <= 0) continue;
    const cur = bySup.get(d.supplier) || {
      name: d.supplier,
      debt: 0,
      docs: 0,
      overdue: 0,
      overdueDebt: 0,
    };
    cur.debt += rem;
    cur.docs += 1;
    total += rem;
    if (d.dueDate && d.dueDate < today) {
      cur.overdue += 1;
      cur.overdueDebt += rem;
      overdueTotal += rem;
    }
    bySup.set(d.supplier, cur);
  }
  const rows = [...bySup.values()]
    .map((x) => ({
      ...x,
      debt: Math.round(x.debt * 100) / 100,
      overdueDebt: Math.round(x.overdueDebt * 100) / 100,
    }))
    .sort((a, b) => b.debt - a.debt);
  return {
    source: "import",
    rows,
    totalDebt: Math.round(total * 100) / 100,
    overdueTotal: Math.round(overdueTotal * 100) / 100,
    count: rows.length,
    importedAt: docs[0].importedAt,
  };
}
