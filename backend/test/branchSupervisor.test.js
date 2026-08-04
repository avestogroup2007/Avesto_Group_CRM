// Надзор за всеми филиалами (allBranches): филиальная роль с флагом видит данные
// по всей сети; при этом деньги остаются закрыты ролевыми проверками отдельно.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

import { db } from "../src/db.js";
import { forcedBranch, NO_BRANCH } from "../src/util/branchScope.js";
import { updateEmployeeAccess } from "../src/services/iikoSync.js";

test("forcedBranch: флаг надзора открывает всю сеть филиальной роли", () => {
  // Управляющий, привязанный к филиалу «5», обычно видит только его.
  const scoped = { role: "manager", assignedBranch: "5", allBranches: false };
  assert.equal(forcedBranch(scoped), "5");
  assert.equal(forcedBranch(scoped, { failClosed: true }), "5");

  // С флагом надзора — видит все филиалы (как обзорная роль).
  const supervisor = {
    role: "manager",
    assignedBranch: "5",
    allBranches: true,
  };
  assert.equal(forcedBranch(supervisor), null);
  assert.equal(forcedBranch(supervisor, { failClosed: true }), null);
});

test("forcedBranch: без филиала и без флага чтение fail-closed", () => {
  const unbound = { role: "manager", assignedBranch: "", allBranches: false };
  assert.equal(forcedBranch(unbound), null);
  assert.equal(forcedBranch(unbound, { failClosed: true }), NO_BRANCH);
});

let empId;
before(async () => {
  const u = await db.user.upsert({
    where: { name: "sup_bartender" },
    update: {
      role: "manager",
      active: true,
      source: "iiko",
      passwordHash: "x",
    },
    create: {
      name: "sup_bartender",
      role: "manager",
      source: "iiko",
      passwordHash: "x",
    },
  });
  empId = u.id;
});

after(async () => {
  await db.user.deleteMany({ where: { name: "sup_bartender" } });
});

test("updateEmployeeAccess сохраняет и снимает флаг надзора", async () => {
  await updateEmployeeAccess(empId, { allBranches: true });
  let u = await db.user.findUnique({ where: { id: empId } });
  assert.equal(u.allBranches, true);

  await updateEmployeeAccess(empId, { allBranches: false });
  u = await db.user.findUnique({ where: { id: empId } });
  assert.equal(u.allBranches, false);
});
