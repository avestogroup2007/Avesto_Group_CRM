import React, { useState, useMemo } from "react";
import { apiGet } from "./api.js";
import { Cake, Plus, Minus, Trash2, Search, RefreshCw } from "lucide-react";

const INK = "#1B1512";
const SUB = "#5E5049";
const FAINT = "#8A7C72";
const BORDER = "#E7DFD4";
const LINE = "#F0EAE1";
const BRAND = "#7B2D1F";
const OK = "#16A34A";
const BG = "#FCFAF7";

const CATS = [
  { key: "bases", label: "Основа", one: "основу", single: true },
  { key: "coatings", label: "Крем / покрытие", one: "покрытие", single: true },
  { key: "decors", label: "Украшения", one: "украшение", single: false },
];

const money = (v) => Number(v || 0).toLocaleString("ru-RU");

// Конструктор заказных тортов (Этап 1).
// «Стандарты» — каталог основ/покрытий/украшений, привязанных к позициям iiko
// (для точной себестоимости и будущего акта приготовления). «Конструктор» —
// быстрый сбор торта из стандартов с мгновенным расчётом себестоимости.
export default function CakeConstructor({ s, dispatch, notify }) {
  const cfg = s.cakeConfig || { bases: [], coatings: [], decors: [] };
  const [tab, setTab] = useState("build"); // build | standards

  // выбор в конструкторе
  const [baseId, setBaseId] = useState("");
  const [coatingId, setCoatingId] = useState("");
  const [decorQty, setDecorQty] = useState({}); // {stdId: qty}
  const [batch, setBatch] = useState(1);

  const base = cfg.bases.find((x) => x.id === baseId) || null;
  const coating = cfg.coatings.find((x) => x.id === coatingId) || null;
  const chosenDecors = cfg.decors
    .map((d) => ({ ...d, qty: decorQty[d.id] || 0 }))
    .filter((d) => d.qty > 0);

  const unit = useMemo(() => {
    const b = Number(base?.cost || 0);
    const c = Number(coating?.cost || 0);
    const dec = chosenDecors.reduce(
      (a, d) => a + Number(d.cost || 0) * d.qty,
      0,
    );
    return b + c + dec;
  }, [base, coating, chosenDecors]);
  const total = unit * Math.max(1, Number(batch) || 1);

  const bump = (id, delta) =>
    setDecorQty((q) => {
      const v = Math.max(0, (q[id] || 0) + delta);
      return { ...q, [id]: v };
    });
  const reset = () => {
    setBaseId("");
    setCoatingId("");
    setDecorQty({});
    setBatch(1);
  };

  const box = {
    border: `1px solid ${BORDER}`,
    borderRadius: 16,
    background: "#fff",
    padding: 18,
  };

  const catList = (key) =>
    key === "bases"
      ? cfg.bases
      : key === "coatings"
        ? cfg.coatings
        : cfg.decors;

  // Карточка выбора в конструкторе.
  const Card = ({ item, selected, onClick, right }) => (
    <button
      onClick={onClick}
      className="text-left rounded-xl p-2.5"
      style={{
        border: `1.5px solid ${selected ? BRAND : LINE}`,
        background: selected ? "#FDF6F2" : "#fff",
        minWidth: 0,
      }}
    >
      <div
        className="font-semibold truncate"
        style={{ color: INK, fontSize: 13.5 }}
      >
        {item.name}
      </div>
      <div className="flex items-center justify-between mt-1">
        <span style={{ color: FAINT, fontSize: 11.5 }}>
          {money(item.cost)} сум
        </span>
        {right}
      </div>
    </button>
  );

  return (
    <div style={box}>
      <div className="flex items-center gap-2 mb-1">
        <Cake size={18} style={{ color: BRAND }} />
        <h3 className="font-bold" style={{ color: INK, fontSize: 16 }}>
          Конструктор тортов
        </h3>
      </div>
      <p
        style={{ color: SUB, fontSize: 12.5, marginBottom: 12, maxWidth: 720 }}
      >
        Соберите заказной торт из готовых стандартов — основа, крем/покрытие и
        украшения. Себестоимость считается сразу. Стандарты привязаны к позициям
        iiko (вкладка «Стандарты»).
      </p>

      {/* Вкладки */}
      <div className="flex gap-1.5 mb-4">
        {[
          ["build", "Конструктор"],
          ["standards", "Стандарты"],
        ].map(([k, l]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className="rounded-xl px-3.5 py-2 font-semibold"
            style={{
              background: tab === k ? BRAND : "transparent",
              color: tab === k ? "#fff" : INK,
              fontSize: 13.5,
              border: `1px solid ${tab === k ? BRAND : BORDER}`,
            }}
          >
            {l}
          </button>
        ))}
      </div>

      {tab === "build" && (
        <BuildTab
          cfg={cfg}
          base={base}
          baseId={baseId}
          setBaseId={setBaseId}
          coatingId={coatingId}
          setCoatingId={setCoatingId}
          decorQty={decorQty}
          bump={bump}
          chosenDecors={chosenDecors}
          coating={coating}
          batch={batch}
          setBatch={setBatch}
          unit={unit}
          total={total}
          reset={reset}
          Card={Card}
          notify={notify}
        />
      )}

      {tab === "standards" && (
        <StandardsTab
          cfg={cfg}
          catList={catList}
          dispatch={dispatch}
          notify={notify}
        />
      )}
    </div>
  );
}

