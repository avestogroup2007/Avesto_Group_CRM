import React, { useState, useMemo } from "react";
import { apiGet, apiPost } from "./api.js";
import {
  Cake,
  Plus,
  Minus,
  Trash2,
  Search,
  RefreshCw,
  Lock,
  Sparkles,
  ChevronRight,
} from "lucide-react";

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

// Себестоимость одного использования стандарта.
// unit "г": amount — граммовка на торт, price — цена за КГ (из iiko) →
//   cost = amount/1000 × price. Пример: 100 г × 50 000/кг = 5 000.
// unit "шт": price — цена за штуку, amount — количество за одно использование.
// Обратная совместимость: старые стандарты хранили плоское поле cost.
function stdCost(it) {
  if (!it) return 0;
  if (it.unit == null && it.cost != null) return Number(it.cost) || 0;
  const price = Number(it.price) || 0;
  const amount = Number(it.amount) || 0;
  if (it.unit === "г") return (amount / 1000) * price;
  return (amount || 1) * price;
}
// Краткое описание нормы (для карточек).
function stdDesc(it) {
  if (!it) return "";
  if (it.unit === "г")
    return `${Number(it.amount) || 0} г · ${money(it.price)}/кг`;
  if (it.unit === "шт")
    return `${Number(it.amount) || 1} шт · ${money(it.price)}/шт`;
  return "";
}

