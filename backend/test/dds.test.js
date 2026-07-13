// ДДС: движение денежных средств по месяцам и статьям. Учитываются только
// согласованные операции; заявки/отклонённые в отчёт не входят.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcrypt";

import { app } from "../src/app.js";
import { db } from "../src/db.js";

const PASS = "dds_test_pass_123";
let server, base, directorToken, staffToken;

async function login(name) {
  const res = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login: name, password: PASS }),
  });
  return (await res.json()).token;
}
const auth = (t) => ({ Authorization: `Bearer ${t}` });

const mkTx = (data) =>
  db.moneyTx.create({
    data: {
      currency: "UZS",
      rate: 1,
      comment: "DDSTEST",
      ...data,
    },
  });

before(async () => {
  const passwordHash = await bcrypt.hash(PASS, 10);
  for (const [name, role] of [
    ["dds_director", "director"],
    ["dds_staff", "staff"],
  ]) {
    await db.user.upsert({
      where: { name },
      update: { passwordHash, role, active: true, source: "iiko" },
      create: { name, passwordHash, role, source: "iiko" },
    });
  }
  await db.moneyTx.deleteMany({ where: { comment: "DDSTEST" } });
  // Май: приход 1 000 000 «Выручка».
  await mkTx({
    date: "2026-05-10",
    direction: "income",
    category: "Приход",
    ddsArticle: "Выручка",
    amount: 1000000n,
    amountUzs: 1000000n,
    approval: "approved",
  });
  // Июнь: расход 300 000 «Аренда».
  await mkTx({
    date: "2026-06-05",
    direction: "expense",
    category: "Аренда",
    ddsArticle: "Аренда",
    amount: 300000n,
    amountUzs: 300000n,
    approval: "approved",
  });
  // Июнь: заявка на расход (pending) — НЕ должна попасть в ДДС.
  await mkTx({
    date: "2026-06-06",
    direction: "expense",
    category: "Маркетинг",
    ddsArticle: "Маркетинг",
    amount: 999999n,
    amountUzs: 999999n,
    approval: "pending",
  });

  server = app.listen(0);
  await new Promise((ok) => server.once("listening", ok));
  base = `http://127.0.0.1:${server.address().port}`;
  directorToken = await login("dds_director");
  staffToken = await login("dds_staff");
});

after(async () => {
  await db.moneyTx.deleteMany({ where: { comment: "DDSTEST" } });
  await db.auditLog.deleteMany({
    where: { user: { name: { startsWith: "dds_" } } },
  });
  await db.user.deleteMany({ where: { name: { startsWith: "dds_" } } });
  server?.close();
});

test("ДДС: линейному персоналу недоступен (модуль денег — офис)", async () => {
  const res = await fetch(`${base}/api/money/dds`, {
    headers: auth(staffToken),
  });
  assert.equal(res.status, 403);
});

test("ДДС: помесячно по статьям, только согласованные", async () => {
  const res = await fetch(
    `${base}/api/money/dds?from=2026-05-01&to=2026-06-30`,
    { headers: auth(directorToken) }
  );
  assert.equal(res.status, 200);
  const d = await res.json();
  assert.deepEqual(d.months, ["2026-05", "2026-06"]);
  // Приток: Выручка 1 000 000 в мае.
  const rev = d.income.find((x) => x.article === "Выручка");
  assert.ok(rev);
  assert.equal(rev.total, 1000000);
  assert.equal(rev.byMonth["2026-05"], 1000000);
  // Отток: Аренда 300 000 в июне; Маркетинг (pending) НЕ входит.
  const rent = d.expense.find((x) => x.article === "Аренда");
  assert.equal(rent.total, 300000);
  assert.ok(!d.expense.some((x) => x.article === "Маркетинг"));
  // Итоги.
  assert.equal(d.totals.income, 1000000);
  assert.equal(d.totals.expense, 300000);
  assert.equal(d.totals.net, 700000);
});

test("экспорт реестра операций в CSV", async () => {
  const res = await fetch(
    `${base}/api/money/export?from=2026-05-01&to=2026-06-30`,
    { headers: auth(directorToken) }
  );
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") || "", /text\/csv/);
  assert.match(
    res.headers.get("content-disposition") || "",
    /attachment; filename=/
  );
  const csv = await res.text();
  // Заголовок и строки присутствуют; реестр включает и заявку (со статусом).
  assert.match(csv, /"Дата";.*"Статья ДДС"/);
  assert.match(csv, /Выручка/);
  assert.match(csv, /Аренда/);
  assert.match(csv, /На согласовании/); // pending-заявка попадает в реестр
});
