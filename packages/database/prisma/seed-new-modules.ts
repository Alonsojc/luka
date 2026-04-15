import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randDec(min: number, max: number, decimals = 2): number {
  return parseFloat((Math.random() * (max - min) + min).toFixed(decimals));
}

function pick<T>(arr: T[]): T {
  return arr[randInt(0, arr.length - 1)];
}

/** Return a Date shifted by `days` from now, with a random hour. */
function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(randInt(8, 22), randInt(0, 59), randInt(0, 59), 0);
  return d;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WASTE_REASONS = [
  "SPOILAGE",
  "SPOILAGE",
  "SPOILAGE",
  "OVER_PREP",
  "OVER_PREP",
  "ACCIDENT",
  "EXPIRED",
  "OTHER",
];

const DELIVERY_PLATFORMS_WEIGHTED = [
  "UBEREATS",
  "UBEREATS",
  "UBEREATS",
  "UBEREATS",
  "UBEREATS",
  "UBEREATS",
  "UBEREATS",
  "UBEREATS",
  "RAPPI",
  "RAPPI",
  "RAPPI",
  "RAPPI",
  "RAPPI",
  "RAPPI",
  "RAPPI",
  "DIDI_FOOD",
  "DIDI_FOOD",
  "DIDI_FOOD",
  "DIDI_FOOD",
  "MANUAL",
];

const PLATFORM_FEE_RATES: Record<string, number> = {
  UBEREATS: 0.25,
  RAPPI: 0.22,
  DIDI_FOOD: 0.2,
  MANUAL: 0,
};

const DELIVERY_STATUSES_WEIGHTED = [
  "DELIVERED",
  "DELIVERED",
  "DELIVERED",
  "DELIVERED",
  "DELIVERED",
  "DELIVERED",
  "DELIVERED",
  "DELIVERED",
  "DELIVERED",
  "DELIVERED",
  "DELIVERED",
  "DELIVERED",
  "CANCELLED",
  "CANCELLED",
  "PREPARING",
];

const CUSTOMER_NAMES = [
  "María García López",
  "José Hernández Martínez",
  "Ana Sofía Ramírez Torres",
  "Carlos Alberto Flores Ruiz",
  "Daniela Martínez Sánchez",
  "Luis Miguel Torres García",
  "Paola Fernanda Sánchez Cruz",
  "Jorge Eduardo Ruiz Morales",
  "Gabriela Mendoza Vargas",
  "Roberto Alejandro Vargas León",
  "Valentina Ortiz Navarro",
  "Diego Armando Cruz Jiménez",
  "Ximena Jiménez Herrera",
  "Fernando Navarro Peña",
  "Sofía Herrera Domínguez",
  "Alejandro Peña Castillo",
  "Camila Domínguez Ríos",
  "Rodrigo Castillo Reyes",
  "Andrea Ríos Guzmán",
  "Miguel Ángel Guzmán Mora",
  "Laura Reyes Delgado",
  "Eduardo Delgado Medina",
  "Mariana Medina Cortés",
  "Sebastián Cortés Ibarra",
  "Renata Ibarra Salazar",
  "Héctor Salazar Fuentes",
  "Paula Andrea León Aguilar",
  "Iván Aguilar Romero",
  "Lucía Romero Guerrero",
  "Emilio Guerrero Cabrera",
];

const POKE_MENU = [
  { name: "Luka Classic", unitPrice: 189 },
  { name: "Spicy Tuna", unitPrice: 199 },
  { name: "Camarón Bowl", unitPrice: 219 },
  { name: "Veggie Bowl", unitPrice: 169 },
  { name: "Salmón Premium", unitPrice: 249 },
  { name: "Pulpo Bowl", unitPrice: 239 },
  { name: "Pollo Teriyaki Bowl", unitPrice: 179 },
];

const DRINK_MENU = [
  { name: "Agua Natural", unitPrice: 25 },
  { name: "Limonada Natural", unitPrice: 45 },
  { name: "Té Verde", unitPrice: 39 },
  { name: "Agua Mineral", unitPrice: 30 },
];

