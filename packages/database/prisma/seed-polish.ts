import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function randDec(min: number, max: number, decimals = 2): number {
  return parseFloat((Math.random() * (max - min) + min).toFixed(decimals));
}
function pick<T>(arr: T[]): T {
  return arr[randInt(0, arr.length - 1)];
}
function daysAgo(days: number): Date {
  const d = new Date("2026-04-09T12:00:00Z");
  d.setDate(d.getDate() - days);
  d.setHours(randInt(8, 20), randInt(0, 59), 0, 0);
  return d;
}

async function main() {
  console.warn("=== Seed Polish — Professional Data ===\n");

  const org = await prisma.organization.findFirstOrThrow({ where: { rfc: "LUK240101AAA" } });
  const branches = await prisma.branch.findMany({
    where: { organizationId: org.id, isActive: true },
  });
  const storeBranches = branches.filter((b) => b.branchType !== "CEDIS");

  // ============================================================
  // 1. FIX CUSTOMER TIERS — distribute Gold/Silver/Bronze
  // ============================================================
  console.warn("1. Fixing customer tiers...");
  const customers = await prisma.customer.findMany({ where: { organizationId: org.id } });

  // Sort by totalPointsEarned descending to assign tiers logically
  const sorted = [...customers].sort((a, b) => b.totalPointsEarned - a.totalPointsEarned);

  for (let i = 0; i < sorted.length; i++) {
    let tier: "GOLD" | "SILVER" | "BRONZE";
    let loyaltyTier: string;
    let points: number;

    if (i < 3) {
      // Top 3 = GOLD (high spenders)
      tier = "GOLD";
      loyaltyTier = "Oro";
      points = randInt(2000, 4500);
    } else if (i < 8) {
      // Next 5 = SILVER
      tier = "SILVER";
      loyaltyTier = "Plata";
      points = randInt(800, 1999);
    } else {
      // Rest = BRONZE (newer or less active)
      tier = "BRONZE";
      loyaltyTier = "Bronce";
      points = randInt(50, 799);
    }

    const totalEarned = points + randInt(500, 3000);

    await prisma.customer.update({
      where: { id: sorted[i].id },
      data: {
        tier,
        loyaltyTier,
        loyaltyPoints: points,
        totalPointsEarned: totalEarned,
        // Spread registration dates over 6 months
        registeredAt: daysAgo(randInt(30, 180)),
      },
    });
  }
  console.warn(`  Updated ${customers.length} customers (3 Gold, 5 Silver, 7 Bronze)`);

  // ============================================================
  // 2. ADD MORE POS SALES for realistic ticket promedio
  //    Current: 534 POS sales. Inversionistas uses these for ticket avg.
  //    Problem: POS sales exist but inversionistas.service uses corntechSales
  //    Let's ensure corntech sales have items for ticket promedio calc.
  // ============================================================
  console.warn("\n2. Verifying sales data coverage...");
  const corntechCount = await prisma.corntechSale.count({
    where: { branchId: { in: storeBranches.map((b) => b.id) } },
  });
  const posCount = await prisma.posSale.count({ where: { organizationId: org.id } });
  console.warn(`  Corntech sales: ${corntechCount}, POS sales: ${posCount}`);

  // ============================================================
  // 3. ENSURE BUDGET DATA covers April 2026 for all store branches
  //    So Presupuesto vs Real shows meaningful data
  // ============================================================
  console.warn("\n3. Ensuring budget data for April 2026...");
  const categories = [
    "LABOR",
    "FOOD_COST",
    "RENT",
    "UTILITIES",
    "MARKETING",
    "MAINTENANCE",
    "OTHER",
  ] as const;

  const budgetRanges: Record<string, [number, number]> = {
    LABOR: [140000, 200000],
    FOOD_COST: [90000, 150000],
    RENT: [35000, 65000],
    UTILITIES: [8000, 18000],
    MARKETING: [15000, 35000],
    MAINTENANCE: [5000, 12000],
    OTHER: [3000, 8000],
  };

  let budgetsCreated = 0;
  for (const branch of storeBranches) {
    for (const cat of categories) {
      // Check if April 2026 budget exists
      const existing = await prisma.branchBudget.findFirst({
        where: {
          organizationId: org.id,
          branchId: branch.id,
          year: 2026,
          month: 4,
          category: cat,
        },
      });

      const range = budgetRanges[cat];
      const budgetAmount = randDec(range[0], range[1]);

      if (!existing) {
        await prisma.branchBudget.create({
          data: {
            organizationId: org.id,
            branchId: branch.id,
            year: 2026,
            month: 4,
            category: cat,
            budgetAmount,
          },
        });
        budgetsCreated++;
      } else if (Number(existing.budgetAmount) === 0) {
        await prisma.branchBudget.update({
          where: { id: existing.id },
          data: { budgetAmount },
        });
        budgetsCreated++;
      }
    }
  }
  console.warn(`  Budgets created/updated: ${budgetsCreated}`);

  // ============================================================
  // 4. ADD MORE LOYALTY TRANSACTIONS for richer dashboard
  //    Currently 103. Add recent earn/redeem activity.
  // ============================================================
  console.warn("\n4. Enriching loyalty transactions...");
  const existingTxCount = await prisma.loyaltyTransaction.count({
    where: { organizationId: org.id },
  });

  if (existingTxCount < 200) {
    const allCustomers = await prisma.customer.findMany({ where: { organizationId: org.id } });
    let txCreated = 0;

    for (const customer of allCustomers) {
      // 5-15 earn transactions per customer over last 60 days
      const earnCount = randInt(5, 15);
      let runningBalance = customer.loyaltyPoints;

      for (let i = 0; i < earnCount; i++) {
        const earnPoints = randInt(20, 180);
        runningBalance += earnPoints;

        await prisma.loyaltyTransaction.create({
          data: {
            organizationId: org.id,
            customerId: customer.id,
            branchId: pick(storeBranches).id,
            type: "EARN",
            points: earnPoints,
            balance: runningBalance,
            description: pick([
              "Compra en tienda",
              "Bowl Premium",
              "Pedido delivery",
              "Combo familiar",
              "Bowl + Bebida",
              "Martes de puntos dobles",
            ]),
            referenceType: "SALE",
            createdAt: daysAgo(randInt(1, 60)),
          },
        });
        txCreated++;
      }

      // 1-4 redeem transactions
      const redeemCount = randInt(1, 4);
      for (let i = 0; i < redeemCount; i++) {
        const redeemPoints = randInt(50, 300);
        runningBalance = Math.max(0, runningBalance - redeemPoints);

        await prisma.loyaltyTransaction.create({
          data: {
            organizationId: org.id,
            customerId: customer.id,
            branchId: pick(storeBranches).id,
            type: "REDEEM",
            points: -redeemPoints,
            balance: runningBalance,
            description: pick([
              "Canje: Topping Extra Gratis",
              "Canje: Bebida Gratis",
              "Canje: Bowl Clasico",
              "Canje: Descuento 10%",
              "Canje: Postre Gratis",
            ]),
            referenceType: "MANUAL",
            createdAt: daysAgo(randInt(1, 30)),
          },
        });
        txCreated++;
      }

      // Update customer balance to match
      await prisma.customer.update({
        where: { id: customer.id },
        data: { loyaltyPoints: Math.max(0, runningBalance) },
      });
    }
    console.warn(`  Loyalty transactions created: ${txCreated}`);
  } else {
    console.warn(`  Already ${existingTxCount} transactions — skipping`);
  }

  // ============================================================
  // 5. ADD BANK TRANSACTIONS for April to show cash flow
  // ============================================================
  console.warn("\n5. Checking bank transaction coverage...");
  const accounts = await prisma.bankAccount.findMany({ where: { organizationId: org.id } });
  const accountIds = accounts.map((a) => a.id);
  const aprilTxCount =
    accountIds.length > 0
      ? await prisma.bankTransaction.count({
          where: {
            bankAccountId: { in: accountIds },
            transactionDate: { gte: new Date("2026-04-01"), lt: new Date("2026-05-01") },
          },
        })
      : 0;
  console.warn(`  April 2026 bank transactions: ${aprilTxCount}`);

  if (aprilTxCount < 30 && accounts.length > 0) {
    const incomeDescs = [
      "Venta del dia - Efectivo",
      "Venta del dia - Tarjeta",
      "Transferencia cliente corporativo",
      "Deposito ventas delivery",
      "Cobro factura pendiente",
      "Venta catering evento",
    ];
    const expenseDescs = [
      "Pago nomina quincenal",
      "Renta sucursal mensual",
      "Compra proveedor pescado",
      "Pago CFE luz",
      "Compra proveedor verduras",
      "Mantenimiento equipo cocina",
      "Pago servicio agua",
      "Marketing redes sociales",
      "Seguro local",
      "Gastos varios oficina",
    ];

    let txCount = 0;
    for (let day = 1; day <= 9; day++) {
      const account = pick(accounts);
      const date = new Date(`2026-04-${String(day).padStart(2, "0")}T12:00:00Z`);

      // 2-4 income transactions per day
      for (let i = 0; i < randInt(2, 4); i++) {
        const amount = randDec(8000, 45000);
        await prisma.bankTransaction.create({
          data: {
            bankAccountId: account.id,
            transactionDate: date,
            description: pick(incomeDescs),
            reference: `DEP-${String(day).padStart(2, "0")}${String(i + 1).padStart(2, "0")}`,
            amount,
            type: "CREDIT",
          },
        });
        txCount++;
      }

      // 1-2 expense transactions per day
      for (let i = 0; i < randInt(1, 2); i++) {
        const amount = randDec(3000, 25000);
        await prisma.bankTransaction.create({
          data: {
            bankAccountId: account.id,
            transactionDate: date,
            description: pick(expenseDescs),
            reference: `PAG-${String(day).padStart(2, "0")}${String(i + 1).padStart(2, "0")}`,
            amount,
            type: "DEBIT",
          },
        });
        txCount++;
      }
    }
    console.warn(`  Created ${txCount} April bank transactions`);
  }

  // ============================================================
  // 6. ENSURE REWARDS have varied redemptions
  // ============================================================
  console.warn("\n6. Updating reward redemption counts...");
  const rewards = await prisma.loyaltyReward.findMany({ where: { organizationId: org.id } });
  for (const reward of rewards) {
    await prisma.loyaltyReward.update({
      where: { id: reward.id },
      data: { currentRedemptions: randInt(5, 45) },
    });
  }
  console.warn(`  Updated ${rewards.length} rewards with redemption counts`);

  // ============================================================
  // SUMMARY
  // ============================================================
  console.warn("\n=== Seed Polish Complete ===");
  const finalCounts = {
    customers: await prisma.customer.count({ where: { organizationId: org.id } }),
    goldCustomers: await prisma.customer.count({ where: { organizationId: org.id, tier: "GOLD" } }),
    silverCustomers: await prisma.customer.count({
      where: { organizationId: org.id, tier: "SILVER" },
    }),
    bronzeCustomers: await prisma.customer.count({
      where: { organizationId: org.id, tier: "BRONZE" },
    }),
    loyaltyTransactions: await prisma.loyaltyTransaction.count({
      where: { organizationId: org.id },
    }),
    budgets: await prisma.branchBudget.count({ where: { organizationId: org.id } }),
    bankTransactions: await prisma.bankTransaction.count({
      where: { bankAccountId: { in: accountIds } },
    }),
  };
  console.warn(finalCounts);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
