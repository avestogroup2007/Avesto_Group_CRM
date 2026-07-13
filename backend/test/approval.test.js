// Пороги согласования расходов: чтение/запись по ролям и авто-согласование
// расхода не выше порога (общий и по филиалу).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcrypt";

import { app } from "../src/app.js";
import { db } from "../src/db.js";
import { refreshApprovalConfig } from "../src/services/approvalConfig.js";

const PASS = "appr_test_pass_123";
let server, base, directorToken, accountantToken, ownerToken;

async function login(name) {
  const res = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login: name, password: PASS }),
  });
  return (await res.json()).token;
}
const auth = (t) => ({
  Authorization: `Bearer ${t}`,
  "Content-Type": "application/json",
});

before(async () => {
  const passwordHash = await bcrypt.hash(PASS, 10);
  for (const [name, role] of [
    ["appr_director", "director"],
    ["appr_accountant", "accountant"],
    ["appr_owner", "owner"],
  ]) {
    await db.user.upsert({
      where: { name },
      update: { passwordHash, role, active: true, source: "iiko" },
      create: { name, passwordHash, role, source: "iiko" },
    });
  }
  await db.approvalConfig.deleteMany({});
  await refreshApprovalConfig(true);
  server = app.listen(0);
  await new Promise((ok) => server.once("listening", ok));
  base = `http://127.0.0.1:${server.address().port}`;
  directorToken = await login("appr_director");
  accountantToken = await login("appr_accountant");
  ownerToken = await login("appr_owner");
});

after(async () => {
  await db.moneyTx.deleteMany({
    where: { comment: { startsWith: "APPRTEST" } },
  });
  await db.approvalConfig.deleteMany({});
  const names = ["appr_director", "appr_accountant", "appr_owner"];
  await db.auditLog.deleteMany({ where: { user: { name: { in: names } } } });
  await db.user.deleteMany({ where: { name: { in: names } } });
  await refreshApprovalConfig(true);
  server?.close();
});

const mkExpense = (token, amount, comment, branchId = null) =>
  fetch(`${base}/api/money`, {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify({
      date: "2026-07-13",
      direction: "expense",
      category: "Хоз. расходы",
      amount,
      comment,
      branchId,
    }),
  });

test("по умолчанию (порог 0) любой расход уходит на согласование", async () => {
  await refreshApprovalConfig(true);
  const res = await mkExpense(accountantToken, 50000, "APPRTEST default");
  assert.equal(res.status, 201);
  const tx = await res.json();
  assert.equal(tx.approval, "pending");
});

test("запись порогов — директору можно, бухгалтеру нет", async () => {
  const denied = await fetch(`${base}/api/approval`, {
    method: "PUT",
    headers: auth(accountantToken),
    body: JSON.stringify({ threshold: 100000, branchThresholds: {} }),
  });
  assert.equal(denied.status, 403);

  const ok = await fetch(`${base}/api/approval`, {
    method: "PUT",
    headers: auth(directorToken),
    body: JSON.stringify({
      threshold: 100000,
      branchThresholds: { 2: 500000 },
    }),
  });
  assert.equal(ok.status, 200);
  const cfg = await ok.json();
  assert.equal(cfg.threshold, 100000);
  assert.equal(cfg.branchThresholds["2"], 500000);

  // Аудит записан.
  const logged = await db.auditLog.count({
    where: { event: "approval_config_update" },
  });
  assert.ok(logged >= 1);
});

test("расход не выше общего порога проводится сразу, выше — на согласование", async () => {
  await refreshApprovalConfig(true);
  // 80 000 ≤ 100 000 → approved
  const small = await (
    await mkExpense(accountantToken, 80000, "APPRTEST small")
  ).json();
  assert.equal(small.approval, "approved");
  // 150 000 > 100 000 → pending
  const big = await (
    await mkExpense(accountantToken, 150000, "APPRTEST big")
  ).json();
  assert.equal(big.approval, "pending");
});

test("порог по филиалу переопределяет общий", async () => {
  await refreshApprovalConfig(true);
  // Филиал 2 имеет порог 500 000: 150 000 ≤ 500 000 → approved
  const branchSmall = await (
    await mkExpense(accountantToken, 150000, "APPRTEST br", "2")
  ).json();
  assert.equal(branchSmall.approval, "approved");
  // Филиал 1 без переопределения → общий порог 100 000: 150 000 > 100 000 → pending
  const otherBranch = await (
    await mkExpense(accountantToken, 150000, "APPRTEST br1", "1")
  ).json();
  assert.equal(otherBranch.approval, "pending");
});

test("owner может провести расход сразу (postNow), как директор/финансы", async () => {
  const res = await fetch(`${base}/api/money`, {
    method: "POST",
    headers: auth(ownerToken),
    body: JSON.stringify({
      date: "2026-07-13",
      direction: "expense",
      category: "Хоз. расходы",
      amount: 5000000,
      comment: "APPRTEST owner postNow",
      postNow: true,
    }),
  });
  assert.equal(res.status, 201);
  assert.equal((await res.json()).approval, "approved");
});

test("запредельный курс отклоняется как 400, а не падает 500", async () => {
  const res = await fetch(`${base}/api/money`, {
    method: "POST",
    headers: auth(directorToken),
    body: JSON.stringify({
      date: "2026-07-13",
      direction: "expense",
      category: "Хоз. расходы",
      amount: 1000,
      currency: "USD",
      rate: 1e12,
      comment: "APPRTEST rate",
    }),
  });
  assert.equal(res.status, 400);
});

test("приход не требует согласования независимо от порога", async () => {
  const res = await fetch(`${base}/api/money`, {
    method: "POST",
    headers: auth(accountantToken),
    body: JSON.stringify({
      date: "2026-07-13",
      direction: "income",
      category: "Пополнение уставного фонда",
      amount: 999999999,
      comment: "APPRTEST income",
    }),
  });
  const tx = await res.json();
  assert.equal(tx.approval, "approved");
});