const WASTE_NOTES: Record<string, string[]> = {
  SPOILAGE: [
    "Producto cambió de color, descartado por seguridad",
    "Olor fuera de lo normal al abrir el empaque",
    "Se encontró en mal estado al revisar inventario matutino",
    "No pasó inspección de calidad",
    "Textura comprometida por humedad",
  ],
  OVER_PREP: [
    "Se preparó de más para el turno vespertino",
    "Sobrante de preparación para evento cancelado",
    "Se cortó más de lo requerido por error de cálculo",
    "Excedente de mise en place del día",
  ],
  ACCIDENT: [
    "Se cayó el contenedor durante el traslado",
    "Se derramó al servir",
    "Contenedor roto en refrigeración",
    "Accidente al mover cajas en almacén",
  ],
  EXPIRED: [
    "Fecha de caducidad vencida",
    "Se pasó la fecha de uso recomendada",
    "Producto caducó en almacén, faltó rotación PEPS",
  ],
  OTHER: [
    "Error de etiquetado, no se puede usar",
    "Contaminación cruzada",
    "Devolución de cliente no reutilizable",
  ],
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("=== Luka System — New Modules Seed (Merma, Delivery, Lealtad) ===\n");

  // ------------------------------------------------------------------
  // 0. Query existing data
  // ------------------------------------------------------------------
  const org = await prisma.organization.findFirstOrThrow({ where: { rfc: "LUK240101AAA" } });
  console.log("Organization:", org.name);

  const branchRecords = await prisma.branch.findMany({ where: { organizationId: org.id } });
  if (branchRecords.length === 0) throw new Error("No branches found. Run seed.ts first.");
  console.log("Branches found:", branchRecords.length);

  const productRecords = await prisma.product.findMany({ where: { organizationId: org.id } });
  if (productRecords.length === 0) throw new Error("No products found. Run seed-demo.ts first.");
  console.log("Products found:", productRecords.length);

  const adminUser = await prisma.user.findFirstOrThrow({ where: { email: "admin@lukapoke.com" } });
  console.log("Admin user:", adminUser.email);

  const customers = await prisma.customer.findMany({ where: { organizationId: org.id } });
  if (customers.length === 0) throw new Error("No customers found. Run seed-demo.ts first.");
  console.log("Customers found:", customers.length);

  // ==================================================================
  // 1. WASTE LOGS (MERMA) — 65 records across 30 days
  // ==================================================================
  console.log("\n--- Creating Waste Logs (Merma) ---");

  const existingWaste = await prisma.wasteLog.count({ where: { organizationId: org.id } });
  if (existingWaste > 0) {
    console.log(`  ${existingWaste} waste logs already exist — deleting for fresh seed`);
    await prisma.wasteLog.deleteMany({ where: { organizationId: org.id } });
  }

  const wasteCount = 65;
  let totalWasteCost = 0;
  for (let i = 0; i < wasteCount; i++) {
    const reason = pick(WASTE_REASONS);
    const product = pick(productRecords);
    const branch = pick(branchRecords);
    const quantity = randDec(0.5, 15.0, 2);
    const costPerUnit = Number(product.costPerUnit);
    const cost = parseFloat((quantity * costPerUnit).toFixed(2));
    totalWasteCost += cost;
    const dayOffset = randInt(0, 29);
    const notes = pick(WASTE_NOTES[reason] || WASTE_NOTES["OTHER"]);

    await prisma.wasteLog.create({
      data: {
        organizationId: org.id,
        branchId: branch.id,
        productId: product.id,
        quantity,
        unit: product.unitOfMeasure,
        reason,
        notes,
        cost,
        reportedBy: adminUser.id,
        reportedAt: daysAgo(dayOffset),
      },
    });
  }
  console.log(`  Waste logs created: ${wasteCount}`);
  console.log(`  Total waste cost: $${totalWasteCost.toFixed(2)} MXN`);

  // ==================================================================
  // 2. DELIVERY ORDERS — 85 records across 30 days
  // ==================================================================
  console.log("\n--- Creating Delivery Orders ---");

  const existingDelivery = await prisma.deliveryOrder.count({ where: { organizationId: org.id } });
  if (existingDelivery > 0) {
    console.log(`  ${existingDelivery} delivery orders already exist — deleting for fresh seed`);
    await prisma.deliveryOrder.deleteMany({ where: { organizationId: org.id } });
  }

  const deliveryCount = 85;
  let totalDeliveryRevenue = 0;
  let platformStats: Record<string, number> = {};

  for (let i = 0; i < deliveryCount; i++) {
    const platform = pick(DELIVERY_PLATFORMS_WEIGHTED);
    const status = pick(DELIVERY_STATUSES_WEIGHTED);
    const branch = pick(branchRecords);
    const dayOffset = randInt(0, 29);
    const orderDate = daysAgo(dayOffset);

    // Build items: 1-3 bowls + optional drink
    const numBowls = randInt(1, 3);
    const items: { name: string; qty: number; unitPrice: number }[] = [];
    let subtotal = 0;

    for (let j = 0; j < numBowls; j++) {
      const bowl = pick(POKE_MENU);
      const qty = randInt(1, 2);
      items.push({ name: bowl.name, qty, unitPrice: bowl.unitPrice });
      subtotal += bowl.unitPrice * qty;
    }

    // 60% chance of adding a drink
    if (Math.random() < 0.6) {
      const drink = pick(DRINK_MENU);
      const qty = randInt(1, 2);
      items.push({ name: drink.name, qty, unitPrice: drink.unitPrice });
      subtotal += drink.unitPrice * qty;
    }

    // Clamp subtotal to realistic range
    if (subtotal < 150) subtotal = 150 + randInt(0, 50);
    if (subtotal > 600) subtotal = 600 - randInt(0, 50);

    const deliveryFee = pick([29, 35, 39, 45, 49, 55, 59]);
    const platformFeeRate = PLATFORM_FEE_RATES[platform];
    const platformFee = parseFloat((subtotal * platformFeeRate).toFixed(2));
    const discount = Math.random() < 0.15 ? randInt(20, 60) : 0;
    const total = parseFloat((subtotal + deliveryFee - discount).toFixed(2));
    const netRevenue = parseFloat((total - platformFee).toFixed(2));

    const customerName = pick(CUSTOMER_NAMES);
    const extId = platform === "MANUAL" ? null : `${platform.substring(0, 2)}-${Date.now()}-${i}`;

    platformStats[platform] = (platformStats[platform] || 0) + 1;
    if (status === "DELIVERED") totalDeliveryRevenue += netRevenue;

    await prisma.deliveryOrder.create({
      data: {
        organizationId: org.id,
        branchId: branch.id,
        platform,
        externalOrderId: extId,
        status,
        customerName,
        subtotal,
        deliveryFee,
        platformFee,
        discount,
        total,
        netRevenue,
        orderDate,
        items,
        processedAt:
          status === "DELIVERED" ? new Date(orderDate.getTime() + randInt(20, 60) * 60000) : null,
      },
    });
  }

  console.log(`  Delivery orders created: ${deliveryCount}`);
  console.log(`  Platform distribution:`, platformStats);
  console.log(`  Total net revenue (delivered): $${totalDeliveryRevenue.toFixed(2)} MXN`);

  // --- DeliveryConfig (3 platform configs for first branch) ---
  console.log("\n--- Creating Delivery Configs ---");

  const firstBranch = branchRecords[0];
  const configPlatforms = ["UBEREATS", "RAPPI", "DIDI_FOOD"];
  for (const plat of configPlatforms) {
    await prisma.deliveryConfig.upsert({
      where: {
        organizationId_branchId_platform: {
          organizationId: org.id,
          branchId: firstBranch.id,
          platform: plat,
        },
      },
      update: {},
      create: {
        organizationId: org.id,
        branchId: firstBranch.id,
        platform: plat,
        apiKey: `demo_${plat.toLowerCase()}_api_key_${randInt(1000, 9999)}`,
        storeId: `store_${firstBranch.code}_${plat.toLowerCase()}`,
        isActive: true,
        syncInterval: plat === "UBEREATS" ? 10 : 15,
      },
    });
  }
  console.log(
    `  Delivery configs created for branch: ${firstBranch.name} (${configPlatforms.join(", ")})`,
  );

  // ==================================================================
  // 3. LOYALTY — Program + Rewards + Transactions
  // ==================================================================
  console.log("\n--- Creating Loyalty Program ---");

  const tiers = [
    { name: "Bronce", minPoints: 0, multiplier: 1.0 },
    { name: "Plata", minPoints: 500, multiplier: 1.5 },
    { name: "Oro", minPoints: 2000, multiplier: 2.0 },
  ];

  const loyaltyProgram = await prisma.loyaltyProgram.upsert({
    where: { organizationId: org.id },
    update: { tiers },
    create: {
      organizationId: org.id,
      name: "Luka Rewards",
      pointsPerDollar: 10,
      pointValue: 0.1,
      minRedemption: 100,
      expirationDays: 365,
      isActive: true,
      tiers,
    },
  });
  console.log(`  Loyalty program: ${loyaltyProgram.name} (${tiers.length} tiers)`);

  // --- Loyalty Rewards ---
  console.log("\n--- Creating Loyalty Rewards ---");

  const rewardDefs = [
    {
      name: "Poke Bowl Gratis",
      description: "Canjea por un poke bowl clásico gratis",
      pointsCost: 500,
      category: "PRODUCT",
    },
    {
      name: "Bebida Gratis",
      description: "Cualquier bebida del menú sin costo",
      pointsCost: 150,
      category: "FREEBIE",
    },
    {
      name: "10% Descuento",
      description: "10% de descuento en tu próxima compra",
      pointsCost: 200,
      category: "DISCOUNT",
    },
    {
      name: "Topping Extra Gratis",
      description: "Agrega un topping extra sin costo adicional",
      pointsCost: 100,
      category: "FREEBIE",
    },
    {
      name: "Combo Doble",
      description: "Dos poke bowls al precio de uno y medio",
      pointsCost: 800,
      category: "PRODUCT",
    },
  ];

  // Delete existing rewards to avoid duplicates, then recreate
  const existingRewards = await prisma.loyaltyReward.count({ where: { organizationId: org.id } });
  if (existingRewards > 0) {
    console.log(`  ${existingRewards} rewards already exist — deleting for fresh seed`);
    await prisma.loyaltyReward.deleteMany({ where: { organizationId: org.id } });
  }

  for (const r of rewardDefs) {
    await prisma.loyaltyReward.create({
      data: {
        organizationId: org.id,
        name: r.name,
        description: r.description,
        pointsCost: r.pointsCost,
        category: r.category,
        isActive: true,
      },
    });
  }
  console.log(`  Loyalty rewards created: ${rewardDefs.length}`);

  // --- Loyalty Transactions ---
  console.log("\n--- Creating Loyalty Transactions ---");

  // Delete existing transactions for clean state
  const existingTx = await prisma.loyaltyTransaction.count({ where: { organizationId: org.id } });
  if (existingTx > 0) {
    console.log(`  ${existingTx} loyalty transactions already exist — deleting for fresh seed`);
    await prisma.loyaltyTransaction.deleteMany({ where: { organizationId: org.id } });
  }

  const earnDescriptions = [
    "Compra en sucursal",
    "Pedido delivery",
    "Promoción de temporada",
    "Compra especial fin de semana",
    "Pedido para llevar",
    "Compra con app móvil",
  ];

  const redeemDescriptions = [
    "Canje: Bebida Gratis",
    "Canje: Topping Extra",
    "Canje: 10% Descuento",
    "Canje: Poke Bowl Gratis",
  ];

  let totalTransactions = 0;

  for (const customer of customers) {
    let runningBalance = 0;
    let totalEarned = 0;

    // Generate 3-8 EARN transactions per customer
    const earnCount = randInt(3, 8);
    for (let i = 0; i < earnCount; i++) {
      const points = randInt(50, 300);
      runningBalance += points;
      totalEarned += points;
      const dayOffset = randInt(1, 29);
      const branch = pick(branchRecords);

      await prisma.loyaltyTransaction.create({
        data: {
          organizationId: org.id,
          customerId: customer.id,
          branchId: branch.id,
          type: "EARN",
          points,
          balance: runningBalance,
          description: pick(earnDescriptions),
          referenceType: Math.random() < 0.7 ? "SALE" : "PROMOTION",
          createdAt: daysAgo(dayOffset),
        },
      });
      totalTransactions++;
    }

    // 70% chance of 1-3 REDEEM transactions
    if (Math.random() < 0.7) {
      const redeemCount = randInt(1, 3);
      for (let i = 0; i < redeemCount; i++) {
        const maxRedeem = Math.min(runningBalance, 300);
        if (maxRedeem < 50) break;
        const points = randInt(50, maxRedeem);
        runningBalance -= points;
        const dayOffset = randInt(0, 14);
        const branch = pick(branchRecords);

        await prisma.loyaltyTransaction.create({
          data: {
            organizationId: org.id,
            customerId: customer.id,
            branchId: branch.id,
            type: "REDEEM",
            points: -points,
            balance: runningBalance,
            description: pick(redeemDescriptions),
            referenceType: "MANUAL",
            createdAt: daysAgo(dayOffset),
          },
        });
        totalTransactions++;
      }
    }

    // Determine loyalty tier based on totalEarned
    let loyaltyTier: string;
    let tierEnum: "BRONZE" | "SILVER" | "GOLD";
    if (totalEarned >= 2000) {
      loyaltyTier = "Oro";
      tierEnum = "GOLD";
    } else if (totalEarned >= 500) {
      loyaltyTier = "Plata";
      tierEnum = "SILVER";
    } else {
      loyaltyTier = "Bronce";
      tierEnum = "BRONZE";
    }

    // Update customer with calculated points
    await prisma.customer.update({
      where: { id: customer.id },
      data: {
        loyaltyPoints: runningBalance,
        totalPointsEarned: totalEarned,
        loyaltyTier,
        tier: tierEnum,
      },
    });
  }

  console.log(`  Loyalty transactions created: ${totalTransactions}`);
  console.log(`  Customers updated: ${customers.length}`);

  // --- Summary ---
  console.log("\n=== Seed Summary ===");
  const finalWaste = await prisma.wasteLog.count({ where: { organizationId: org.id } });
  const finalDelivery = await prisma.deliveryOrder.count({ where: { organizationId: org.id } });
  const finalConfigs = await prisma.deliveryConfig.count({ where: { organizationId: org.id } });
  const finalProgram = await prisma.loyaltyProgram.count({ where: { organizationId: org.id } });
  const finalRewards = await prisma.loyaltyReward.count({ where: { organizationId: org.id } });
  const finalTx = await prisma.loyaltyTransaction.count({ where: { organizationId: org.id } });

  console.log(`  Waste Logs:            ${finalWaste}`);
  console.log(`  Delivery Orders:       ${finalDelivery}`);
  console.log(`  Delivery Configs:      ${finalConfigs}`);
  console.log(`  Loyalty Programs:      ${finalProgram}`);
  console.log(`  Loyalty Rewards:       ${finalRewards}`);
  console.log(`  Loyalty Transactions:  ${finalTx}`);

  console.log("\nNew modules seed completed successfully!");
}

main()
  .catch((e) => {
    console.error("Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
