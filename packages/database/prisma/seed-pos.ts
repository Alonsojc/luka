import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Helpers (same pattern as seed-sales.ts)
// ---------------------------------------------------------------------------

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: T[]): T {
  return arr[randInt(0, arr.length - 1)];
}

function weightedPick<T>(items: T[], weights: number[]): T {
  const total = weights.reduce((s, w) => s + w, 0);
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

/** Format a Date as YYYYMMDD string. */
function fmtDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${dd}`;
}

/** Build a Date for N days ago with a random business-hour time (11:00-21:00). */
function businessDate(daysAgo: number): Date {
  const d = new Date("2026-04-09T12:00:00Z");
  d.setDate(d.getDate() - daysAgo);
  d.setHours(randInt(11, 20), randInt(0, 59), randInt(0, 59), 0);
  return d;
}

// ---------------------------------------------------------------------------
// Menu catalog (realistic poke items)
// ---------------------------------------------------------------------------

interface MenuItem {
  sku: string;
  name: string;
  minPrice: number;
  maxPrice: number;
  category: "bowl" | "drink" | "extra" | "appetizer";
}

const MENU_ITEMS: MenuItem[] = [
  // Bowls ($139-$199)
  { sku: "BOW-CLA", name: "Bowl Clasico", minPrice: 139, maxPrice: 159, category: "bowl" },
  { sku: "BOW-PRE", name: "Bowl Premium", minPrice: 179, maxPrice: 199, category: "bowl" },
  { sku: "BOW-VEG", name: "Bowl Vegano", minPrice: 139, maxPrice: 155, category: "bowl" },
  { sku: "BOW-SPT", name: "Bowl Spicy Tuna", minPrice: 169, maxPrice: 189, category: "bowl" },
  { sku: "BOW-SAL", name: "Bowl Salmon", minPrice: 179, maxPrice: 199, category: "bowl" },
  { sku: "BOW-CAM", name: "Bowl Camaron", minPrice: 169, maxPrice: 189, category: "bowl" },
  { sku: "BOW-TRO", name: "Bowl Tropical", minPrice: 149, maxPrice: 169, category: "bowl" },
  { sku: "BOW-KID", name: "Bowl Kids", minPrice: 99, maxPrice: 119, category: "bowl" },

  // Drinks ($25-$65)
  { sku: "BEB-LIM", name: "Limonada", minPrice: 35, maxPrice: 45, category: "drink" },
  { sku: "BEB-AGU", name: "Agua Natural", minPrice: 25, maxPrice: 35, category: "drink" },
  { sku: "BEB-TEV", name: "Te Verde", minPrice: 40, maxPrice: 55, category: "drink" },
  { sku: "BEB-JAM", name: "Agua de Jamaica", minPrice: 35, maxPrice: 45, category: "drink" },
  { sku: "BEB-REF", name: "Refresco", minPrice: 30, maxPrice: 40, category: "drink" },
  { sku: "BEB-SMO", name: "Smoothie Mango", minPrice: 55, maxPrice: 65, category: "drink" },

  // Extras ($20-$49)
  { sku: "EXT-PRO", name: "Extra Proteina", minPrice: 35, maxPrice: 49, category: "extra" },
  { sku: "EXT-AGU", name: "Extra Aguacate", minPrice: 25, maxPrice: 35, category: "extra" },
  { sku: "EXT-SAL", name: "Extra Salmon", minPrice: 39, maxPrice: 49, category: "extra" },
  { sku: "EXT-ARR", name: "Arroz Extra", minPrice: 20, maxPrice: 29, category: "extra" },

  // Appetizers ($49-$89)
  { sku: "APE-GYO", name: "Gyoza (3pzas)", minPrice: 59, maxPrice: 79, category: "appetizer" },
  { sku: "APE-EDA", name: "Edamame", minPrice: 59, maxPrice: 69, category: "appetizer" },
  { sku: "APE-MIS", name: "Miso Soup", minPrice: 49, maxPrice: 65, category: "appetizer" },
  {
    sku: "APE-SPR",
    name: "Spring Rolls (4pzas)",
    minPrice: 69,
    maxPrice: 89,
    category: "appetizer",
  },
];

const PAYMENT_METHODS = ["CASH", "CARD", "TRANSFER"] as const;
const PAYMENT_WEIGHTS = [40, 35, 25]; // 40% CASH, 35% CARD, 25% TRANSFER

const TERMINALS = ["TERM-01", "TERM-02"];

/** Branch codes that receive higher traffic. */
const HIGH_VOLUME_BRANCHES = new Set(["SUC-ANG", "SUC-ROM"]);

/** Branch codes that receive lower traffic. */
const LOW_VOLUME_CODES = new Set(["SUC-INT", "SUC-SAT", "SUC-QRO"]);

// ---------------------------------------------------------------------------
// Sale generation
// ---------------------------------------------------------------------------

interface SaleItemData {
  sku: string;
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

interface GeneratedSale {
  organizationId: string;
  branchId: string;
  branchCode: string;
  posTerminalId: string;
  ticketNumber: string;
  saleDate: Date;
  paymentMethod: string;
  items: SaleItemData[];
  subtotal: number;
  tax: number;
  total: number;
}

function generateSalesForDay(
  organizationId: string,
  branchId: string,
  branchCode: string,
  dayOffset: number,
  baseSalesPerDay: number,
  globalSeq: { value: number },
): GeneratedSale[] {
  const date = businessDate(dayOffset);
  const dayOfWeek = date.getDay(); // 0=Sun, 6=Sat

  // Volume multipliers
  let multiplier = 1.0;
  if (HIGH_VOLUME_BRANCHES.has(branchCode)) multiplier *= 1.5;
  else if (LOW_VOLUME_CODES.has(branchCode)) multiplier *= 0.7;
  if (dayOfWeek === 0 || dayOfWeek === 6) multiplier *= 1.3;

  const numSales = Math.max(1, Math.round(baseSalesPerDay * multiplier + randInt(-2, 2)));

  const sales: GeneratedSale[] = [];
  const bowls = MENU_ITEMS.filter((m) => m.category === "bowl");
  const nonBowls = MENU_ITEMS.filter((m) => m.category !== "bowl");

  for (let s = 0; s < numSales; s++) {
    globalSeq.value++;
    const seq = globalSeq.value;

    // Random time during business hours
    const saleDate = new Date(date);
    saleDate.setHours(randInt(11, 20), randInt(0, 59), randInt(0, 59), 0);

    // Generate 1-5 items, always at least one bowl
    const numItems = randInt(1, 5);
    const selectedItems: SaleItemData[] = [];

    // First item is always a bowl
    const bowl = pick(bowls);
    const bowlQty = randInt(1, 2);
    const bowlPrice = randInt(bowl.minPrice, bowl.maxPrice);
    selectedItems.push({
      sku: bowl.sku,
      name: bowl.name,
      quantity: bowlQty,
      unitPrice: bowlPrice,
      total: bowlQty * bowlPrice,
    });

    // Remaining items from the full menu
    for (let i = 1; i < numItems; i++) {
      const item = pick(nonBowls);
      const qty = randInt(1, 2);
      const price = randInt(item.minPrice, item.maxPrice);
      selectedItems.push({
        sku: item.sku,
        name: item.name,
        quantity: qty,
        unitPrice: price,
        total: qty * price,
      });
    }

    const subtotal = selectedItems.reduce((sum, it) => sum + it.total, 0);
    const tax = parseFloat((subtotal * 0.16).toFixed(2));
    const total = parseFloat((subtotal + tax).toFixed(2));
    const paymentMethod = weightedPick([...PAYMENT_METHODS], PAYMENT_WEIGHTS);

    sales.push({
      organizationId,
      branchId,
      branchCode,
      posTerminalId: pick(TERMINALS),
      ticketNumber: `POS-${String(seq).padStart(5, "0")}`,
      saleDate,
      paymentMethod,
      items: selectedItems,
      subtotal,
      tax,
      total,
    });
  }

  return sales;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("=== Luka System — POS Seed (PosSale + PosSaleItem + PosSyncLog) ===\n");

  // ==================================================================
  // 0. QUERY EXISTING REFERENCES
  // ==================================================================
  const org = await prisma.organization.findFirstOrThrow({
    where: { rfc: "LUK240101AAA" },
  });
  console.log("Organization:", org.name);

  const branchRecords = await prisma.branch.findMany({
    where: { organizationId: org.id },
  });
  if (branchRecords.length === 0) throw new Error("No branches found. Run seed.ts first.");

  console.log(`Branches found: ${branchRecords.length}`);
  for (const b of branchRecords) {
    console.log(`  ${b.code.padEnd(10)} ${b.name}`);
  }

  // ==================================================================
  // 1. UPDATE BRANCHES WITH corntechBranchId MAPPING
  // ==================================================================
  console.log("\n--- Updating branches with corntechBranchId ---");

  for (const branch of branchRecords) {
    const corntechBranchId = `CT-${branch.code}`;
    await prisma.branch.update({
      where: { id: branch.id },
      data: { corntechBranchId },
    });
    console.log(`  ${branch.code} -> ${corntechBranchId}`);
  }

  // ==================================================================
  // 2. CLEANUP — delete existing POS records (items first due to FK)
  // ==================================================================
  console.log("\n--- Cleaning up existing POS data ---");

  const branchIds = branchRecords.map((b) => b.id);

  const deletedItems = await prisma.posSaleItem.deleteMany({
    where: { sale: { branchId: { in: branchIds } } },
  });
  console.log(`  Deleted ${deletedItems.count} PosSaleItem records`);

  const deletedSales = await prisma.posSale.deleteMany({
    where: { branchId: { in: branchIds } },
  });
  console.log(`  Deleted ${deletedSales.count} PosSale records`);

  const deletedLogs = await prisma.posSyncLog.deleteMany({
    where: { branchId: { in: branchIds } },
  });
  console.log(`  Deleted ${deletedLogs.count} PosSyncLog records`);

  // ==================================================================
  // 3. GENERATE SALES (~500 across all branches over 7 days)
  // ==================================================================
  console.log("\n--- Generating PosSale records ---");

  const DAYS = 7;
  // With ~10 branches, 7 days, baseSales ~7 => ~490-510 total
  const BASE_SALES_PER_DAY = 7;

  const allSales: GeneratedSale[] = [];
  const globalSeq = { value: 0 };

  for (const branch of branchRecords) {
    for (let day = 0; day < DAYS; day++) {
      const daySales = generateSalesForDay(
        org.id,
        branch.id,
        branch.code,
        day,
        BASE_SALES_PER_DAY,
        globalSeq,
      );
      allSales.push(...daySales);
    }
  }

  console.log(`  Generated ${allSales.length} sales in memory`);

  // Insert sales using createMany (without items — items added separately)
  const BATCH_SIZE = 200;
  let salesInserted = 0;

  // We need to create sales individually to get IDs back for items,
  // OR use createMany then query back. For efficiency, use createMany
  // then create items by ticket lookup.

  // Strategy: createMany for PosSale, then bulk-create items.
  // We'll store the ticket numbers for lookup.

  for (let i = 0; i < allSales.length; i += BATCH_SIZE) {
    const batch = allSales.slice(i, i + BATCH_SIZE);
    const result = await prisma.posSale.createMany({
      data: batch.map((s) => ({
        organizationId: s.organizationId,
        branchId: s.branchId,
        posTerminalId: s.posTerminalId,
        ticketNumber: s.ticketNumber,
        saleDate: s.saleDate,
        subtotal: s.subtotal,
        tax: s.tax,
        total: s.total,
        paymentMethod: s.paymentMethod,
        rawData: { terminal: s.posTerminalId, source: "seed" },
      })),
      skipDuplicates: true,
    });
    salesInserted += result.count;
  }

  console.log(`  Inserted ${salesInserted} PosSale records`);

  // ==================================================================
  // 4. CREATE PosSaleItem RECORDS
  // ==================================================================
  console.log("\n--- Creating PosSaleItem records ---");

  // Query back all created sales to get their IDs
  const createdSales = await prisma.posSale.findMany({
    where: { branchId: { in: branchIds } },
    select: { id: true, ticketNumber: true },
  });

  // Build a map: ticketNumber -> saleId
  const saleIdMap = new Map<string, string>();
  for (const sale of createdSales) {
    saleIdMap.set(sale.ticketNumber, sale.id);
  }

  // Build all items
  const allItems: Array<{
    saleId: string;
    productSku: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }> = [];

  for (const sale of allSales) {
    const saleId = saleIdMap.get(sale.ticketNumber);
    if (!saleId) continue;

    for (const item of sale.items) {
      allItems.push({
        saleId,
        productSku: item.sku,
        productName: item.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        total: item.total,
      });
    }
  }

  let itemsInserted = 0;
  for (let i = 0; i < allItems.length; i += BATCH_SIZE) {
    const batch = allItems.slice(i, i + BATCH_SIZE);
    const result = await prisma.posSaleItem.createMany({
      data: batch,
      skipDuplicates: true,
    });
    itemsInserted += result.count;
  }

  console.log(`  Inserted ${itemsInserted} PosSaleItem records`);

  // ==================================================================
  // 5. CREATE PosSyncLog RECORDS (1 SUCCESS per branch per day)
  // ==================================================================
  console.log("\n--- Creating PosSyncLog records ---");

  // Group sales by branch+day to get counts
  const salesByBranchDay = new Map<string, number>();
  for (const sale of allSales) {
    const dateStr = fmtDate(sale.saleDate);
    const key = `${sale.branchId}|${dateStr}`;
    salesByBranchDay.set(key, (salesByBranchDay.get(key) || 0) + 1);
  }

  const syncLogs: Array<{
    organizationId: string;
    branchId: string;
    syncType: string;
    status: string;
    recordsTotal: number;
    recordsSynced: number;
    recordsFailed: number;
    startedAt: Date;
    completedAt: Date;
  }> = [];

  for (const branch of branchRecords) {
    for (let day = 0; day < DAYS; day++) {
      const date = businessDate(day);
      const dateStr = fmtDate(date);
      const key = `${branch.id}|${dateStr}`;
      const salesCount = salesByBranchDay.get(key) || 0;

      // Sync happened at end of business day
      const startedAt = new Date(date);
      startedAt.setHours(21, 0, 0, 0);
      const completedAt = new Date(startedAt);
      completedAt.setMinutes(completedAt.getMinutes() + randInt(1, 5));

      syncLogs.push({
        organizationId: org.id,
        branchId: branch.id,
        syncType: "SALES",
        status: "SUCCESS",
        recordsTotal: salesCount,
        recordsSynced: salesCount,
        recordsFailed: 0,
        startedAt,
        completedAt,
      });
    }
  }

  const syncResult = await prisma.posSyncLog.createMany({
    data: syncLogs,
    skipDuplicates: true,
  });

  console.log(`  Inserted ${syncResult.count} PosSyncLog records`);

  // ==================================================================
  // 6. SUMMARY
  // ==================================================================
  console.log("\n=== POS Seed Summary ===\n");

  const totalRevenue = allSales.reduce((sum, s) => sum + s.total, 0);
  console.log(`  Total sales:       ${allSales.length}`);
  console.log(`  Total items:       ${itemsInserted}`);
  console.log(
    `  Total revenue:     $${totalRevenue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
  );
  console.log(`  Sync logs:         ${syncResult.count}`);
  console.log(`  Date range:        last ${DAYS} days`);

  // Per-branch breakdown
  console.log("\n  Per-branch breakdown:");
  console.log(`  ${"Branch".padEnd(12)} ${"Sales".padStart(7)} ${"Revenue".padStart(14)}`);
  console.log(`  ${"─".repeat(12)} ${"─".repeat(7)} ${"─".repeat(14)}`);

  const branchSales = new Map<string, { count: number; revenue: number }>();
  for (const sale of allSales) {
    const existing = branchSales.get(sale.branchCode) || {
      count: 0,
      revenue: 0,
    };
    existing.count++;
    existing.revenue += sale.total;
    branchSales.set(sale.branchCode, existing);
  }

  const sorted = [...branchSales.entries()].sort((a, b) => b[1].revenue - a[1].revenue);
  for (const [code, data] of sorted) {
    const rev = data.revenue.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    console.log(`  ${code.padEnd(12)} ${String(data.count).padStart(7)} $${rev.padStart(13)}`);
  }

  // Payment method breakdown
  console.log("\n  Payment method breakdown:");
  const paymentCounts = new Map<string, number>();
  for (const sale of allSales) {
    paymentCounts.set(sale.paymentMethod, (paymentCounts.get(sale.paymentMethod) || 0) + 1);
  }
  for (const [method, count] of paymentCounts.entries()) {
    const pct = ((count / allSales.length) * 100).toFixed(1);
    console.log(`  ${method.padEnd(12)} ${String(count).padStart(6)} (${pct}%)`);
  }

  console.log("\nPOS seed completed successfully!");
}

main()
  .catch((e) => {
    console.error("Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
