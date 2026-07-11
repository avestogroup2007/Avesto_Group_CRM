// ИИ-помощник (Claude API). Ключ хранится ТОЛЬКО в окружении хостинга и
// клиенту не отдаётся. Первый сценарий — конструктор тортов: по описанию
// заказа подбирает состав из стандартов (основа/покрытие/украшения).
// Дальше сюда же добавим помощников для акта приготовления и аналитики.
import Anthropic from "@anthropic-ai/sdk";
import { env } from "../env.js";

export function aiConfigured() {
  return Boolean(env.ANTHROPIC_API_KEY);
}

let _client = null;
function client() {
  if (!_client) _client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return _client;
}

// Схема ответа: строгий JSON, чтобы фронт применял состав без разбора текста.
const CAKE_SUGGEST_SCHEMA = {
  type: "object",
  properties: {
    baseId: {
      anyOf: [{ type: "string" }, { type: "null" }],
      description: "id выбранной основы из standards.bases или null",
    },
    coatingId: {
      anyOf: [{ type: "string" }, { type: "null" }],
      description: "id покрытия из standards.coatings или null",
    },
    decors: {
      type: "array",
      description: "украшения из standards.decors с количеством",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          qty: { type: "integer" },
        },
        required: ["id", "qty"],
        additionalProperties: false,
      },
    },
    note: {
      type: "string",
      description:
        "короткое пояснение по-русски: что подобрано и что уточнить у клиента",
    },
  },
  required: ["baseId", "coatingId", "decors", "note"],
  additionalProperties: false,
};

const CAKE_SYSTEM =
  "Ты — помощник кондитерского цеха Avesto Sweets (Узбекистан, суммы в сумах). " +
  "По описанию заказа клиента подбери состав торта СТРОГО из переданных " +
  "стандартов (используй только их id). Правила: ровно одна основа (baseId), " +
  "не больше одного покрытия (coatingId), украшений сколько уместно (qty ≥ 1). " +
  "Если подходящего стандарта нет — верни null/пропусти и скажи об этом в note. " +
  "Ничего не выдумывай: id, которых нет в списке, использовать нельзя. " +
  "В note кратко (1–2 предложения) объясни выбор и что стоит уточнить у клиента.";

// Подбор состава торта по описанию заказа.
export async function suggestCake({ order, standards }) {
  const response = await client().messages.create({
    model: "claude-opus-4-8",
    max_tokens: 2000,
    thinking: { type: "adaptive" },
    output_config: {
      effort: "low",
      format: { type: "json_schema", schema: CAKE_SUGGEST_SCHEMA },
    },
    system: CAKE_SYSTEM,
    messages: [
      {
        role: "user",
        content:
          `Заказ клиента: ${order}\n\n` +
          `Доступные стандарты (JSON): ${JSON.stringify(standards)}`,
      },
    ],
  });
  if (response.stop_reason === "refusal") {
    throw new Error("ИИ отклонил запрос — переформулируйте описание заказа");
  }
  const text = response.content.find((b) => b.type === "text");
  return JSON.parse(text ? text.text : "{}");
}
