// Сверка отчёта по кассе с данными iiko.
//
// Зачем: сейчас управляющий вручную вбивает и выручку по типам оплат, и
// «Сумму по iiko», с которой его же и сверяют — проверка получается формальной.
// Здесь суммы приходят прямо с кассы, поэтому расхождение видно объективно.
//
// Что сверяем:
//  1) по каждому типу оплаты: пробито в iiko ↔ сдал управляющий ↔ разница;
//  2) кассовые смены: расхождение денежного ящика (cashDiff), изъятия (payOut),
//     незакрытые смены и кто смену открывал.
import { salesByPayType, cashShifts } from "./iikoServer.js";
import { refreshOrgConfig, orgBranches } from "./orgConfig.js";

// Карта «тип оплаты в iiko → поле отчёта по кассе».
//
// Названия типов задаются в iikoOffice и у каждой сети свои, поэтому карта
// лежит отдельно и правится без изменения логики. Значения ниже сняты с
// реального сервера Avesto (октябрь 2026).
//
// ВНИМАНИЕ про наличные: в iiko их два типа — «Наличные» и «Наличные -».
// По решению владельца это фискальные и нефискальные. Какой именно из них
// фискальный, в iiko по названию не определить, поэтому принято допущение:
// «Наличные» → фискальная выручка, «Наличные -» → нефискальная. Если на деле
// наоборот — поменять местами здесь, в одной строке, больше нигде не нужно.
export const PAY_TYPE_MAP = {
  Наличные: "fiscal",
  "Наличные -": "nonFiscal",
  "Humo Card": "humo",
  Uzcard: "uzcard",
  Click: "click",
  Payme: "payme",
  "Uzum tezkor": "uzumTezkor",
  "Yandex Еда": "yandex",
  "QR оплата": "qr",
  "Перевод на карту": "cardTransfer",
  "Перечисление денег": "transfer",
  "Долговой гостей": "debt",
  "(без оплаты)": "noPay",
};

// Человеческие подписи полей отчёта — для таблицы сверки на экране.
export const FIELD_LABELS = {
  fiscal: "Фискальная выручка",
  nonFiscal: "Нефискальная сумма",
  humo: "Humo Card",
  uzcard: "Uzcard",
  click: "Click",
  payme: "Payme",
  uzumTezkor: "Uzum Tezkor",
  yandex: "Yandex Еда",
  qr: "QR оплата",
  cardTransfer: "Перевод на карту",
  transfer: "Перечисление",
  debt: "Долг",
  noPay: "Без оплат",
};

// Поля отчёта, которые сопоставимы с типами оплат iiko. «debt» и «noPay» в
// CashReport хранятся отдельно (долг/без оплат) и в выручку не входят.
const COMPARABLE = [
  "fiscal",
  "nonFiscal",
  "humo",
  "uzcard",
  "click",
  "payme",
  "uzumTezkor",
  "yandex",
  "qr",
  "cardTransfer",
  "transfer",
];

const num = (v) => Number(v || 0);

// Сверка за один день по одному филиалу.
// report — строка CashReport (может отсутствовать: отчёт ещё не сдан).
export async function reconcileDay({ date, branchId, report }) {
  await refreshOrgConfig().catch(() => {});
  const branch = orgBranches().find((b) => String(b.id) === String(branchId));
  if (!branch) {
    const e = new Error("Филиал не найден");
    e.statusCode = 400;
    throw e;
  }
  if (!branch.iikoDept) {
    const e = new Error(
      `Филиал «${branch.name}» не сопоставлен с подразделением iiko`
    );
    e.statusCode = 400;
    throw e;
  }

  const [sales, shifts] = await Promise.all([
    salesByPayType({ from: date, to: date, departments: [branch.iikoDept] }),
    cashShifts({ from: date, to: date }),
  ]);

  // Суммы iiko по полям отчёта + типы, которых нет в карте (их нельзя молча
  // потерять: иначе итог не сойдётся, а причина будет невидимой).
  const iikoByField = {};
  const unmapped = [];
  for (const row of sales) {
    const field = PAY_TYPE_MAP[row.payType];
    if (!field) {
      unmapped.push({ payType: row.payType, sum: row.sum });
      continue;
    }
    iikoByField[field] = (iikoByField[field] || 0) + row.sum;
  }

  const lines = COMPARABLE.map((field) => {
    const iiko = iikoByField[field] || 0;
    const reported = report ? num(report[field]) : 0;
    return {
      field,
      label: FIELD_LABELS[field] || field,
      iiko,
      reported,
      diff: reported - iiko,
    };
  }).filter((l) => l.iiko !== 0 || l.reported !== 0);

  const totalIiko = lines.reduce((a, l) => a + l.iiko, 0);
  const totalReported = lines.reduce((a, l) => a + l.reported, 0);

  // Смены за день по этому филиалу. iiko отдаёт pointOfSaleId, а не название
  // подразделения, поэтому привязать смену к филиалу по ответу нельзя —
  // отдаём все смены дня и помечаем это в ответе, чтобы интерфейс не выдавал
  // чужие кассы за свои.
  // ВАЖНО про «расхождение ящика» (cashDiff). Показывать его как недостачу
  // можно, только если в iiko регистрируют изъятия денег из кассы. Если по
  // всем сменам payOut = 0 и cashRemain = 0, значит инкассацию в iiko не
  // проводят: тогда cashDiff показывает лишь «наличные ушли из ящика мимо
  // учёта» и к недостаче отношения не имеет. Отдаём флаг, чтобы интерфейс не
  // пугал директора цифрой, которая ничего не доказывает.
  const cashTrackingConfigured = shifts.some(
    (s) => s.payOut !== 0 || s.cashRemain !== 0
  );
  const shiftSummary = {
    count: shifts.length,
    open: shifts.filter((s) => !s.closeDate).length,
    notAccepted: shifts.filter((s) => s.closeDate && !s.acceptDate).length,
    cashDiffTotal: shifts.reduce((a, s) => a + s.cashDiff, 0),
    payOutTotal: shifts.reduce((a, s) => a + s.payOut, 0),
    withCashDiff: shifts.filter((s) => s.cashDiff !== 0).length,
    cashTrackingConfigured,
    byPointOfSale: true, // смены не привязаны к филиалу — см. комментарий выше
    items: shifts,
  };

  return {
    date,
    branchId: String(branchId),
    branchName: branch.name,
    department: branch.iikoDept,
    hasReport: Boolean(report),
    lines,
    unmapped,
    totals: {
      iiko: totalIiko,
      reported: totalReported,
      diff: totalReported - totalIiko,
    },
    shifts: shiftSummary,
  };
}
