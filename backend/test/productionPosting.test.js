// Проведение документов производства в iiko: порядок цепочки, повтор, журнал.
// Сеть не трогаем — в тестовой среде iiko не настроена, и проверяем именно то
// поведение, ради которого проведение вынесено отдельным шагом: документ не
// теряется и остаётся в очереди с понятной причиной.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcrypt";

import { app } from "../src/app.js";
import { db } from "../src/db.js";
import { refreshModules } from "../src/services/modules.js";
import {
  sortForPosting,
  isPermanent,
  documentNumberFor,
  postDocument,
  retryPending,
  postingSummary,
} from "../src/services/productionPosting.js";
import {
  saveProductionConfig,
  _resetProductionConfigCache,
} from "../src/services/productionConfig.js";

const PASS = "post_test_pass_123";
let server, base, token, taskId;

const auth = (t) => ({ Authorization: `Bearer ${t}` });
const jsonAuth = (t) => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${t}`,
});

before(async () => {
  const passwordHash = await bcrypt.hash(PASS, 10);
  await db.user.upsert({
    where: { name: "post_director" },
    update: { passwordHash, role: "director", active: true, source: "iiko" },
    create: {
      name: "post_director",
      passwordHash,
      role: "director",
      source: "iiko",
    },
  });
  await db.moduleConfig.upsert({
    where: { id: 1 },
    update: { data: { production: true } },
    create: { id: 1, data: { production: true } },
  });
  await refreshModules(true);

  server = app.listen(0);
  await new Promise((ok) => server.once("listening", ok));
  base = `http://127.0.0.1:${server.address().port}`;
  const res = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login: "post_director", password: PASS }),
  });
  token = (await res.json()).token;

  const task = await db.productionTask.create({
    data: {
      nodeCode: "POST_TEST_NODE",
      nodeName: "Тестовый узел",
      phase: "SEMI",
      planQty: 10,
      unit: "кг",
      deliveryDate: new Date("2026-08-20T00:00:00.000Z"),
      batchId: "post_test_batch",
      warehouseId: "WH_TO",
    },
  });
  taskId = task.id;
  await db.generatedDocument.createMany({
    data: [
      {
        taskId,
        docType: "TRANSFER",
        warehouseFrom: "WH_FROM",
        warehouseTo: "WH_TO",
        productCode: "COMP1",
        productName: "Компонент",
        qty: 2,
        status: "pending",
      },
      {
        taskId,
        docType: "PRODUCTION_ACT",
        warehouseTo: "WH_TO",
        productCode: "POST_TEST_NODE",
        productName: "Тестовый узел",
        qty: 5,
        status: "pending",
      },
    ],
  });
});

after(async () => {
  await db.generatedDocument.deleteMany({ where: { taskId } });
  await db.productionTask.deleteMany({
    where: { nodeCode: "POST_TEST_NODE" },
  });
  await db.productionConfig.deleteMany({ where: { id: 1 } });
  await db.moduleConfig.deleteMany({ where: { id: 1 } });
  await db.auditLog.deleteMany({
    where: { user: { name: { startsWith: "post_" } } },
  });
  await db.user.deleteMany({ where: { name: { startsWith: "post_" } } });
  _resetProductionConfigCache();
  server?.close();
});

test("порядок проведения: перемещение раньше акта", () => {
  const sorted = sortForPosting([
    { docType: "DISASSEMBLY_ACT", createdAt: "2026-01-01" },
    { docType: "PRODUCTION_ACT", createdAt: "2026-01-01" },
    { docType: "TRANSFER", createdAt: "2026-01-01" },
  ]);
  assert.deepEqual(
    sorted.map((d) => d.docType),
    ["TRANSFER", "PRODUCTION_ACT", "DISASSEMBLY_ACT"]
  );
});

test("номер документа стабилен — повтор не плодит дубли", () => {
  const doc = { id: "ckabcdefgh12345678" };
  assert.equal(documentNumberFor(doc, "CRM-"), documentNumberFor(doc, "CRM-"));
  assert.ok(documentNumberFor(doc, "CRM-").startsWith("CRM-"));
});

test("безнадёжные ошибки отличаются от временных", () => {
  assert.equal(isPermanent("Эта сборка iiko не принимает перемещения"), true);
  assert.equal(isPermanent("fetch failed"), false);
});

test("без настроенной iiko документ не теряется, а ждёт в очереди", async () => {
  const doc = await db.generatedDocument.findFirst({
    where: { taskId, docType: "PRODUCTION_ACT" },
  });
  const out = await postDocument(doc.id);
  assert.equal(out.status, "pending");
  assert.match(out.error, /iiko/i);
  // Попытка не засчитана: связи не было, документ виноват не сам по себе.
  assert.equal(out.attempts, 0);
});

test("сводка журнала считает документы по состояниям", async () => {
  const sum = await postingSummary({ taskId });
  assert.equal(sum.pending, 2);
  assert.equal(sum.posted, 0);
});

test("повторная отправка проходит по всей очереди и не падает", async () => {
  const out = await retryPending({ taskId });
  assert.equal(out.total, 2);
  assert.equal(out.posted, 0);
});

test("перемещения можно отключить настройкой отдельно от актов", async () => {
  await saveProductionConfig(
    {
      autoPost: true,
      postTransfers: false,
      maxAttempts: 3,
      numberPrefix: "CRM-",
    },
    null
  );
  const doc = await db.generatedDocument.findFirst({
    where: { taskId, docType: "TRANSFER" },
  });
  const out = await postDocument(doc.id);
  assert.equal(out.status, "pending");
  assert.match(out.error, /iiko|выключена/i);
});

test("журнал документов доступен офису и отдаёт сводку", async () => {
  const res = await fetch(`${base}/api/production/documents?task=${taskId}`, {
    headers: auth(token),
  });
  assert.equal(res.status, 200);
  const d = await res.json();
  assert.equal(d.documents.length, 2);
  assert.ok(d.summary.pending >= 2);
  // Историческое значение "created" наружу не протекает.
  assert.ok(d.documents.every((x) => x.status !== "created"));
});

test("настройки производства читаются и сохраняются", async () => {
  const put = await fetch(`${base}/api/production/config`, {
    method: "PUT",
    headers: jsonAuth(token),
    body: JSON.stringify({
      autoPost: false,
      postTransfers: true,
      maxAttempts: 2,
      numberPrefix: "CRM-",
    }),
  });
  assert.equal(put.status, 200);
  const get = await fetch(`${base}/api/production/config`, {
    headers: auth(token),
  });
  const cfg = await get.json();
  assert.equal(cfg.autoPost, false);
  assert.equal(cfg.maxAttempts, 2);
});
