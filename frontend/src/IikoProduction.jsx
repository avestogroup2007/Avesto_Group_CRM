import React, { useState } from "react";
import { apiGet, apiPost } from "./api.js";

const INK = "#1B1512";
const SUB = "#5E5049";
const FAINT = "#8A7C72";
const BORDER = "#E7DFD4";
const LINE = "#F0EAE1";
const BRAND = "#7B2D1F";
const BAD = "#DC2626";
const OK = "#16A34A";

function today() {
  const d = new Date();
  const p = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// Вкладка «Акт приготовления» (тестовая): подтверждение, что программа умеет
// проводить акты в iiko. Понадобится для автодокументов конструктора.
function ActTab() {
  const [state, setState] = useState({ kind: "idle" }); // idle|loading|ok|error
  const [q, setQ] = useState("");

  // Форма акта.
  const [items, setItems] = useState([]); // [{id,name,num,amount}]
  const [store, setStore] = useState("");
  const [date, setDate] = useState(today());
  const [number, setNumber] = useState("");
  const [comment, setComment] = useState("");
  const [preview, setPreview] = useState(null); // {xml}
  const [result, setResult] = useState(null); // {ok,error,response,documentNumber}
  const [busy, setBusy] = useState(false);
  const [formErr, setFormErr] = useState("");

  const load = async () => {
    setState({ kind: "loading" });
    try {
      const data = await apiGet("/api/iiko/production/refs");
      setState({ kind: "ok", data });
    } catch (e) {
      setState({ kind: "error", msg: e.message || "Ошибка запроса к iiko" });
    }
  };

  const box = {
    border: `1px solid ${BORDER}`,
    borderRadius: 16,
    background: "#fff",
    padding: 18,
  };
  const th = {
    fontSize: 11,
    color: FAINT,
    fontWeight: 700,
    textAlign: "left",
    padding: "6px 8px",
    borderBottom: `1px solid ${BORDER}`,
    whiteSpace: "nowrap",
  };
  const td = {
    fontSize: 13,
    color: INK,
    padding: "6px 8px",
    borderBottom: `1px solid ${LINE}`,
  };
  const inp = {
    border: `1px solid ${BORDER}`,
    borderRadius: 10,
    padding: "8px 11px",
    fontSize: 13.5,
    width: "100%",
    background: "#fff",
    color: INK,
  };
  const lbl = {
    fontSize: 11.5,
    color: FAINT,
    fontWeight: 600,
    display: "block",
    marginBottom: 3,
  };

  const data = state.kind === "ok" ? state.data : null;
  const products = data ? data.products || [] : [];
  const stores = data ? data.stores || [] : [];
  const needle = q.trim().toLowerCase();
  const shownProducts = needle
    ? products.filter(
        (p) =>
          (p.name || "").toLowerCase().includes(needle) ||
          (p.num || "").toLowerCase().includes(needle) ||
          (p.code || "").toLowerCase().includes(needle),
      )
    : products;

  const inAct = (id) => items.some((x) => x.id === id);
  const addItem = (p) => {
    setResult(null);
    setPreview(null);
    if (inAct(p.id)) return;
    setItems((xs) => [
      ...xs,
      { id: p.id, name: p.name, num: p.num || "", amount: "1" },
    ]);
  };
  const removeItem = (id) => setItems((xs) => xs.filter((x) => x.id !== id));
  const setAmount = (id, v) =>
    setItems((xs) => xs.map((x) => (x.id === id ? { ...x, amount: v } : x)));

  const validate = () => {
    if (!store) return "Выберите склад";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "Укажите дату";
    if (!items.length) return "Добавьте хотя бы одно блюдо (кнопка «+ в акт»)";
    for (const it of items) {
      if (!(Number(String(it.amount).replace(",", ".")) > 0))
        return `Укажите количество для «${it.name}»`;
    }
    return "";
  };

  const body = (dryRun) => ({
    date,
    storeId: store,
    number: number.trim(),
    comment: comment.trim(),
    dryRun,
    items: items.map((it) => ({
      productId: it.id,
      amount: Number(String(it.amount).replace(",", ".")),
    })),
  });

  const doPreview = async () => {
    const err = validate();
    setFormErr(err);
    if (err) return;
    setBusy(true);
    setResult(null);
    try {
      const r = await apiPost("/api/iiko/production/act", body(true));
      setPreview(r);
    } catch (e) {
      setFormErr(e.message || "Не удалось построить предпросмотр");
    } finally {
      setBusy(false);
    }
  };

  const doSubmit = async () => {
    const err = validate();
    setFormErr(err);
    if (err) return;
    const storeName = (stores.find((s) => s.id === store) || {}).name || store;
    if (
      !window.confirm(
        `Провести акт приготовления в iiko?\nСклад: ${storeName}\nПозиций: ${items.length}\nДата: ${date}\n\nЭто спишет ингредиенты и оприходует готовые блюда в iiko.`,
      )
    )
      return;
    setBusy(true);
    setPreview(null);
    try {
      const r = await apiPost("/api/iiko/production/act", body(false));
      setResult(r);
      if (r && r.ok) setItems([]); // успех — очищаем позиции
    } catch (e) {
      setResult({ ok: false, error: e.message || "Ошибка проведения" });
    } finally {
      setBusy(false);
    }
  };

  const chip = {
    background: LINE,
    color: SUB,
    fontSize: 12.5,
    fontWeight: 700,
  };

  return (
    <div style={box}>
      <div className="flex items-center flex-wrap gap-2 justify-between">
        <div>
          <h3 className="font-bold" style={{ color: INK, fontSize: 15 }}>
            Акт приготовления · iiko
          </h3>
          <p
            style={{ fontSize: 12.5, color: SUB, marginTop: 2, maxWidth: 680 }}
          >
            Загрузите блюда и склады из iiko, отметьте блюда кнопкой «+ в акт»,
            укажите количество, склад и дату. «Предпросмотр» ничего не пишет;
            «Провести в iiko» — реальная запись (списывает ингредиенты по
            тех.карте и оприходует готовое блюдо).
          </p>
        </div>
        <button
          onClick={load}
          disabled={state.kind === "loading"}
          className="rounded-xl px-4 py-2 font-semibold"
          style={{
            background: BRAND,
            color: "#fff",
            fontSize: 13,
            opacity: state.kind === "loading" ? 0.6 : 1,
            whiteSpace: "nowrap",
          }}
        >
          {state.kind === "loading" ? "Загрузка…" : "Загрузить из iiko"}
        </button>
      </div>

      {state.kind === "error" && (
        <div
          className="mt-3 rounded-xl px-3 py-2"
          style={{ background: "#FEE2E2", color: BAD, fontSize: 12.5 }}
        >
          {state.msg}
        </div>
      )}

      {data && (
        <>
          <div className="flex flex-wrap gap-2 mt-3 mb-2">
            <span className="rounded-full px-3 py-1" style={chip}>
              Блюд/заготовок: {data.productCount ?? products.length}
            </span>
            <span className="rounded-full px-3 py-1" style={chip}>
              Складов: {data.storeCount ?? stores.length}
            </span>
          </div>

          {data.productsSample && (
            <details className="mt-2" style={{ fontSize: 12, color: FAINT }}>
              <summary>Блюда не распознаны — образец ответа iiko</summary>
              <pre style={{ whiteSpace: "pre-wrap", marginTop: 6 }}>
                {data.productsSample}
              </pre>
            </details>
          )}
          {data.storesSample && (
            <details className="mt-2" style={{ fontSize: 12, color: FAINT }}>
              <summary>Склады не распознаны — образец ответа iiko</summary>
              <pre style={{ whiteSpace: "pre-wrap", marginTop: 6 }}>
                {data.storesSample}
              </pre>
            </details>
          )}

          {/* ── Форма акта ── */}
          <div
            className="mt-4 rounded-2xl p-4"
            style={{ border: `1px solid ${BORDER}`, background: "#FCFAF7" }}
          >
            <h4 className="font-bold mb-3" style={{ color: INK, fontSize: 14 }}>
              Новый акт приготовления
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
              <div className="col-span-2">
                <label style={lbl}>Склад</label>
                <select
                  value={store}
                  onChange={(e) => setStore(e.target.value)}
                  style={inp}
                >
                  <option value="">— выберите склад —</option>
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={lbl}>Дата</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  style={inp}
                />
              </div>
              <div>
                <label style={lbl}>№ (необязательно)</label>
                <input
                  value={number}
                  onChange={(e) => setNumber(e.target.value)}
                  style={inp}
                  placeholder="авто"
                />
              </div>
              <div className="col-span-2 md:col-span-4">
                <label style={lbl}>Комментарий (необязательно)</label>
                <input
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  style={inp}
                  placeholder="напр. дневной выпуск цеха"
                />
              </div>
            </div>

            {/* Выбранные позиции */}
            {items.length === 0 ? (
              <p style={{ fontSize: 12.5, color: FAINT }}>
                Позиции не выбраны. Отметьте блюда в списке ниже кнопкой «+ в
                акт».
              </p>
            ) : (
              <table
                style={{ width: "100%", borderCollapse: "collapse" }}
                className="mb-2"
              >
                <thead>
                  <tr>
                    <th style={th}>Блюдо / заготовка</th>
                    <th style={{ ...th, width: 140 }}>Кол-во (порций)</th>
                    <th style={{ ...th, width: 40 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr key={it.id}>
                      <td style={td}>
                        {it.name}
                        {it.num ? (
                          <span style={{ color: FAINT }}> · {it.num}</span>
                        ) : null}
                      </td>
                      <td style={td}>
                        <input
                          value={it.amount}
                          onChange={(e) => setAmount(it.id, e.target.value)}
                          inputMode="decimal"
                          style={{ ...inp, padding: "5px 9px" }}
                        />
                      </td>
                      <td style={td}>
                        <button
                          onClick={() => removeItem(it.id)}
                          title="Убрать"
                          style={{ color: BAD, fontWeight: 700, padding: 4 }}
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {formErr && (
              <div style={{ color: BAD, fontSize: 12.5, marginTop: 6 }}>
                {formErr}
              </div>
            )}

            <div className="flex flex-wrap gap-2 mt-3">
              <button
                onClick={doPreview}
                disabled={busy}
                className="rounded-xl px-4 py-2 font-semibold"
                style={{
                  border: `1px solid ${BORDER}`,
                  color: SUB,
                  fontSize: 13,
                  background: "#fff",
                  opacity: busy ? 0.6 : 1,
                }}
              >
                Предпросмотр
              </button>
              <button
                onClick={doSubmit}
                disabled={busy}
                className="rounded-xl px-4 py-2 font-semibold"
                style={{
                  background: BRAND,
                  color: "#fff",
                  fontSize: 13,
                  opacity: busy ? 0.6 : 1,
                }}
              >
                {busy ? "…" : "Провести в iiko"}
              </button>
            </div>

            {/* Предпросмотр XML */}
            {preview && preview.xml && (
              <details className="mt-3" open style={{ fontSize: 12 }}>
                <summary style={{ color: SUB, fontWeight: 600 }}>
                  Предпросмотр — что уйдёт в iiko (ничего не записано)
                </summary>
                <pre
                  style={{
                    whiteSpace: "pre-wrap",
                    marginTop: 6,
                    color: FAINT,
                    background: "#fff",
                    border: `1px solid ${LINE}`,
                    borderRadius: 8,
                    padding: 10,
                  }}
                >
                  {preview.xml}
                </pre>
              </details>
            )}

            {/* Результат проведения */}
            {result && (
              <div
                className="mt-3 rounded-xl px-3 py-2"
                style={{
                  background: result.ok ? "#DCFCE7" : "#FEE2E2",
                  color: result.ok ? OK : BAD,
                  fontSize: 13,
                }}
              >
                {result.ok ? (
                  <b>
                    ✓ Акт проведён в iiko
                    {result.documentNumber
                      ? ` (№ ${result.documentNumber})`
                      : ""}
                  </b>
                ) : (
                  <>
                    <b>Не удалось провести.</b>
                    {result.error ? ` ${result.error}` : ""}
                  </>
                )}
                {result.response && (
                  <details className="mt-1" style={{ fontSize: 11.5 }}>
                    <summary>Ответ iiko</summary>
                    <pre style={{ whiteSpace: "pre-wrap", marginTop: 4 }}>
                      {result.response}
                    </pre>
                  </details>
                )}
              </div>
            )}
          </div>

          {/* ── Справочники: склады и блюда ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
            <div>
              <h4
                className="font-bold mb-2"
                style={{ color: INK, fontSize: 13.5 }}
              >
                Склады
              </h4>
              <div style={{ maxHeight: 320, overflow: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={th}>Название</th>
                      <th style={th}>Код</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stores.map((s) => (
                      <tr key={s.id}>
                        <td style={td}>{s.name}</td>
                        <td style={{ ...td, color: FAINT }}>{s.code || "—"}</td>
                      </tr>
                    ))}
                    {!stores.length && (
                      <tr>
                        <td style={td} colSpan={2}>
                          Складов не получено.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2 gap-2">
                <h4
                  className="font-bold"
                  style={{ color: INK, fontSize: 13.5 }}
                >
                  Блюда и заготовки
                </h4>
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="поиск…"
                  style={{
                    border: `1px solid ${BORDER}`,
                    borderRadius: 10,
                    padding: "5px 10px",
                    fontSize: 12.5,
                    width: 150,
                  }}
                />
              </div>
              <div style={{ maxHeight: 320, overflow: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={th}>Название</th>
                      <th style={th}>Артикул</th>
                      <th style={{ ...th, width: 78 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {shownProducts.slice(0, 300).map((p) => (
                      <tr key={p.id}>
                        <td style={td}>
                          {p.name}
                          <span style={{ color: FAINT }}>
                            {p.type === "PREPARED" ? " · заготовка" : ""}
                          </span>
                        </td>
                        <td style={{ ...td, color: FAINT }}>{p.num || "—"}</td>
                        <td style={td}>
                          <button
                            onClick={() => addItem(p)}
                            disabled={inAct(p.id)}
                            style={{
                              fontSize: 12,
                              fontWeight: 700,
                              color: inAct(p.id) ? FAINT : BRAND,
                              whiteSpace: "nowrap",
                            }}
                          >
                            {inAct(p.id) ? "✓ в акте" : "+ в акт"}
                          </button>
                        </td>
                      </tr>
                    ))}
                    {!shownProducts.length && (
                      <tr>
                        <td style={td} colSpan={3}>
                          Блюд не получено.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {shownProducts.length > 300 && (
                <p style={{ fontSize: 11.5, color: FAINT, marginTop: 6 }}>
                  Показаны первые 300 из {shownProducts.length}. Уточните поиск.
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Отчёт производства ──────────────────────────────────────────────────────
// Что и сколько произведено за период (по проведённым актам приготовления в
// iiko), с разбивкой по отделам — папкам номенклатуры iiko.
function ReportTab() {
  const shift = (days) => {
    const d = new Date(Date.now() - days * 86400000);
    const p = (x) => String(x).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  };
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [dept, setDept] = useState("all");
  const [st, setSt] = useState({ kind: "idle" }); // idle|loading|ok|error

  const run = async (f = from, t = to) => {
    setSt({ kind: "loading" });
    try {
      const data = await apiPost("/api/iiko/production/report", {
        from: f,
        to: t,
      });
      setSt({ kind: "ok", data });
      setDept("all");
    } catch (e) {
      setSt({ kind: "error", msg: e.message || "Ошибка запроса к iiko" });
    }
  };
  const preset = (f, t) => {
    setFrom(f);
    setTo(t);
    run(f, t);
  };

  const box = {
    border: `1px solid ${BORDER}`,
    borderRadius: 16,
    background: "#fff",
    padding: 18,
  };
  const th = {
    fontSize: 11,
    color: FAINT,
    fontWeight: 700,
    textAlign: "left",
    padding: "6px 8px",
    borderBottom: `1px solid ${BORDER}`,
    whiteSpace: "nowrap",
  };
  const td = {
    fontSize: 13,
    color: INK,
    padding: "6px 8px",
    borderBottom: `1px solid ${LINE}`,
  };
  const inp = {
    border: `1px solid ${BORDER}`,
    borderRadius: 10,
    padding: "8px 11px",
    fontSize: 13.5,
    background: "#fff",
    color: INK,
  };
  const presetBtn = (label, f, t) => (
    <button
      key={label}
      onClick={() => preset(f, t)}
      className="rounded-xl px-3 py-2 font-bold"
      style={{
        border: `1px solid ${BORDER}`,
        background: "#fff",
        color: SUB,
        fontSize: 13,
      }}
    >
      {label}
    </button>
  );

  const data = st.kind === "ok" ? st.data : null;
  const allItems = data ? data.items || [] : [];
  const depts = data ? data.depts || [] : [];
  const items =
    dept === "all"
      ? allItems
      : allItems.filter((it) => String(it.deptId || "-") === dept);
  const totalAmount = items.reduce((a, x) => a + (x.amount || 0), 0);
  const fmtQty = (n) =>
    Number(n || 0).toLocaleString("ru-RU", { maximumFractionDigits: 3 });

  return (
    <div className="space-y-4">
      <div style={box}>
        <h3 className="font-bold mb-1" style={{ color: INK, fontSize: 16 }}>
          Отчёт производства
        </h3>
        <p style={{ fontSize: 13, color: SUB, marginBottom: 12 }}>
          Что и сколько произведено за период — по проведённым актам
          приготовления в iiko. Отдел — это папка товара в номенклатуре iiko.
        </p>
        <div className="flex flex-wrap items-end gap-2 mb-3">
          {presetBtn("Сегодня", today(), today())}
          {presetBtn("Вчера", shift(1), shift(1))}
          {presetBtn("7 дней", shift(6), today())}
          {presetBtn("30 дней", shift(29), today())}
          <div>
            <span
              style={{
                fontSize: 11.5,
                color: FAINT,
                fontWeight: 600,
                display: "block",
                marginBottom: 3,
              }}
            >
              С даты
            </span>
            <input
              type="date"
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
              style={inp}
            />
          </div>
          <div>
            <span
              style={{
                fontSize: 11.5,
                color: FAINT,
                fontWeight: 600,
                display: "block",
                marginBottom: 3,
              }}
            >
              По дату
            </span>
            <input
              type="date"
              value={to}
              min={from}
              onChange={(e) => setTo(e.target.value)}
              style={inp}
            />
          </div>
          <button
            onClick={() => run()}
            disabled={st.kind === "loading"}
            className="rounded-xl px-4 py-2 font-bold text-white"
            style={{
              background: BRAND,
              fontSize: 13.5,
              opacity: st.kind === "loading" ? 0.6 : 1,
            }}
          >
            {st.kind === "loading" ? "Загрузка…" : "Сформировать"}
          </button>
        </div>

        {st.kind === "error" && (
          <p style={{ color: BAD, fontSize: 13 }}>{st.msg}</p>
        )}

        {data && (
          <>
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span style={{ fontSize: 13, color: SUB }}>
                Актов за период: <b>{data.docCount}</b> · позиций:{" "}
                <b>{items.length}</b> · количество:{" "}
                <b>{fmtQty(totalAmount)}</b>
              </span>
              <select
                value={dept}
                onChange={(e) => setDept(e.target.value)}
                style={{ ...inp, minWidth: 200 }}
              >
                <option value="all">Все отделы</option>
                {depts.map((d) => (
                  <option key={d.id || "-"} value={String(d.id || "-")}>
                    {d.name} ({fmtQty(d.amount)})
                  </option>
                ))}
              </select>
            </div>
            {data.sample && (
              <details style={{ marginBottom: 10 }}>
                <summary style={{ fontSize: 12.5, color: SUB }}>
                  Актов не найдено — образец ответа iiko (для отладки)
                </summary>
                <pre
                  style={{
                    fontSize: 11,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    background: "#FBFAF7",
                    padding: 10,
                    borderRadius: 10,
                  }}
                >
                  {data.sample}
                </pre>
              </details>
            )}
            {items.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th style={th}>Товар</th>
                      <th style={th}>Отдел</th>
                      <th style={th}>Папка</th>
                      <th style={{ ...th, textAlign: "right" }}>Кол-во</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it) => (
                      <tr key={it.productId}>
                        <td style={{ ...td, fontWeight: 600 }}>{it.name}</td>
                        <td style={{ ...td, color: SUB }}>{it.deptName}</td>
                        <td style={{ ...td, color: SUB }}>
                          {it.groupName || "—"}
                        </td>
                        <td
                          style={{
                            ...td,
                            textAlign: "right",
                            fontWeight: 700,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {fmtQty(it.amount)}
                          {it.unit ? ` ${it.unit}` : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p style={{ fontSize: 13, color: SUB }}>
                За выбранный период проведённых актов приготовления не найдено.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// Раздел «Производство»: главный экран — отчёт производства; создание акта
// вынесено во вторую (тестовую) вкладку.
export default function IikoProduction() {
  const [tab, setTab] = useState("report"); // report | act
  const tabBtn = (key, label) => (
    <button
      onClick={() => setTab(key)}
      className="rounded-xl px-4 py-2 font-bold"
      style={{
        border: `1px solid ${tab === key ? BRAND : BORDER}`,
        background: tab === key ? BRAND : "#fff",
        color: tab === key ? "#fff" : SUB,
        fontSize: 13.5,
      }}
    >
      {label}
    </button>
  );
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {tabBtn("report", "Отчёт производства")}
        {tabBtn("act", "Акт приготовления (тест)")}
      </div>
      {tab === "report" ? <ReportTab /> : <ActTab />}
    </div>
  );
}