// Конструктор заказных тортов.
// Пошаговый мастер: 1) основа — после подтверждения зафиксирована (изменить
// нельзя, только «Начать заново»); 2) крем/покрытие; 3) украшения — без
// ограничений, сколько угодно раз. Себестоимость считается по граммовке.
// «Стандарты» — каталог, привязанный к позициям iiko.
export default function CakeConstructor({ s, dispatch, notify }) {
  const cfg = s.cakeConfig || { bases: [], coatings: [], decors: [] };
  const [tab, setTab] = useState("build"); // build | standards

  // выбор в конструкторе
  const [step, setStep] = useState(1); // 1 основа · 2 покрытие · 3 украшения
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
    const b = stdCost(base);
    const c = stdCost(coating);
    const dec = chosenDecors.reduce((a, d) => a + stdCost(d) * d.qty, 0);
    return b + c + dec;
  }, [base, coating, chosenDecors]);
  const total = unit * Math.max(1, Number(batch) || 1);

  const bump = (id, delta) =>
    setDecorQty((q) => {
      const v = Math.max(0, (q[id] || 0) + delta);
      return { ...q, [id]: v };
    });
  const reset = () => {
    setStep(1);
    setBaseId("");
    setCoatingId("");
    setDecorQty({});
    setBatch(1);
  };

  // Применить предложение ИИ-помощника к конструктору.
  const applySuggestion = (sug) => {
    if (!sug) return;
    if (sug.baseId && cfg.bases.some((b) => b.id === sug.baseId)) {
      setBaseId(sug.baseId);
      setStep(3); // основа выбрана ИИ → сразу к украшениям
    }
    if (sug.coatingId && cfg.coatings.some((c) => c.id === sug.coatingId)) {
      setCoatingId(sug.coatingId);
    }
    const q = {};
    (sug.decors || []).forEach((d) => {
      if (cfg.decors.some((x) => x.id === d.id) && d.qty > 0) q[d.id] = d.qty;
    });
    setDecorQty(q);
    notify && notify("Состав применён — проверьте и дополните");
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
      <div style={{ color: FAINT, fontSize: 10.5, marginTop: 1 }}>
        {stdDesc(item)}
      </div>
      <div className="flex items-center justify-between mt-1">
        <span style={{ color: BRAND, fontSize: 12, fontWeight: 700 }}>
          {money(stdCost(item))} сум
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
        Пошаговая сборка заказного торта: основа → покрытие → украшения.
        Себестоимость считается по граммовке (100 г крема × 50 000/кг = 5 000).
        После подтверждения основы изменить её нельзя — только начать заново,
        как на производстве.
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
          step={step}
          setStep={setStep}
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
          applySuggestion={applySuggestion}
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

// Индикатор шагов мастера.
function StepsBar({ step }) {
  const items = [
    [1, "Основа"],
    [2, "Покрытие"],
    [3, "Украшения"],
  ];
  return (
    <div className="flex items-center gap-1.5 flex-wrap mb-3">
      {items.map(([n, label], i) => {
        const done = step > n;
        const active = step === n;
        return (
          <React.Fragment key={n}>
            {i > 0 && <ChevronRight size={14} color={FAINT} />}
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5"
              style={{
                fontSize: 12.5,
                fontWeight: 700,
                background: active ? BRAND : done ? "#DCFCE7" : "#F1F5F9",
                color: active ? "#fff" : done ? "#15803D" : "#64748B",
              }}
            >
              {done && n === 1 ? <Lock size={12} /> : null}
              {n}. {label}
            </span>
          </React.Fragment>
        );
      })}
    </div>
  );
}

function BuildTab(props) {
  const {
    cfg,
    step,
    setStep,
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
    notify,
    applySuggestion,
  } = props;

  const grid = "grid grid-cols-2 sm:grid-cols-3 gap-2";
  const noStandards =
    !cfg.bases.length && !cfg.coatings.length && !cfg.decors.length;

  if (noStandards)
    return (
      <EmptyHint text="Стандартов пока нет. Откройте вкладку «Стандарты», загрузите позиции из iiko и добавьте основы, покрытия и украшения — они появятся здесь для быстрого выбора." />
    );

  const confirmBase = () => {
    if (!baseId) {
      notify && notify("Выберите основу торта");
      return;
    }
    setStep(2);
  };
  const toDecors = () => setStep(3);

  const nextBtn = {
    background: BRAND,
    color: "#fff",
    fontSize: 13.5,
    fontWeight: 700,
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 space-y-4">
        <StepsBar step={step} />

        {/* Зафиксированная основа (после подтверждения) */}
        {step > 1 && base && (
          <div
            className="flex items-center justify-between gap-2 rounded-xl p-3"
            style={{ border: `1.5px solid ${BRAND}`, background: "#FDF6F2" }}
          >
            <div className="flex items-center gap-2 min-w-0">
              <Lock size={15} color={BRAND} />
              <div className="min-w-0">
                <div
                  className="font-bold truncate"
                  style={{ color: INK, fontSize: 13.5 }}
                >
                  Основа: {base.name}
                </div>
                <div style={{ color: FAINT, fontSize: 11 }}>
                  {stdDesc(base)} · {money(stdCost(base))} сум · зафиксирована —
                  изменить нельзя
                </div>
              </div>
            </div>
            <button
              onClick={reset}
              className="rounded-lg px-2.5 py-1.5 shrink-0"
              style={{
                border: `1px solid ${BORDER}`,
                color: SUB,
                fontSize: 12,
                fontWeight: 600,
                background: "#fff",
              }}
            >
              Начать заново
            </button>
          </div>
        )}

        {/* Шаг 1 — основа */}
        {step === 1 && (
          <div>
            <h4
              className="font-bold mb-2"
              style={{ color: INK, fontSize: 13.5 }}
            >
              Шаг 1. Выберите основу торта
            </h4>
            {cfg.bases.length ? (
              <>
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
                <div className="flex items-center gap-3 mt-3">
                  <button
                    onClick={confirmBase}
                    disabled={!baseId}
                    className="rounded-xl px-4 py-2.5"
                    style={{ ...nextBtn, opacity: baseId ? 1 : 0.5 }}
                  >
                    Подтвердить основу →
                  </button>
                  <span style={{ color: FAINT, fontSize: 11.5 }}>
                    После подтверждения основу изменить нельзя
                  </span>
                </div>
              </>
            ) : (
              <EmptyHint text="Нет основ — добавьте во вкладке «Стандарты»." />
            )}
          </div>
        )}

        {/* Шаг 2 — покрытие */}
        {step === 2 && (
          <div>
            <h4
              className="font-bold mb-2"
              style={{ color: INK, fontSize: 13.5 }}
            >
              Шаг 2. Крем / покрытие
            </h4>
            <p style={{ color: SUB, fontSize: 12, marginBottom: 8 }}>
              Обычно — крем (банановый, крем-чиз) или шоколад/шоколадный крем.
            </p>
            {cfg.coatings.length ? (
              <>
                <div className={grid}>
                  {cfg.coatings.map((c) => (
                    <Card
                      key={c.id}
                      item={c}
                      selected={coatingId === c.id}
                      onClick={() =>
                        setCoatingId(coatingId === c.id ? "" : c.id)
                      }
                    />
                  ))}
                </div>
                <div className="flex items-center gap-3 mt-3">
                  <button
                    onClick={toDecors}
                    disabled={!coatingId}
                    className="rounded-xl px-4 py-2.5"
                    style={{ ...nextBtn, opacity: coatingId ? 1 : 0.5 }}
                  >
                    Далее: украшения →
                  </button>
                  <button
                    onClick={toDecors}
                    style={{ color: FAINT, fontSize: 12 }}
                  >
                    пропустить (без покрытия)
                  </button>
                </div>
              </>
            ) : (
              <>
                <EmptyHint text="Покрытий пока нет в стандартах." />
                <button
                  onClick={toDecors}
                  className="rounded-xl px-4 py-2.5 mt-3"
                  style={nextBtn}
                >
                  Далее: украшения →
                </button>
              </>
            )}
          </div>
        )}

        {/* Шаг 3 — украшения (без ограничений) */}
        {step === 3 && (
          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <h4 className="font-bold" style={{ color: INK, fontSize: 13.5 }}>
                Шаг 3. Украшения — сколько нужно
              </h4>
              <button
                onClick={() => setStep(2)}
                style={{ color: SUB, fontSize: 12, fontWeight: 600 }}
              >
                ‹ покрытие
              </button>
            </div>
            <p style={{ color: SUB, fontSize: 12, marginBottom: 8 }}>
              Добавляйте без ограничений: шоколадные узоры, декоративные
              игрушки, бумажные топперы, свечи, цифры (день рождения), имена
              (свадьба) и т.д.
            </p>
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
                      <div
                        style={{ color: FAINT, fontSize: 10.5, marginTop: 1 }}
                      >
                        {stdDesc(d)}
                      </div>
                      <div className="flex items-center justify-between mt-1.5">
                        <span
                          style={{
                            color: BRAND,
                            fontSize: 12,
                            fontWeight: 700,
                          }}
                        >
                          {money(stdCost(d))} сум
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => bump(d.id, -1)}
                            className="rounded-md"
                            style={{
                              border: `1px solid ${BORDER}`,
                              padding: 3,
                            }}
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
                            style={{
                              border: `1px solid ${BORDER}`,
                              padding: 3,
                            }}
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
        )}
      </div>

      {/* Итог / спецификация + ИИ-помощник */}
      <div className="space-y-4">
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
              cost={stdCost(base)}
            />
            <Row
              label="Покрытие"
              value={coating ? coating.name : "—"}
              cost={stdCost(coating)}
            />
            {chosenDecors.map((d) => (
              <Row
                key={d.id}
                label={`${d.name} ×${d.qty}`}
                value=""
                cost={stdCost(d) * d.qty}
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
            Начать заново
          </button>
          <p style={{ color: FAINT, fontSize: 11, marginTop: 8 }}>
            Далее (следующий этап): акт приготовления в iiko и внутренние
            перемещения ингредиентов со складов.
          </p>
        </div>

        <AiHelper cfg={cfg} onApply={applySuggestion} />
      </div>
    </div>
  );
}

// ИИ-помощник: по описанию заказа подбирает состав из стандартов.
// Ключ ИИ хранится только на сервере (Render); фронт зовёт /api/ai/cake-suggest.
function AiHelper({ cfg, onApply }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [sug, setSug] = useState(null);
  const [err, setErr] = useState("");

  const ask = async () => {
    if (!text.trim()) {
      setErr("Опишите заказ — например: «свадебный торт 2 кг, имена, узоры»");
      return;
    }
    setBusy(true);
    setErr("");
    setSug(null);
    try {
      const slim = (list) =>
        (list || []).map((x) => ({
          id: x.id,
          name: x.name,
          cost: Math.round(stdCost(x)),
        }));
      const r = await apiPost("/api/ai/cake-suggest", {
        order: text.trim().slice(0, 600),
        standards: {
          bases: slim(cfg.bases),
          coatings: slim(cfg.coatings),
          decors: slim(cfg.decors),
        },
      });
      setSug(r);
    } catch (e) {
      setErr(e.message || "ИИ-помощник недоступен");
    } finally {
      setBusy(false);
    }
  };

  const nameOf = (list, id) =>
    (list.find((x) => x.id === id) || {}).name || null;

  return (
    <div
      className="rounded-2xl p-4"
      style={{ border: `1px solid ${BORDER}`, background: "#fff" }}
    >
      <div className="flex items-center gap-1.5 mb-1">
        <Sparkles size={15} color={BRAND} />
        <h4 className="font-bold" style={{ color: INK, fontSize: 13.5 }}>
          ИИ-помощник
        </h4>
      </div>
      <p style={{ color: SUB, fontSize: 11.5, marginBottom: 8 }}>
        Опишите заказ — помощник предложит состав из ваших стандартов.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder="напр.: свадебный торт на 30 человек, белый крем, имена Алишер и Мадина, живые цветы"
        style={{
          width: "100%",
          border: `1px solid ${BORDER}`,
          borderRadius: 10,
          padding: "8px 10px",
          fontSize: 12.5,
          color: INK,
          resize: "vertical",
        }}
      />
      <button
        onClick={ask}
        disabled={busy}
        className="w-full mt-2 rounded-xl px-3 py-2 font-bold text-white inline-flex items-center justify-center gap-1.5"
        style={{ background: BRAND, fontSize: 13, opacity: busy ? 0.6 : 1 }}
      >
        <Sparkles size={14} />
        {busy ? "Подбираю…" : "Подсказать состав (ИИ)"}
      </button>

      {err && (
        <div style={{ color: "#DC2626", fontSize: 11.5, marginTop: 6 }}>
          {err}
        </div>
      )}

      {sug && (
        <div
          className="mt-3 rounded-xl p-3"
          style={{ background: BG, border: `1px solid ${LINE}` }}
        >
          <div className="space-y-1" style={{ fontSize: 12, color: INK }}>
            {sug.baseId && nameOf(cfg.bases, sug.baseId) && (
              <div>
                <b>Основа:</b> {nameOf(cfg.bases, sug.baseId)}
              </div>
            )}
            {sug.coatingId && nameOf(cfg.coatings, sug.coatingId) && (
              <div>
                <b>Покрытие:</b> {nameOf(cfg.coatings, sug.coatingId)}
              </div>
            )}
            {(sug.decors || []).length > 0 && (
              <div>
                <b>Украшения:</b>{" "}
                {(sug.decors || [])
                  .map((d) => {
                    const n = nameOf(cfg.decors, d.id);
                    return n ? `${n} ×${d.qty}` : null;
                  })
                  .filter(Boolean)
                  .join(", ")}
              </div>
            )}
          </div>
          {sug.note && (
            <p style={{ color: SUB, fontSize: 11.5, marginTop: 6 }}>
              {sug.note}
            </p>
          )}
          <button
            onClick={() => onApply(sug)}
            className="w-full mt-2 rounded-lg px-3 py-2 font-bold"
            style={{
              border: `1px solid ${BRAND}`,
              color: BRAND,
              fontSize: 12.5,
              background: "#fff",
            }}
          >
            Применить состав
          </button>
        </div>
      )}
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
  // draft: { product, name, unit ("г"|"шт"), amount, price }
  const [draft, setDraft] = useState(null);

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

  const num = (v) =>
    Number(
      String(v)
        .replace(",", ".")
        .replace(/[^\d.]/g, ""),
    ) || 0;
  const addStandard = () => {
    if (!draft) return;
    const item = {
      name: (draft.name || draft.product.name || "").trim(),
      unit: draft.unit || "г",
      amount: num(draft.amount),
      price: num(draft.price),
      iikoId: draft.product.id,
      iikoName: draft.product.name,
    };
    if (!item.name) return notify && notify("Укажите название стандарта");
    if (!item.amount)
      return (
        notify &&
        notify(item.unit === "г" ? "Укажите вес (г)" : "Укажите количество")
      );
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
                      setDraft({
                        product: p,
                        name: p.name,
                        unit: "г",
                        amount: "",
                        price: "",
                      })
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
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label style={{ fontSize: 11.5, color: FAINT }}>Норма</label>
                  <select
                    value={draft.unit}
                    onChange={(e) =>
                      setDraft({ ...draft, unit: e.target.value })
                    }
                    style={inp}
                  >
                    <option value="г">в граммах</option>
                    <option value="шт">в штуках</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11.5, color: FAINT }}>
                    {draft.unit === "г" ? "Вес, г" : "Кол-во, шт"}
                  </label>
                  <input
                    value={draft.amount}
                    onChange={(e) =>
                      setDraft({ ...draft, amount: e.target.value })
                    }
                    inputMode="decimal"
                    style={inp}
                    placeholder={draft.unit === "г" ? "напр. 100" : "напр. 1"}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11.5, color: FAINT }}>
                    {draft.unit === "г" ? "Цена за кг" : "Цена за шт"}
                  </label>
                  <input
                    value={draft.price}
                    onChange={(e) =>
                      setDraft({ ...draft, price: e.target.value })
                    }
                    inputMode="decimal"
                    style={inp}
                    placeholder="сум"
                  />
                </div>
              </div>
              <div style={{ fontSize: 12, color: SUB }}>
                Себестоимость:{" "}
                <b style={{ color: BRAND }}>
                  {money(
                    stdCost({
                      unit: draft.unit,
                      amount: num(draft.amount),
                      price: num(draft.price),
                    }),
                  )}{" "}
                  сум
                </b>
                {draft.unit === "г" && (
                  <span style={{ color: FAINT }}>
                    {" "}
                    (цену за кг возьмём из iiko автоматически на следующем
                    этапе)
                  </span>
                )}
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
                        {stdDesc(it) ? stdDesc(it) + " · " : ""}
                        {money(stdCost(it))} сум · iiko: {it.iikoName}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <input
                        value={it.amount != null ? it.amount : ""}
                        onChange={(e) =>
                          dispatch({
                            type: "CAKE_STD_UPD",
                            cat: c.key,
                            id: it.id,
                            patch: {
                              unit: it.unit || "г",
                              amount:
                                Number(
                                  String(e.target.value)
                                    .replace(/[^\d.,]/g, "")
                                    .replace(",", "."),
                                ) || 0,
                            },
                          })
                        }
                        inputMode="decimal"
                        title={it.unit === "шт" ? "кол-во, шт" : "вес, г"}
                        style={{
                          width: 56,
                          textAlign: "right",
                          border: `1px solid ${BORDER}`,
                          borderRadius: 8,
                          padding: "4px 6px",
                          fontSize: 12,
                          color: INK,
                        }}
                      />
                      <span style={{ color: FAINT, fontSize: 11 }}>
                        {it.unit === "шт" ? "шт" : "г"}
                      </span>
                      <input
                        value={it.price != null ? it.price : ""}
                        onChange={(e) =>
                          dispatch({
                            type: "CAKE_STD_UPD",
                            cat: c.key,
                            id: it.id,
                            patch: {
                              price:
                                Number(
                                  String(e.target.value)
                                    .replace(/[^\d.,]/g, "")
                                    .replace(",", "."),
                                ) || 0,
                            },
                          })
                        }
                        inputMode="decimal"
                        title={it.unit === "шт" ? "цена за шт" : "цена за кг"}
                        style={{
                          width: 76,
                          textAlign: "right",
                          border: `1px solid ${BORDER}`,
                          borderRadius: 8,
                          padding: "4px 6px",
                          fontSize: 12,
                          color: INK,
                        }}
                      />
                      <span style={{ color: FAINT, fontSize: 10 }}>
                        {it.unit === "шт" ? "/шт" : "/кг"}
                      </span>
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
