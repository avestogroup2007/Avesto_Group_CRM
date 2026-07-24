// Импорт клиентской базы из Excel (ручной источник CVM). Колонки распознаём по
// заголовку (рус/eng): Имя, Телефон, Визитов/Заказов, Сумма, Последняя покупка,
// Первая покупка, Согласие, Филиал, Email. Дедуп по нормализованному телефону
// (иначе по имени). Каждая строка — upsert: агрегаты обновляются.
import ExcelJS from "exceljs";
import { db } from "../db.js";
import { normalizePhone } from "./cvm.js";

// Значение ячейки ExcelJS: разворачиваем формулы/richText в примитив.
function cellValue(v) {
  if (v == null) return null;
  if (typeof v === "object") {
    if (v.result !== undefined) return v.result; // формула
    if (v.text !== undefined) return v.text; // hyperlink/simple
    if (Array.isArray(v.richText))
      return v.richText.map((t) => t.text).join("");
    if (v instanceof Date) return v;
  }
  return v;
}

const str = (v) => {
  const u = cellValue(v);
  return u == null ? "" : String(u).trim();
};
const num = (v) => {
  const u = cellValue(v);
  if (typeof u === "number") return Number.isFinite(u) ? u : 0;
  const s = String(u ?? "")
    .replace(/[\s']/g, "")
    .replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};
const dt = (v) => {
  const u = cellValue(v);
  if (!u) return null;
  if (u instanceof Date) return isNaN(u) ? null : u;
  const s = String(u).trim();
  const m = s.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})/);
  if (m) {
    const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
    return isNaN(d) ? null : d;
  }
  const d = new Date(s);
  return isNaN(d) ? null : d;
};

const yes = (v) => /^(1|да|yes|true|y|\+|согласие|есть)$/i.test(str(v));

// Парсит книгу → массив клиентов { name, phone, email, orders, totalSpent,
// firstOrderAt, lastOrderAt, consent, branchName }. Не пишет в БД.
export async function parseCustomerWorkbook(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets[0];
  if (!ws) return { rows: [], foundAmountColumn: false };

  const col = {};
  let hdr = -1;
  ws.eachRow((row, rn) => {
    if (hdr >= 0) return;
    const vals = row.values || [];
    const joined = vals.map((v) => String(cellValue(v) ?? "").toLowerCase());
    if (joined.some((s) => /имя|телефон|клиент|гость|phone|name/.test(s))) {
      hdr = rn;
      vals.forEach((v, i) => {
        const k = String(cellValue(v) ?? "").trim();
        if (k) col[k.toLowerCase()] = i;
      });
    }
  });
  if (hdr < 0) return { rows: [], foundAmountColumn: false };

  const find = (...res) => {
    for (const key of Object.keys(col)) {
      if (res.some((re) => re.test(key))) return col[key];
    }
    return null;
  };
  const cName = find(/имя|фио|клиент|гость|name/);
  const cPhone = find(/телефон|тел\.?|phone|моб/);
  const cEmail = find(/e-?mail|почта/);
  const cOrders = find(/визит|заказ|покуп|частот|orders|visits/);
  const cSum = find(/сумм|потрач|оборот|monetary|spent|ltv/);
  const cLast = find(/последн|last/);
  const cFirst = find(/перв|first|регистр/);
  const cConsent = find(/соглас|consent|рассылк|opt/);
  const cBranch = find(/филиал|branch|точк/);

  const rows = [];
  ws.eachRow((row, rn) => {
    if (rn <= hdr) return;
    const name = cName ? str(row.getCell(cName).value) : "";
    const phone = cPhone ? normalizePhone(str(row.getCell(cPhone).value)) : "";
    if (!name && !phone) return; // пустая строка
    rows.push({
      name,
      phone,
      email: cEmail ? str(row.getCell(cEmail).value) : "",
      orders: cOrders
        ? Math.max(0, Math.round(num(row.getCell(cOrders).value)))
        : 0,
      totalSpent: cSum
        ? Math.max(0, Math.round(num(row.getCell(cSum).value)))
        : 0,
      firstOrderAt: cFirst ? dt(row.getCell(cFirst).value) : null,
      lastOrderAt: cLast ? dt(row.getCell(cLast).value) : null,
      consent: cConsent ? yes(row.getCell(cConsent).value) : false,
      branchName: cBranch ? str(row.getCell(cBranch).value) : "",
    });
  });
  return { rows, foundAmountColumn: cSum != null };
}

// Импорт: upsert по phone (если есть) иначе по name. Возвращает статистику.
export async function importCustomerWorkbook(buffer) {
  const { rows, foundAmountColumn } = await parseCustomerWorkbook(buffer);
  let created = 0;
  let updated = 0;
  for (const rrow of rows) {
    // Ищем существующего клиента (по телефону — надёжный ключ; иначе по имени
    // среди записей без телефона, чтобы не плодить дубли ручного ввода).
    const existing = await db.customer.findFirst({
      where:
        rrow.phone && rrow.phone.length
          ? { phone: rrow.phone }
          : { name: rrow.name, phone: "" },
    });
    const data = {
      source: "import",
      name: rrow.name || existing?.name || "",
      phone: rrow.phone,
      email: rrow.email || existing?.email || "",
      branchName: rrow.branchName || existing?.branchName || "",
      consent: rrow.consent || existing?.consent || false,
      orders: rrow.orders,
      totalSpent: BigInt(rrow.totalSpent),
      firstOrderAt: rrow.firstOrderAt || existing?.firstOrderAt || null,
      lastOrderAt: rrow.lastOrderAt || existing?.lastOrderAt || null,
    };
    if (existing) {
      await db.customer.update({ where: { id: existing.id }, data });
      updated += 1;
    } else {
      await db.customer.create({ data });
      created += 1;
    }
  }
  return {
    total: rows.length,
    created,
    updated,
    foundAmountColumn,
    warning: foundAmountColumn ? "" : "Колонка суммы не найдена — LTV будет 0",
  };
}
