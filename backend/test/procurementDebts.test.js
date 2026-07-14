// Юнит-тест разбора отчёта iiko «Задолженность перед контрагентами» (Excel):
// строим книгу в памяти (без сети/БД) и проверяем, что колонки находятся по
// названиям, а не по позиции, и суммы/сроки читаются верно.
import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import {
  parseDebtWorkbook,
  importedDebtSummary,
} from "../src/services/procurementDebts.js";
import { db } from "../src/db.js";

async function makeWorkbook(rows) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Долги");
  // Отчёт iiko: до заголовка идёт «шапка» (название, период) — имитируем.
  ws.addRow(["Задолженность перед контрагентами"]);
  ws.addRow([]);
  ws.addRow([
    "Тип документа",
    "№ документа",
    "Дата",
    "Срок оплаты",
    "Склад",
    "Контрагент",
    "Сумма, c",
    "Оплачено, c",
    "Осталось оплатить, c",
  ]);
  for (const r of rows) ws.addRow(r);
  return wb.xlsx.writeBuffer();
}

test("разбор долгов: колонки по названиям, суммы и сроки", async () => {
  const buf = await makeWorkbook([
    [
      "Приходная накладная",
      "N-1",
      "2026-06-01",
      "2026-06-10",
      "Склад Кухни",
      "ООО Поставщик А",
      1000,
      200,
      800,
    ],
    [
      "Приходная накладная",
      "N-2",
      "2026-06-02",
      "2026-07-20",
      "Склад Магазина",
      "ООО Поставщик Б",
      500,
      500,
      0,
    ],
  ]);
  const { rows } = await parseDebtWorkbook(Buffer.from(buf));
  assert.equal(rows.length, 2);
  assert.equal(rows[0].supplier, "ООО Поставщик А");
  assert.equal(rows[0].remaining, 800);
  assert.equal(rows[0].paid, 200);
  assert.equal(rows[0].amount, 1000);
  assert.equal(rows[0].warehouse, "Склад Кухни");
  assert.ok(rows[0].dueDate instanceof Date);
  assert.equal(rows[1].remaining, 0);
});

test("разбор долгов: пустой/чужой файл — пустой список, не исключение", async () => {
  const wb = new ExcelJS.Workbook();
  wb.addWorksheet("x").addRow(["что-то", "другое"]);
  const buf = await wb.xlsx.writeBuffer();
  const { rows } = await parseDebtWorkbook(Buffer.from(buf));
  assert.deepEqual(rows, []);
});

test("сводка долгов: разбивка и фильтр по складу (филиалу)", async () => {
  await db.supplierDebtDoc.deleteMany({});
  const importedAt = new Date();
  await db.supplierDebtDoc.createMany({
    data: [
      {
        supplier: "Поставщик А",
        remaining: 800,
        warehouse: "Склад Кухни",
        dueDate: new Date("2000-01-01"), // просрочено
        importedAt,
      },
      {
        supplier: "Поставщик Б",
        remaining: 200,
        warehouse: "Склад Кухни",
        dueDate: null,
        importedAt,
      },
      {
        supplier: "Поставщик А",
        remaining: 500,
        warehouse: "Склад Магазина",
        dueDate: null,
        importedAt,
      },
    ],
  });

  const all = await importedDebtSummary();
  assert.equal(all.totalDebt, 1500);
  // Разбивка по складам — по всем документам, отсортирована по долгу.
  assert.equal(all.byWarehouse.length, 2);
  assert.equal(all.byWarehouse[0].warehouse, "Склад Кухни");
  assert.equal(all.byWarehouse[0].debt, 1000);
  assert.equal(all.byWarehouse[0].overdueDebt, 800);

  // Фильтр по складу — только его документы.
  const kitchen = await importedDebtSummary({ warehouse: "Склад Кухни" });
  assert.equal(kitchen.totalDebt, 1000);
  assert.equal(kitchen.warehouse, "Склад Кухни");
  // Разбивка по складам остаётся полной (для селектора филиала).
  assert.equal(kitchen.byWarehouse.length, 2);

  await db.supplierDebtDoc.deleteMany({});
});
