// Бот: чек-листы по шаблонам из админки. Меню сотрудника показывает кнопки
// role/cleaning шаблонов (с гейтингом по модулям и фильтром по должности),
// почасовой уборочный шаблон разворачивается в подменю часов.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

import { db } from "../src/db.js";
import { refreshModules } from "../src/services/modules.js";
import { refreshOrgConfig } from "../src/services/orgConfig.js";
import { _internals } from "../src/services/telegramBot.js";

const { loadStaffTemplates, templateSlots, templateHoursView, menuView } =
  _internals;

const staff = {
  id: "bot_tpl_staff",
  displayName: "Уборщица Тест",
  position: "Официант",
  checklistBranch: "1",
  role: "staff",
};
let roleTpl, cleanTpl;

before(async () => {
  await db.shiftChecklistRun.deleteMany({});
  await db.checklistTemplate.deleteMany({});
  await db.moduleConfig.deleteMany({});
  await refreshModules(true);
  await refreshOrgConfig(true);
  roleTpl = await db.checklistTemplate.create({
    data: {
      kind: "role",
      position: "Официант",
      title: "Открытие смены официанта",
      items: [{ text: "Форма чистая", needPhoto: false }],
      scheduleType: "shift",
      active: true,
    },
  });
  cleanTpl = await db.checklistTemplate.create({
    data: {
      kind: "cleaning",
      title: "Санузел по часам",
      items: [{ text: "Пол вымыт", needPhoto: true }],
      scheduleType: "hourly",
      fromHour: 9,
      toHour: 11,
      active: true,
    },
  });
});

after(async () => {
  await db.shiftChecklistRun.deleteMany({});
  await db.checklistTemplate.deleteMany({});
  await db.moduleConfig.deleteMany({});
  await refreshModules(true);
});

test("loadStaffTemplates: при выключенных модулях — пусто", async () => {
  await refreshModules(true);
  const t = await loadStaffTemplates(staff);
  assert.deepEqual(t.role, []);
  assert.deepEqual(t.cleaning, []);
});

test("loadStaffTemplates: модули включены — role по должности + cleaning", async () => {
  await db.moduleConfig.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      data: { employeeChecklists: true, cleaningChecklists: true },
    },
    update: { data: { employeeChecklists: true, cleaningChecklists: true } },
  });
  await refreshModules(true);
  const t = await loadStaffTemplates(staff);
  assert.equal(t.role.length, 1);
  assert.equal(t.role[0].id, roleTpl.id);
  assert.equal(t.cleaning.length, 1);

  // Сотрудник другой должности не видит role-шаблон официанта.
  const other = await loadStaffTemplates({ ...staff, position: "Повар" });
  assert.equal(other.role.length, 0);
  assert.equal(other.cleaning.length, 1); // уборка — для всех
});

test("templateSlots: почасовой шаблон разворачивается в окно fromHour..toHour", () => {
  const slots = templateSlots(cleanTpl, "1");
  assert.deepEqual(slots, ["09:00", "10:00", "11:00"]);
  // Разовый (shift) — один слот null.
  assert.deepEqual(templateSlots(roleTpl, "1"), [null]);
});

test("menuView: показывает кнопки шаблонов (ptpl и tplhrs)", async () => {
  await refreshModules(true);
  const { keyboard } = await menuView(staff);
  const cbs = keyboard.flat().map((b) => b.callback_data);
  // role-шаблон — прямая кнопка ptpl|<id>|-
  assert.ok(cbs.includes(`ptpl|${roleTpl.id}|-`));
  // почасовой cleaning — подменю часов tplhrs|<id>
  assert.ok(cbs.includes(`tplhrs|${cleanTpl.id}`));
  // Легаси-кнопки на месте.
  assert.ok(cbs.includes("pick|open|-"));
});

test("templateHoursView: слоты часов ведут на ptpl|<id>|<slot>", async () => {
  const { text, keyboard } = await templateHoursView(staff, cleanTpl);
  assert.match(text, /Санузел по часам/);
  const cbs = keyboard.flat().map((b) => b.callback_data);
  assert.ok(cbs.includes(`ptpl|${cleanTpl.id}|09:00`));
  assert.ok(cbs.includes(`ptpl|${cleanTpl.id}|11:00`));
  assert.ok(cbs.includes("backmenu"));
});
