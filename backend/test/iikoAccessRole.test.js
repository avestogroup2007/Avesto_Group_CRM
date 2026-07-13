// Кадры из iiko: назначение ролей не должно позволять эскалацию до owner/vendor.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

import { db } from "../src/db.js";
import { updateEmployeeAccess } from "../src/services/iikoSync.js";

let staffId, ownerId;

before(async () => {
  const s = await db.user.upsert({
    where: { name: "acr_staff" },
    update: { role: "staff", active: true, source: "iiko", passwordHash: "x" },
    create: {
      name: "acr_staff",
      role: "staff",
      source: "iiko",
      passwordHash: "x",
    },
  });
  const o = await db.user.upsert({
    where: { name: "acr_owner" },
    update: { role: "owner", active: true, source: "iiko", passwordHash: "x" },
    create: {
      name: "acr_owner",
      role: "owner",
      source: "iiko",
      passwordHash: "x",
    },
  });
  staffId = s.id;
  ownerId = o.id;
});

after(async () => {
  await db.user.deleteMany({ where: { name: { startsWith: "acr_" } } });
});

test("нельзя назначить служебную роль owner/vendor из кадров", async () => {
  await assert.rejects(
    () => updateEmployeeAccess(staffId, { role: "owner" }),
    /Недопустимая роль/
  );
  await assert.rejects(
    () => updateEmployeeAccess(staffId, { role: "vendor" }),
    /Недопустимая роль/
  );
});

test("обычная роль назначается штатно", async () => {
  const r = await updateEmployeeAccess(staffId, { role: "manager" });
  assert.equal(r.role, "manager");
});

test("нельзя менять роль действующему владельцу из кадров", async () => {
  await assert.rejects(
    () => updateEmployeeAccess(ownerId, { role: "staff" }),
    /Back Office/
  );
});
