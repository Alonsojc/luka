import { PrismaClient } from "@prisma/client";
import { seedLukaMasterData } from "./luka-master-seed";

const prisma = new PrismaClient();

async function main() {
  console.warn("Seeding Luka real master data...");

  const org = await prisma.organization.upsert({
    where: { rfc: "LUK240101AAA" },
    update: {
      name: "Luka Poke",
      razonSocial: "Luka Poke S.A. de C.V.",
      regimenFiscal: "601",
    },
    create: {
      name: "Luka Poke",
      rfc: "LUK240101AAA",
      razonSocial: "Luka Poke S.A. de C.V.",
      regimenFiscal: "601",
    },
  });

  const result = await seedLukaMasterData(prisma, org.id);

  console.warn("Luka master data seeded:", result);
}

main()
  .catch((e) => {
    console.error("Luka master seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
