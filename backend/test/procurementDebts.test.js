// Юнит-тест разбора отчёта iiko «Задолженность перед контрагентами» (Excel):
// строим книгу в памяти (без сети/БД) и проверяем, что колонки находятся по
// названиям, а не по позиции, и суммы/сроки читаются верно.
import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { parseDebtWorkbook } from "../src/services/procurementDebts.js";

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
