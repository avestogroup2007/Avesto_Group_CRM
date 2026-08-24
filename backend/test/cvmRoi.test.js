// Эффективность CVM-кампании. Главное, что проверяем: без контрольной группы
// система НЕ выдаёт число за эффект кампании — прирост у получателей сам по
// себе её заслугой не является.
import test from "node:test";
import assert from "node:assert/strict";

import { campaignRoi } from "../src/services/cvm.js";

const member = (id, orders, spent, control = false) => ({
  customerId: id,
  control,
  ordersAtSend: orders,
  spentAtSend: BigInt(spent),
});
const now = (id, orders, spent) => [
  id,
  { id, orders, totalSpent: BigInt(spent) },
];

test("с контролем: эффектом считается разница приростов", () => {
  const members = [
    member("a", 2, 200_000),
    member("b", 1, 100_000),
    member("c", 3, 300_000, true),
    member("d", 1, 100_000, true),
  ];
  const customersById = new Map([
    now("a", 4, 400_000), // +2 заказа, +200 000
    now("b", 2, 160_000), // +1 заказ,  +60 000
    now("c", 4, 340_000), // контроль: +40 000
    now("d", 1, 100_000), // контроль: 0
  ]);
  const r = campaignRoi({
    campaign: { cost: 100_000n },
    members,
    customersById,
  });
  assert.equal(r.target.size, 2);
  assert.equal(r.grossRevenue, 260_000);
  assert.equal(r.target.revenuePerCustomer, 130_000);
  assert.equal(r.control.revenuePerCustomer, 20_000);
  // Эффект на клиента: 130 000 − 20 000 = 110 000; на аудиторию — 220 000.
  assert.equal(r.upliftPerCustomer, 110_000);
  assert.equal(r.attributedRevenue, 220_000);
  // ROI = (220 000 − 100 000) / 100 000 = 120 %.
  assert.equal(r.roiPct, 120);
});

test("без контроля эффект не выдумывается", () => {
  const r = campaignRoi({
    campaign: { cost: 50_000n },
    members: [member("a", 1, 100_000)],
    customersById: new Map([now("a", 3, 500_000)]),
  });
  assert.equal(r.control, null);
  assert.equal(r.upliftPerCustomer, null);
  assert.equal(r.attributedRevenue, null);
  assert.equal(r.roiPct, null);
  // Прирост показываем, но отдельным полем — это не эффект кампании.
  assert.equal(r.grossRevenue, 400_000);
});

test("без затрат ROI не определён, а не ноль", () => {
  const r = campaignRoi({
    campaign: { cost: 0n },
    members: [member("a", 1, 100_000), member("b", 1, 100_000, true)],
    customersById: new Map([now("a", 2, 300_000), now("b", 1, 100_000)]),
  });
  assert.equal(r.attributedRevenue, 200_000);
  assert.equal(r.roiPct, null);
});

test("перезалитые данные не дают отрицательного прироста", () => {
  const r = campaignRoi({
    campaign: { cost: 0n },
    // Снимок больше текущего значения — импорт перетёр историю клиента.
    members: [member("a", 5, 900_000)],
    customersById: new Map([now("a", 1, 100_000)]),
  });
  assert.equal(r.target.revenue, 0);
  assert.equal(r.target.orders, 0);
  assert.equal(r.target.responsePct, 0);
});

test("отклик — доля купивших после запуска", () => {
  const r = campaignRoi({
    campaign: { cost: 0n },
    members: [member("a", 0, 0), member("b", 0, 0), member("c", 0, 0)],
    customersById: new Map([
      now("a", 1, 50_000),
      now("b", 0, 0),
      now("c", 2, 90_000),
    ]),
  });
  assert.equal(r.target.buyers, 2);
  assert.equal(r.target.responsePct, 66.7);
});
