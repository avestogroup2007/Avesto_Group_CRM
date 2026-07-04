// Структурированный логгер (для журнала и отладки).
import pino from "pino";
import { env } from "./env.js";

export const log = pino({
  level: env.NODE_ENV === "production" ? "info" : "debug",
});
