// Начальное наполнение БД: компания, филиалы и ОДНА служебная учётка
// администратора (sysadmin). Демо-сотрудники не заводятся — реальные приходят
// из синхронизации кадров с iiko. Пароль sysadmin сменить после первого входа.
import bcrypt from "bcrypt";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

// Стартовый пароль служебной учётки. Обязательно сменить в проде.
const DEMO_PASSWORD = process.env.SEED_PASSWORD || "changeme123";

// Только администратор для первичной настройки и запуска синхронизации кадров.
const ROLES = [
  { name: "sysadmin", role: "sysadmin", position: "Системный администратор" },
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
