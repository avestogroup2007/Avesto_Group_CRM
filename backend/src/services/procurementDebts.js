// Импорт отчёта iiko «Задолженность перед контрагентами» (Excel) → реальный долг
// по каждому поставщику. Балансовый API iiko этого не даёт (там только счета),
// а этот отчёт — по документам с «Осталось оплатить» и сроком оплаты. Разбор
// терпим к порядку колонок: ищем строку заголовка и колонки по названиям.
import ExcelJS from "exceljs";
import { db } from "../db.js";

// ExcelJS отдаёт значение ячейки не только примитивом: формула — { formula,
// result }, форматированный текст — { richText:[…] }, ссылка — { text,
// hyperlink }, ошибка — { error }. Разворачиваем в примитив, иначе Number(obj)
// = NaN → 0, а String(obj) = "[object Object]".
function cellValue(v) {
  if (v == null || v instanceof Date) return v;
  if (typeof v === "object") {
    if (Array.isArray(v.richText))
      return v.richText.map((t) => (t && t.text) || "").join("");
    if ("result" in v) return v.result;
    if ("text" in v) return v.text;
    if ("error" in v) return null;
  }
  return v;
}

export async function parseDebtWorkbook(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets[0];
  if (!ws) return { rows: [], foundAmountColumn: false };

  // Строка заголовка — первая, где встречается «Контрагент».
  let hdr = -1;
  const col = {};
  ws.eachRow((row, rn) => {
    if (hdr >= 0) return;
    const vals = (row.values || []).map((v) => {
      const u = cellValue(v);
      return u == null ? "" : String(u);
    });
    if (vals.some((v) => v.includes("Контрагент"))) {
      hdr = rn;
      vals.forEach((v, i) => {
        const k = String(v).trim();
        if (k) col[k] = i;
      });
    }
  });
  if (hdr < 0) return { rows: [], foundAmountColumn: false };

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
    const u = cellValue(v);
    const n = Number(u);
    return Number.isFinite(n) ? n : 0;
  };
  const str = (v) => {
    const u = cellValue(v);
    return u == null ? "" : String(u).trim();
  };
  const dt = (v) => {
    const u = cellValue(v);
    if (!u) return null;
    const d = u instanceof Date ? u : new Date(u);
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
  // Признак того, что колонка суммы долга («Осталось оплатить») распознана —
  // иначе импорт молча запишет нули по всем документам.
  return { rows, foundAmountColumn: cRem != null };
}

// Импорт: разобрать буфер и заменить прошлые данные (каждый импорт — свежий срез).
export async function importDebtWorkbook(buffer) {
  const { rows, foundAmountColumn } = await parseDebtWorkbook(buffer);
  if (!rows.length) {
    return {
      imported: 0,
      suppliers: 0,
      error:
        "В файле не найдены строки с контрагентами. Загрузите отчёт iiko «Задолженность перед контрагентами» (Excel).",
    };
  }
  // Колонка суммы долга не распознана — не затираем прошлые данные нулями.
  if (!foundAmountColumn) {
    return {
      imported: 0,
      suppliers: 0,
      error:
        "В файле не найдена колонка «Осталось оплатить». Проверьте, что это отчёт iiko «Задолженность перед контрагентами».",
    };
  }
  const importedAt = new Date();
  // Замена среза атомарно: если запись упадёт, старые данные не потеряются.
  await db.$transaction([
    db.supplierDebtDoc.deleteMany({}),
    db.supplierDebtDoc.createMany({
      data: rows.map((r) => ({ ...r, importedAt })),
    }),
  ]);
  const suppliers = new Set(rows.map((r) => r.supplier)).size;
  return { imported: rows.length, suppliers };
}

// Сводка долга по поставщикам из импортированных документов (или null, если
// импорта ещё не было). Долг = сумма «Осталось оплатить»; просрочка — по сроку.
// warehouse — необязательный фильтр по складу/филиалу (иначе — все склады).
// Дополнительно отдаём разбивку по складам (byWarehouse) для показа «по филиалам».
export async function importedDebtSummary({ warehouse = "" } = {}) {
  const all = await db.supplierDebtDoc.findMany({ take: 100000 });
  if (!all.length) return null;
  // Просрочка — если срок оплаты РАНЬШE сегодняшнего дня. Сравниваем с началом
  // суток, иначе документ со сроком «сегодня» ошибочно считается просроченным.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const round2 = (n) => Math.round(n * 100) / 100;

  // Разбивку по складам считаем по ВСЕМ документам (независимо от фильтра),
  // чтобы селектор филиала всегда показывал полный список складов.
  const byWh = new Map();
  for (const d of all) {
    const rem = Number(d.remaining) || 0;
    if (rem <= 0) continue;
    const wh = d.warehouse || "—";
    const cur = byWh.get(wh) || {
      warehouse: wh,
      debt: 0,
      docs: 0,
      overdueDebt: 0,
      suppliers: new Set(),
    };
    cur.debt += rem;
    cur.docs += 1;
    cur.suppliers.add(d.supplier);
    if (d.dueDate && d.dueDate < today) cur.overdueDebt += rem;
    byWh.set(wh, cur);
  }
  const byWarehouse = [...byWh.values()]
    .map((x) => ({
      warehouse: x.warehouse,
      debt: round2(x.debt),
      docs: x.docs,
      overdueDebt: round2(x.overdueDebt),
      suppliers: x.suppliers.size,
    }))
    .sort((a, b) => b.debt - a.debt);

  const docs = warehouse
    ? all.filter((d) => (d.warehouse || "—") === warehouse)
    : all;

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
      debt: round2(x.debt),
      overdueDebt: round2(x.overdueDebt),
    }))
    .sort((a, b) => b.debt - a.debt);
  return {
    source: "import",
    rows,
    byWarehouse,
    warehouse: warehouse || "",
    totalDebt: round2(total),
    overdueTotal: round2(overdueTotal),
    count: rows.length,
    importedAt: all[0].importedAt,
  };
}
