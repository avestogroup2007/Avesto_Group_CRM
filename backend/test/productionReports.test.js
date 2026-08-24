// Отчёты производства: план/факт и недовыработка по этапам. Считаются только по
// базе CRM — тест это и проверяет: iiko в тестовой среде не настроена, а отчёт
// обязан открываться (разбор смены нужен именно тогда, когда что-то сломалось).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

import { db } from "../src/db.js";
import {
  planFactReport,
  lossesReport,
} from "../src/services/productionReports.js";

const CODE = "REPORT_TEST_";
const DAY = "2026-08-20";
let deptId;

before(async () => {
  const dept = await db.productionDepartment.upsert({
    where: { code: "REPORT_TEST_DEPT" },
    update: { name: "Тестовый отдел" },
    create: { code: "REPORT_TEST_DEPT", name: "Тестовый отдел" },
  });
  deptId = dept.id;

  // Задание A: план 10, факт 6 (с коррекцией) → недовыработка 4.
  const a = await db.productionTask.create({
    data: {
      nodeCode: `${CODE}A`,
      nodeName: "Крем",
      phase: "SEMI",
      planQty: 10,
      unit: "кг",
      deliveryDate: new Date(`${DAY}T00:00:00.000Z`),
      batchId: "report_test",
      departmentId: deptId,
      status: "IN_PROGRESS",
    },
  });
  const wrong = await db.productionFact.create({
    data: { taskId: a.id, qty: 4, reportedById: "tester" },
  });
  await db.productionFact.create({
    data: {
      taskId: a.id,
      qty: 6,
      reportedById: "tester",
      correctionOf: wrong.id,
    },
  });

  // Задание B: план 5, факт 5 → выполнено.
  const b = await db.productionTask.create({
    data: {
      nodeCode: `${CODE}B`,
      nodeName: "Бисквит",
      phase: "ASSEMBLY",
      planQty: 5,
      unit: "шт",
      deliveryDate: new Date(`${DAY}T00:00:00.000Z`),
      batchId: "report_test",
      departmentId: deptId,
      status: "DONE",
    },
  });
  await db.productionFact.create({
    data: { taskId: b.id, qty: 5, reportedById: "tester" },
  });
  await db.generatedDocument.create({
    data: {
      taskId: b.id,
      docType: "TRANSFER",
      warehouseFrom: "WH1",
      warehouseTo: "WH2",
      productCode: "MUKA",
      productName: "Мука",
      qty: 3,
      status: "posted",
    },
  });

  // Задание вне периода — в отчёт попадать не должно.
  await db.productionTask.create({
    data: {
      nodeCode: `${CODE}OUT`,
      nodeName: "Вне периода",
      phase: "SEMI",
      planQty: 100,
      unit: "кг",
      deliveryDate: new Date("2026-09-15T00:00:00.000Z"),
      batchId: "report_test",
      departmentId: deptId,
    },
  });
});

after(async () => {
  await db.generatedDocument.deleteMany({
    where: { task: { nodeCode: { startsWith: CODE } } },
  });
  await db.productionFact.deleteMany({
    where: { task: { nodeCode: { startsWith: CODE } } },
  });
  await db.productionTask.deleteMany({
    where: { nodeCode: { startsWith: CODE } },
  });
  await db.productionDepartment.deleteMany({
    where: { code: "REPORT_TEST_DEPT" },
  });
});

test("план/факт: коррекция заменяет исходный факт, а не суммируется", async () => {
  const rep = await planFactReport({
    from: DAY,
    to: DAY,
    departmentId: deptId,
  });
  assert.equal(rep.total.tasks, 2);
  assert.equal(rep.total.planQty, 15);
  // 6 (коррекция вместо 4) + 5, а не 4 + 6 + 5.
  assert.equal(rep.total.factQty, 11);
  assert.equal(rep.total.deviation, -4);
  assert.equal(rep.total.corrections, 1);
});

test("план/факт: верхняя граница периода включающая", async () => {
  const rep = await planFactReport({
    from: DAY,
    to: DAY,
    departmentId: deptId,
  });
  assert.ok(rep.rows.some((r) => r.nodeCode === `${CODE}A`));
  // Задание из сентября в августовский отчёт не попало.
  assert.ok(!rep.rows.some((r) => r.nodeCode === `${CODE}OUT`));
});

test("план/факт: разрезы по фазам и худшие задания сверху", async () => {
  const rep = await planFactReport({
    from: DAY,
    to: DAY,
    departmentId: deptId,
  });
  const semi = rep.byPhase.find((p) => p.key === "SEMI");
  assert.equal(semi.planQty, 10);
  assert.equal(semi.factQty, 6);
  assert.equal(semi.donePct, 60);
  assert.equal(rep.worst[0].nodeCode, `${CODE}A`);
});

test("потери: недовыработка по этапам и расход сырья", async () => {
  const rep = await lossesReport({ from: DAY, to: DAY, departmentId: deptId });
  assert.equal(rep.total.shortQty, 4);
  assert.equal(rep.total.shortTasks, 1);
  const semi = rep.byPhase.find((p) => p.phase === "SEMI");
  assert.equal(semi.shortQty, 4);
  assert.equal(semi.shortPct, 40);
  const muka = rep.materials.find((m) => m.code === "MUKA");
  assert.equal(muka.qty, 3);
  assert.equal(muka.posted, 1);
});

test("потери: пустой период не ломает отчёт", async () => {
  const rep = await lossesReport({ from: "2020-01-01", to: "2020-01-02" });
  assert.equal(rep.total.tasks, 0);
  assert.equal(rep.total.shortPct, 0);
  assert.deepEqual(rep.materials, []);
});