function EmptyHint({ text }) {
  return (
    <div
      className="rounded-xl p-3"
      style={{
        background: BG,
        border: `1px dashed ${BORDER}`,
        color: FAINT,
        fontSize: 12.5,
      }}
    >
      {text}
    </div>
  );
}

function BuildTab(props) {
  const {
    cfg,
    base,
    baseId,
    setBaseId,
    coatingId,
    setCoatingId,
    decorQty,
    bump,
    chosenDecors,
    coating,
    batch,
    setBatch,
    unit,
    total,
    reset,
    Card,
  } = props;

  const grid = "grid grid-cols-2 sm:grid-cols-3 gap-2";
  const noStandards =
    !cfg.bases.length && !cfg.coatings.length && !cfg.decors.length;

  if (noStandards)
    return (
      <EmptyHint text="Стандартов пока нет. Откройте вкладку «Стандарты», загрузите позиции из iiko и добавьте основы, покрытия и украшения — они появятся здесь для быстрого выбора." />
    );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 space-y-4">
        {/* Основа */}
        <div>
          <h4 className="font-bold mb-2" style={{ color: INK, fontSize: 13.5 }}>
            1. Основа
          </h4>
          {cfg.bases.length ? (
            <div className={grid}>
              {cfg.bases.map((b) => (
                <Card
                  key={b.id}
                  item={b}
                  selected={baseId === b.id}
                  onClick={() => setBaseId(baseId === b.id ? "" : b.id)}
                />
              ))}
            </div>
          ) : (
            <EmptyHint text="Нет основ — добавьте во вкладке «Стандарты»." />
          )}
        </div>

        {/* Покрытие */}
        <div>
          <h4 className="font-bold mb-2" style={{ color: INK, fontSize: 13.5 }}>
            2. Крем / покрытие
          </h4>
          {cfg.coatings.length ? (
            <div className={grid}>
              {cfg.coatings.map((c) => (
                <Card
                  key={c.id}
                  item={c}
                  selected={coatingId === c.id}
                  onClick={() => setCoatingId(coatingId === c.id ? "" : c.id)}
                />
              ))}
            </div>
          ) : (
            <EmptyHint text="Нет покрытий — добавьте во вкладке «Стандарты»." />
          )}
        </div>

        {/* Украшения */}
        <div>
          <h4 className="font-bold mb-2" style={{ color: INK, fontSize: 13.5 }}>
            3. Украшения
          </h4>
          {cfg.decors.length ? (
            <div className={grid}>
              {cfg.decors.map((d) => {
                const qty = decorQty[d.id] || 0;
                return (
                  <div
                    key={d.id}
                    className="rounded-xl p-2.5"
                    style={{
                      border: `1.5px solid ${qty > 0 ? BRAND : LINE}`,
                      background: qty > 0 ? "#FDF6F2" : "#fff",
                    }}
                  >
                    <div
                      className="font-semibold truncate"
                      style={{ color: INK, fontSize: 13.5 }}
                    >
                      {d.name}
                    </div>
                    <div className="flex items-center justify-between mt-1.5">
                      <span style={{ color: FAINT, fontSize: 11.5 }}>
                        {money(d.cost)} сум
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => bump(d.id, -1)}
                          className="rounded-md"
                          style={{ border: `1px solid ${BORDER}`, padding: 3 }}
                        >
                          <Minus size={13} color={SUB} />
                        </button>
                        <span
                          style={{
                            minWidth: 18,
                            textAlign: "center",
                            color: INK,
                            fontWeight: 700,
                            fontSize: 13,
                          }}
                        >
                          {qty}
                        </span>
                        <button
                          onClick={() => bump(d.id, 1)}
                          className="rounded-md"
                          style={{ border: `1px solid ${BORDER}`, padding: 3 }}
                        >
                          <Plus size={13} color={BRAND} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyHint text="Нет украшений — добавьте во вкладке «Стандарты»." />
          )}
        </div>
      </div>

      {/* Итог / спецификация */}
      <div>
        <div
          className="rounded-2xl p-4 sticky"
          style={{ border: `1px solid ${BORDER}`, background: BG, top: 12 }}
        >
          <h4 className="font-bold mb-2" style={{ color: INK, fontSize: 14 }}>
            Состав и себестоимость
          </h4>
          <div className="space-y-1.5" style={{ fontSize: 13 }}>
            <Row
              label="Основа"
              value={base ? base.name : "—"}
              cost={base?.cost}
            />
            <Row
              label="Покрытие"
              value={coating ? coating.name : "—"}
              cost={coating?.cost}
            />
            {chosenDecors.map((d) => (
              <Row
                key={d.id}
                label={`${d.name} ×${d.qty}`}
                value=""
                cost={Number(d.cost || 0) * d.qty}
              />
            ))}
          </div>

          <div
            className="flex items-center justify-between mt-3 pt-3"
            style={{ borderTop: `1px solid ${BORDER}` }}
          >
            <span style={{ color: SUB, fontSize: 13 }}>
              Себестоимость 1 торта
            </span>
            <b style={{ color: INK, fontSize: 15 }}>{money(unit)} сум</b>
          </div>

          <div className="flex items-center justify-between mt-3">
            <span style={{ color: SUB, fontSize: 13 }}>Количество тортов</span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() =>
                  setBatch((b) => Math.max(1, (Number(b) || 1) - 1))
                }
                className="rounded-md"
                style={{ border: `1px solid ${BORDER}`, padding: 4 }}
              >
                <Minus size={14} color={SUB} />
              </button>
              <input
                value={batch}
                onChange={(e) =>
                  setBatch(
                    Math.max(
                      1,
                      parseInt(
                        String(e.target.value).replace(/\D/g, "") || "1",
                        10,
                      ),
                    ),
                  )
                }
                style={{
                  width: 48,
                  textAlign: "center",
                  border: `1px solid ${BORDER}`,
                  borderRadius: 8,
                  padding: "5px 6px",
                  fontSize: 13,
                  color: INK,
                }}
              />
              <button
                onClick={() => setBatch((b) => (Number(b) || 1) + 1)}
                className="rounded-md"
                style={{ border: `1px solid ${BORDER}`, padding: 4 }}
              >
                <Plus size={14} color={BRAND} />
              </button>
            </div>
          </div>

          <div
            className="flex items-center justify-between mt-3 pt-3"
            style={{ borderTop: `1px solid ${BORDER}` }}
          >
            <span style={{ color: INK, fontSize: 14, fontWeight: 700 }}>
              Итого себестоимость
            </span>
            <b style={{ color: OK, fontSize: 18 }}>{money(total)} сум</b>
          </div>

          <button
            onClick={reset}
            className="w-full mt-3 rounded-xl px-3 py-2 font-semibold"
            style={{
              border: `1px solid ${BORDER}`,
              color: SUB,
              fontSize: 13,
              background: "#fff",
            }}
          >
            Сбросить
          </button>
          <p style={{ color: FAINT, fontSize: 11, marginTop: 8 }}>
            Далее (следующий этап): акт приготовления в iiko и внутренние
            перемещения ингредиентов со складов.
          </p>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, cost }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span style={{ color: SUB }} className="truncate">
        {label}
        {value ? `: ${value}` : ""}
      </span>
      <span style={{ color: FAINT, whiteSpace: "nowrap" }}>
        {cost ? `${money(cost)} сум` : ""}
      </span>
    </div>
  );
}

