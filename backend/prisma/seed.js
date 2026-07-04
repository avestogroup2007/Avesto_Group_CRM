// Начальное наполнение БД: компания, филиалы и по одному пользователю на роль.
// Демо-учётки нужны, чтобы проверить вход на Этапе 1. В проде замените их
// реальными сотрудниками и удалите демо-пароли.
import bcrypt from "bcrypt";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

// Единый демо-пароль для всех учёток на старте. Меняется при заведении реальных людей.
const DEMO_PASSWORD = process.env.SEED_PASSWORD || "changeme123";

const ROLES = [
  { name: "director", role: "director", position: "Директор" },
  { name: "finance", role: "finance", position: "Финансовый директор" },
  { name: "manager", role: "manager", position: "Управляющий филиалом" },
  { name: "accountant", role: "accountant", position: "Бухгалтер" },
  { name: "sysadmin", role: "sysadmin", position: "Системный администратор" },
  { name: "staff", role: "staff", position: "Сотрудник" },
];

async function main() {
  // Компания.
  const company = await db.company.upsert({
    where: { id: "seed-company" },
    update: {},
    create: { id: "seed-company", name: "Avesto Group", inn: "000000000" },
  });

  // Два филиала.
  const branchCentral = await db.branch.upsert({
    where: { id: "seed-branch-central" },
    update: {},
    create: {
      id: "seed-branch-central",
      name: "Центральный",
      companyId: company.id,
      monthlyBudget: 50_000_000,
    },
  });
  await db.branch.upsert({
    where: { id: "seed-branch-second" },
    update: {},
    create: {
      id: "seed-branch-second",
      name: "Второй",
      companyId: company.id,
      monthlyBudget: 30_000_000,
    },
  });

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  for (const u of ROLES) {
    // Управляющего привязываем к филиалу — на нём проверяются права по филиалу.
    const branchId = u.role === "manager" ? branchCentral.id : null;
    await db.user.upsert({
      where: { name: u.name },
      update: { role: u.role, position: u.position, active: true, branchId },
      create: {
        name: u.name,
        passwordHash,
        role: u.role,
        position: u.position,
        branchId,
      },
    });
  }

  console.log("Seed завершён. Демо-учётки (логин / пароль):");
  for (const u of ROLES) {
    console.log(`  ${u.name.padEnd(12)} / ${DEMO_PASSWORD}   [${u.role}]`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
