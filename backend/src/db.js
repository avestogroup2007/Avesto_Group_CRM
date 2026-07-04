// Единая точка доступа к базе данных.
import { PrismaClient } from "@prisma/client";

export const db = new PrismaClient();

// Аккуратно закрываем соединение при остановке процесса.
async function shutdown() {
  await db.$disconnect();
}
process.on("beforeExit", shutdown);
process.on("SIGINT", async () => {
  await shutdown();
  process.exit(0);
});
process.on("SIGTERM", async () => {
  await shutdown();
  process.exit(0);
});
