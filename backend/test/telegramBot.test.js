// Юнит-тесты чистой логики бота чек-листов (без сети и БД): рабочее окно по
// типу точки, генерация часовых слотов и рендер клавиатуры чек-листа.
import test from "node:test";
import assert from "node:assert/strict";
import { _internals } from "../src/services/telegramBot.js";

const { hourSlots, branchHours, checklistView, freshItems, CHECKLIST_DEFS } =
  _internals;

test("рабочее окно: производство 07–16, ресторан 08–20", () => {
  assert.deepEqual(branchHours(4), { from: 7, to: 16 }); // Наврузий цех
  assert.deepEqual(branchHours(6), { from: 7, to: 16 }); // Кейтеринг
  assert.deepEqual(branchHours(1), { from: 8, to: 20 }); // Ресторан
});

test("часовые слоты: цех 10 слотов, ресторан 13 слотов", () => {
  const prod = hourSlots(4);
  const rest = hourSlots(1);
  assert.equal(prod.length, 10);
  assert.equal(prod[0], "07:00");
  assert.equal(prod[prod.length - 1], "16:00");
  assert.equal(rest.length, 13);
  assert.equal(rest[0], "08:00");
  assert.equal(rest[rest.length - 1], "20:00");
});

test("checklistView: пункт с фото без фото → кнопка запроса фото (ph|i)", () => {
  const items = freshItems("sanitary");
  const state = { kind: "sanitary", slot: "09:00", branchId: 1, items };
  const { text, keyboard } = checklistView(state);
  assert.match(text, /Санитарный обход/);
  assert.match(text, /09:00/);
  // Первый пункт (Унитаз очищен) — needPhoto: без фото действие ph|0
  assert.equal(keyboard[0][0].callback_data, "ph|0");
  // Пункт «Пол вымыт» (индекс 2) — без фото, действие tg|2
  assert.equal(keyboard[2][0].callback_data, "tg|2");
  // Последний ряд — Сдать/Отмена
  const last = keyboard[keyboard.length - 1];
  assert.equal(last[0].callback_data, "submit");
  assert.equal(last[1].callback_data, "cancel");
});

test("checklistView: с приложенным фото пункт становится переключаемым (tg|i)", () => {
  const items = freshItems("sanitary");
  items[0].photoFileId = "AgAC123";
  items[0].done = true;
  const state = { kind: "sanitary", slot: "09:00", branchId: 1, items };
  const { keyboard, text } = checklistView(state);
  assert.equal(keyboard[0][0].callback_data, "tg|0");
  assert.match(keyboard[0][0].text, /✅/);
  assert.match(text, /Отмечено 1\/7/);
});

test("шаблоны: sanitary/open/close заданы и непусты", () => {
  for (const k of ["sanitary", "open", "close"]) {
    assert.ok(CHECKLIST_DEFS[k].items.length > 0);
  }
  // В санитарном есть пункты с обязательным фото
  assert.ok(CHECKLIST_DEFS.sanitary.items.some((i) => i.needPhoto));
});

test("mgmtMenuView: офисной роли — сводки, а не чек-листы уборщицы", () => {
  const { mgmtMenuView, OFFICE_ROLES } = _internals;
  assert.equal(OFFICE_ROLES.has("director"), true);
  assert.equal(OFFICE_ROLES.has("staff"), false);
  const { text, keyboard } = mgmtMenuView({
    displayName: "Директор Тест",
    role: "director",
  });
  assert.match(text, /Директор Тест/);
  assert.match(text, /Руководство/);
  const actions = keyboard.flat().map((b) => b.callback_data);
  assert.deepEqual(actions, ["mgr|checks", "mgr|sales", "mgr|own"]);
});

test("mgmtChecksView: сводка содержит все филиалы и кнопку возврата", async () => {
  const { mgmtChecksView } = _internals;
  const { text, keyboard } = await mgmtChecksView();
  assert.match(text, /Чек-листы за \d{4}-\d{2}-\d{2}/);
  assert.match(text, /Микрорайон/);
  assert.match(text, /Кейтеринг/);
  const actions = keyboard.flat().map((b) => b.callback_data);
  assert.ok(actions.includes("mgr|menu"));
});
