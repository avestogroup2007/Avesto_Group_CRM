// Сверка кассового отчёта с iiko за день.
//
// Зачем: управляющий сам вбивает и выручку по типам оплат, и «Сумму по iiko»,
// с которой его же и сверяют — проверка получается формальной. Здесь суммы
// приходят прямо с кассы (GET /api/cash/reconcile), поэтому расхождение видно
// объективно, а подделать его управляющий не может.
import { useEffect, useState } from "react";
import { Scale, AlertTriangle } from "lucide-react";
import { C } from "../lib/theme.js";
import { tr } from "../lib/i18n.js";
import { apiGet } from "../api.js";
import { NiceDate, EmptyState, Spinner } from "./ui.jsx";

const money = (n) => Number(n || 0).toLocaleString("ru-RU");

export default function CashReconcile({ date, branchId, branchName }) {
  const [day, setDay] = useState(date);
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => setDay(date), [date]);

  useEffect(() => {
    if (!branchId || !day) {
      setData(null);
      return;
    }
    setLoading(true);
    setErr("");
    apiGet("/api/cash/reconcile?date=" + day + "&branch=" + branchId)
      .then(setData)
      .catch((e) => setErr(e.message || "Не удалось получить данные из iiko"))
      .finally(() => setLoading(false));
  }, [day, branchId]);

  const card = { background: C.surface, border: "1px solid " + C.border };

  return (
    <div className="rounded-2xl p-4 sm:p-5" style={card}>
      <div className="mb-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Scale size={17} color={C.brandA} className="shrink-0" />
            <h3 className="font-bold" style={{ color: C.ink, fontSize: 16 }}>
              {tr("Сверка с iiko")}
            </h3>
          </div>
          <NiceDate
            ariaLabel={tr("Дата сверки")}
            label=""
            value={day}
            onChange={setDay}
            width={150}
          />
        </div>
        <p
          className="mt-1"
          style={{ fontSize: 12.5, color: C.faint, lineHeight: 1.5 }}
        >
          {tr(
            "Слева — что пробито на кассе по данным iiko, справа — что сдал управляющий. Суммы iiko берутся с кассы и правке не подлежат."
          )}
        </p>
      </div>

      {!branchId ? (
        <EmptyState
          icon={Scale}
          title={tr("Выберите филиал")}
          hint={tr("Сверка считается по одному филиалу за один день.")}
        />
      ) : loading ? (
        <Spinner label={tr("Запрашиваем данные из iiko…")} />
      ) : err ? (
        <div style={{ color: C.bad, fontSize: 13 }}>{err}</div>
      ) : !data ? null : (
        <>
          {!data.hasReport && (
            <div
              className="rounded-xl px-3 py-2 mb-3"
              style={{
                background: "#FFF7E8",
                border: "1px solid #F1DFC0",
                color: "#8A6A2F",
                fontSize: 12.5,
              }}
            >
              {tr("Отчёт за этот день не сдан — в колонке «Сдал» нули.")}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full" style={{ fontSize: 12.5 }}>
              <thead>
                <tr style={{ color: C.faint, textAlign: "right" }}>
                  <th
                    className="pb-2 pr-2 font-semibold"
                    style={{ textAlign: "left" }}
                  >
                    {tr("Тип оплаты")}
                  </th>
                  <th className="pb-2 pr-2 font-semibold">
                    {tr("Пробито в iiko")}
                  </th>
                  <th className="pb-2 pr-2 font-semibold">{tr("Сдал")}</th>
                  <th className="pb-2 font-semibold">{tr("Разница")}</th>
                </tr>
              </thead>
              <tbody>
                {data.lines.map((l) => (
                  <tr
                    key={l.field}
                    style={{ borderTop: "1px solid " + C.line }}
                  >
                    <td
                      className="py-1.5 pr-2"
                      style={{ color: C.ink, fontWeight: 600 }}
                    >
                      {l.label}
                    </td>
                    <td
                      className="py-1.5 pr-2 text-right"
                      style={{ color: C.sub }}
                    >
                      {money(l.iiko)}
                    </td>
                    <td
                      className="py-1.5 pr-2 text-right"
                      style={{ color: C.sub }}
                    >
                      {money(l.reported)}
                    </td>
                    <td
                      className="py-1.5 text-right"
                      style={{
                        color: l.diff === 0 ? C.ok : C.bad,
                        fontWeight: 700,
                      }}
                    >
                      {l.diff === 0 ? "✓" : money(l.diff)}
                    </td>
                  </tr>
                ))}
                <tr style={{ borderTop: "2px solid " + C.border }}>
                  <td
                    className="py-2 pr-2"
                    style={{ color: C.ink, fontWeight: 800 }}
                  >
                    {tr("ИТОГО")}
                  </td>
                  <td
                    className="py-2 pr-2 text-right"
                    style={{ color: C.ink, fontWeight: 800 }}
                  >
                    {money(data.totals.iiko)}
                  </td>
                  <td
                    className="py-2 pr-2 text-right"
                    style={{ color: C.ink, fontWeight: 800 }}
                  >
                    {money(data.totals.reported)}
                  </td>
                  <td
                    className="py-2 text-right"
                    style={{
                      color: data.totals.diff === 0 ? C.ok : C.bad,
                      fontWeight: 800,
                    }}
                  >
                    {data.totals.diff === 0 ? "✓" : money(data.totals.diff)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Типы оплат, которых нет в карте соответствий. Молча терять их
              нельзя: итог не сойдётся, а причина будет невидимой. */}
          {data.unmapped?.length > 0 && (
            <div
              className="rounded-xl px-3 py-2 mt-3"
              style={{
                background: "#FEF2F2",
                border: "1px solid #FCA5A5",
                color: "#991B1B",
                fontSize: 12.5,
              }}
            >
              <b>{tr("Не сопоставлены типы оплат iiko")}:</b>{" "}
              {data.unmapped
                .map((u) => `${u.payType} (${money(u.sum)})`)
                .join(", ")}
              . {tr("Добавьте их в карту соответствий, иначе итог не сойдётся.")}
            </div>
          )}

          {/* Кассовые смены: кто открыл, изъятия, незакрытые смены. */}
          <div
            className="font-bold mt-4 mb-2"
            style={{ color: C.sub, fontSize: 13 }}
          >
            {tr("Кассовые смены за день")}
          </div>
          <div
            className="grid gap-3"
            style={{
              gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
            }}
          >
            {[
              [tr("Смен"), String(data.shifts.count), C.brandA],
              [
                tr("Не закрыто"),
                String(data.shifts.open),
                data.shifts.open ? C.bad : C.ok,
              ],
              [
                tr("Не принято"),
                String(data.shifts.notAccepted),
                data.shifts.notAccepted ? C.warn : C.ok,
              ],
              [tr("Изъятия"), money(data.shifts.payOutTotal), C.gold],
            ].map(([label, value, tone]) => (
              <div key={label} className="rounded-xl p-3" style={card}>
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="shrink-0"
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 99,
                      background: tone,
                    }}
                  />
                  <span
                    className="min-w-0 truncate"
                    style={{ fontSize: 12, color: C.faint, fontWeight: 600 }}
                  >
                    {label}
                  </span>
                </div>
                <div
                  className="font-extrabold mt-0.5 tnum"
                  style={{ fontSize: 18, color: C.ink }}
                >
                  {value}
                </div>
              </div>
            ))}
          </div>

          {/* Расхождение денежного ящика показываем только если в iiko ведут
              изъятия. Если payOut и остаток везде нули, инкассацию в iiko не
              проводят, и cashDiff показывает не недостачу, а «наличные ушли
              мимо учёта» — пугать этой цифрой директора нельзя. */}
          {data.shifts.cashTrackingConfigured ? (
            data.shifts.withCashDiff > 0 && (
              <div
                className="rounded-xl px-3 py-2 mt-3 flex items-start gap-2"
                style={{
                  background: "#FEF2F2",
                  border: "1px solid #FCA5A5",
                  color: "#991B1B",
                  fontSize: 12.5,
                }}
              >
                <AlertTriangle size={15} className="shrink-0 mt-0.5" />
                <span>
                  {tr("Расхождение по денежному ящику")}:{" "}
                  <b>{money(data.shifts.cashDiffTotal)}</b> {tr("сум")} (
                  {data.shifts.withCashDiff} {tr("смен")}).
                </span>
              </div>
            )
          ) : (
            <p className="mt-3" style={{ fontSize: 12.5, color: C.faint }}>
              {tr(
                "Расхождение по денежному ящику не показано: в iiko не регистрируют изъятия (инкассацию), поэтому эта цифра ничего не доказывает. Сверяйте наличные с передачами из сейфа выше."
              )}
            </p>
          )}

          {/* Смены iiko привязаны к кассе (pointOfSaleId), а не к филиалу,
              поэтому показываем смены всей сети за день и честно это
              оговариваем, а не выдаём чужие кассы за свои. */}
          {data.shifts.byPointOfSale && (
            <p className="mt-2" style={{ fontSize: 11.5, color: C.faint }}>
              {tr(
                "Смены показаны по всей сети за этот день: iiko привязывает смену к кассе, а не к филиалу."
              )}
            </p>
          )}
        </>
      )}
    </div>
  );
}