function StandardsTab({ cfg, catList, dispatch, notify }) {
  const [refs, setRefs] = useState({ kind: "idle" }); // idle|loading|ok|error
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("bases");
  const [draft, setDraft] = useState(null); // {product, name, cost}

  const load = async () => {
    setRefs({ kind: "loading" });
    try {
      const data = await apiGet("/api/iiko/production/refs");
      setRefs({ kind: "ok", products: data.products || [] });
    } catch (e) {
      setRefs({ kind: "error", msg: e.message || "Ошибка iiko" });
    }
  };

  const products = refs.kind === "ok" ? refs.products : [];
  const needle = q.trim().toLowerCase();
  const shown = needle
    ? products.filter(
        (p) =>
          (p.name || "").toLowerCase().includes(needle) ||
          (p.num || "").toLowerCase().includes(needle),
      )
    : products;

  const addStandard = () => {
    if (!draft) return;
    const item = {
      name: (draft.name || draft.product.name || "").trim(),
      cost: Number(String(draft.cost).replace(",", ".")) || 0,
      iikoId: draft.product.id,
      iikoName: draft.product.name,
      unit: draft.product.mainUnit || "шт",
    };
    if (!item.name) return notify && notify("Укажите название стандарта");
    dispatch({ type: "CAKE_STD_ADD", cat, item });
    setDraft(null);
    notify && notify("Стандарт добавлен");
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

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Каталог iiko */}
      <div>
        <div className="flex items-center justify-between gap-2 mb-2">
          <h4 className="font-bold" style={{ color: INK, fontSize: 13.5 }}>
            Позиции iiko
          </h4>
          <button
            onClick={load}
            disabled={refs.kind === "loading"}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-semibold"
            style={{
              background: BRAND,
              color: "#fff",
              fontSize: 12.5,
              opacity: refs.kind === "loading" ? 0.6 : 1,
            }}
          >
            <RefreshCw size={13} />
            {refs.kind === "loading" ? "Загрузка…" : "Загрузить из iiko"}
          </button>
        </div>

        {refs.kind === "error" && (
          <div
            className="rounded-xl px-3 py-2"
            style={{ background: "#FEE2E2", color: "#DC2626", fontSize: 12.5 }}
          >
            {refs.msg}
          </div>
        )}

        {refs.kind === "ok" && (
          <>
            <div className="flex items-center gap-2 mb-2">
              <div className="relative flex-1">
                <Search
                  size={14}
                  color={FAINT}
                  style={{ position: "absolute", left: 9, top: 10 }}
                />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="поиск позиции…"
                  style={{ ...inp, paddingLeft: 28 }}
                />
              </div>
            </div>
            <div style={{ maxHeight: 360, overflow: "auto" }}>
              {shown.slice(0, 200).map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-2 py-1.5"
                  style={{ borderBottom: `1px solid ${LINE}` }}
                >
                  <span
                    className="truncate"
                    style={{ color: INK, fontSize: 13 }}
                  >
                    {p.name}
                    {p.num ? (
                      <span style={{ color: FAINT }}> · {p.num}</span>
                    ) : null}
                  </span>
                  <button
                    onClick={() =>
                      setDraft({ product: p, name: p.name, cost: "" })
                    }
                    className="rounded-md px-2 py-1 shrink-0"
                    style={{
                      color: BRAND,
                      fontSize: 12,
                      fontWeight: 700,
                      border: `1px solid ${BORDER}`,
                    }}
                  >
                    выбрать
                  </button>
                </div>
              ))}
              {!shown.length && (
                <p style={{ color: FAINT, fontSize: 12.5, marginTop: 8 }}>
                  Ничего не найдено.
                </p>
              )}
            </div>
          </>
        )}
        {refs.kind === "idle" && (
          <EmptyHint text="Нажмите «Загрузить из iiko», чтобы выбрать позиции для стандартов." />
        )}

        {/* Форма добавления стандарта */}
        {draft && (
          <div
            className="mt-3 rounded-xl p-3"
            style={{ border: `1px solid ${BORDER}`, background: BG }}
          >
            <div style={{ color: SUB, fontSize: 12, marginBottom: 6 }}>
              iiko: <b style={{ color: INK }}>{draft.product.name}</b>
            </div>
            <div className="grid grid-cols-1 gap-2">
              <div>
                <label style={{ fontSize: 11.5, color: FAINT }}>
                  Категория
                </label>
                <select
                  value={cat}
                  onChange={(e) => setCat(e.target.value)}
                  style={inp}
                >
                  {CATS.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11.5, color: FAINT }}>
                  Название в конструкторе
                </label>
                <input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  style={inp}
                  placeholder="напр. Бисквит + банановый крем"
                />
              </div>
              <div>
                <label style={{ fontSize: 11.5, color: FAINT }}>
                  Себестоимость, сум
                </label>
                <input
                  value={draft.cost}
                  onChange={(e) => setDraft({ ...draft, cost: e.target.value })}
                  inputMode="decimal"
                  style={inp}
                  placeholder="0"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <button
                onClick={addStandard}
                className="rounded-lg px-3 py-2 font-semibold text-white"
                style={{ background: BRAND, fontSize: 13 }}
              >
                Добавить стандарт
              </button>
              <button
                onClick={() => setDraft(null)}
                className="rounded-lg px-3 py-2 font-semibold"
                style={{
                  border: `1px solid ${BORDER}`,
                  color: SUB,
                  fontSize: 13,
                  background: "#fff",
                }}
              >
                Отмена
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Текущие стандарты */}
      <div className="space-y-4">
        {CATS.map((c) => (
          <div key={c.key}>
            <h4
              className="font-bold mb-2"
              style={{ color: INK, fontSize: 13.5 }}
            >
              {c.label} ({catList(c.key).length})
            </h4>
            {catList(c.key).length ? (
              <div className="space-y-1.5">
                {catList(c.key).map((it) => (
                  <div
                    key={it.id}
                    className="flex items-center justify-between gap-2 rounded-xl p-2.5"
                    style={{ border: `1px solid ${LINE}`, background: "#fff" }}
                  >
                    <div className="min-w-0">
                      <div
                        className="truncate font-semibold"
                        style={{ color: INK, fontSize: 13 }}
                      >
                        {it.name}
                      </div>
                      <div
                        className="truncate"
                        style={{ color: FAINT, fontSize: 11 }}
                      >
                        iiko: {it.iikoName}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <input
                        value={it.cost}
                        onChange={(e) =>
                          dispatch({
                            type: "CAKE_STD_UPD",
                            cat: c.key,
                            id: it.id,
                            patch: {
                              cost:
                                Number(
                                  String(e.target.value)
                                    .replace(/[^\d.,]/g, "")
                                    .replace(",", "."),
                                ) || 0,
                            },
                          })
                        }
                        inputMode="decimal"
                        style={{
                          width: 84,
                          textAlign: "right",
                          border: `1px solid ${BORDER}`,
                          borderRadius: 8,
                          padding: "4px 7px",
                          fontSize: 12.5,
                          color: INK,
                        }}
                      />
                      <span style={{ color: FAINT, fontSize: 11 }}>сум</span>
                      <button
                        onClick={() =>
                          dispatch({
                            type: "CAKE_STD_DEL",
                            cat: c.key,
                            id: it.id,
                          })
                        }
                        title="Удалить"
                        style={{ padding: 4 }}
                      >
                        <Trash2 size={15} color="#DC2626" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyHint text={`Пока нет: ${c.label.toLowerCase()}.`} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
