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

function _pickN<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

/** Weighted random selection — weights array must match items length. */
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
// Menu catalog
// ---------------------------------------------------------------------------

interface MenuItem {
  name: string;
  minPrice: number;
  maxPrice: number;
  category: "bowl" | "drink" | "extra" | "appetizer";
}

const MENU_ITEMS: MenuItem[] = [
  // Bowls ($139-$199)
  { name: "Bowl Clásico", minPrice: 139, maxPrice: 159, category: "bowl" },
  { name: "Bowl Premium", minPrice: 179, maxPrice: 199, category: "bowl" },
  { name: "Bowl Vegano", minPrice: 139, maxPrice: 155, category: "bowl" },
  { name: "Bowl Spicy Tuna", minPrice: 169, maxPrice: 189, category: "bowl" },
  { name: "Bowl Salmón", minPrice: 179, maxPrice: 199, category: "bowl" },
  { name: "Bowl Camarón", minPrice: 169, maxPrice: 189, category: "bowl" },
  { name: "Bowl Tropical", minPrice: 149, maxPrice: 169, category: "bowl" },
  { name: "Bowl Kids", minPrice: 99, maxPrice: 119, category: "bowl" },

  // Drinks ($35-$55)
  { name: "Limonada", minPrice: 35, maxPrice: 45, category: "drink" },
  { name: "Agua Natural", minPrice: 25, maxPrice: 35, category: "drink" },
  { name: "Té Verde", minPrice: 40, maxPrice: 55, category: "drink" },
  { name: "Agua de Jamaica", minPrice: 35, maxPrice: 45, category: "drink" },
  { name: "Refresco", minPrice: 30, maxPrice: 40, category: "drink" },
  { name: "Smoothie Mango", minPrice: 55, maxPrice: 65, category: "drink" },

  // Extras ($25-$49)
  { name: "Extra Proteína", minPrice: 35, maxPrice: 49, category: "extra" },
  { name: "Extra Aguacate", minPrice: 25, maxPrice: 35, category: "extra" },
  { name: "Extra Salmón", minPrice: 39, maxPrice: 49, category: "extra" },
  { name: "Arroz Extra", minPrice: 20, maxPrice: 29, category: "extra" },

  // Appetizers ($59-$89)
  { name: "Gyoza (3pzas)", minPrice: 59, maxPrice: 79, category: "appetizer" },
  { name: "Edamame", minPrice: 59, maxPrice: 69, category: "appetizer" },
  { name: "Miso Soup", minPrice: 49, maxPrice: 65, category: "appetizer" },
  { name: "Spring Rolls (4pzas)", minPrice: 69, maxPrice: 89, category: "appetizer" },
];

const PAYMENT_METHODS = ["CASH", "CARD", "TRANSFER", "MIXED"] as const;
const PAYMENT_WEIGHTS = [40, 35, 15, 10];

const CASHIER_NAMES = [
  "María López",
  "Carlos Ruiz",
  "Ana García",
  "Pedro Sánchez",
  "Lucía Martínez",
];

/** Branch codes that receive 1.5x traffic multiplier (high-volume). */
const HIGH_VOLUME_BRANCHES = new Set(["SUC-ANG", "SUC-ROM"]);

/** Branch codes that receive 0.7x traffic multiplier (low-volume). */
const LOW_VOLUME_CODES = new Set(["SUC-INT", "SUC-SAT", "SUC-QRO"]);

// ---------------------------------------------------------------------------
// Sale generation
// ---------------------------------------------------------------------------

interface SaleItem {
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

interface GeneratedSale {
  branchId: string;
  branchCode: string;
  corntechSaleId: string;
  ticketNumber: string;
  saleDate: Date;
  paymentMethod: string;
  items: SaleItem[];
  subtotal: number;
  tax: number;
  total: number;
}

function generateSalesForDay(
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
  if (dayOfWeek === 0 || dayOfWeek === 6) multiplier *= 1.4;

  const numSales = Math.max(1, Math.round(baseSalesPerDay * multiplier + randInt(-1, 1)));
  const dateStr = fmtDate(date);

  const sales: GeneratedSale[] = [];

  for (let s = 0; s < numSales; s++) {
    globalSeq.value++;
    const seq = globalSeq.value;

    // Random time during business hours
    const saleDate = new Date(date);
    saleDate.setHours(randInt(11, 20), randInt(0, 59), randInt(0, 59), 0);

    // Generate 1-4 items, always at least one bowl
    const numItems = randInt(1, 4);
    const bowls = MENU_ITEMS.filter((m) => m.category === "bowl");
    const nonBowls = MENU_ITEMS.filter((m) => m.category !== "bowl");

    const selectedItems: SaleItem[] = [];

    // First item is always a bowl
    const bowl = pick(bowls);
    const bowlQty = randInt(1, 2);
    const bowlPrice = randInt(bowl.minPrice, bowl.maxPrice);
    selectedItems.push({
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
      branchId,
      branchCode,
      corntechSaleId: `CT-${branchCode}-${dateStr}-${String(seq).padStart(5, "0")}`,
      ticketNumber: `T-${String(seq).padStart(6, "0")}`,
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
  console.warn("=== Luka System — Sales Seed (CorntechSale + CorntechCashClosing) ===\n");

  // ==================================================================
  // 0. QUERY EXISTING REFERENCES
  // ==================================================================
  const org = await prisma.organization.findFirstOrThrow({
    where: { rfc: "LUK240101AAA" },
  });
  console.warn("Organization:", org.name);

  const branchRecords = await prisma.branch.findMany({
    where: { organizationId: org.id },
  });
  if (branchRecords.length === 0) throw new Error("No branches found. Run seed.ts first.");

  console.warn(`Branches found: ${branchRecords.length}`);
  for (const b of branchRecords) {
    console.warn(`  ${b.code.padEnd(10)} ${b.name}`);
  }

  // ==================================================================
  // 1. CLEANUP — delete existing Corntech records to allow re-run
  // ==================================================================
  console.warn("\n--- Cleaning up existing Corntech data ---");

  const branchIds = branchRecords.map((b) => b.id);

  const deletedClosings = await prisma.corntechCashClosing.deleteMany({
    where: { branchId: { in: branchIds } },
  });
  console.warn(`  Deleted ${deletedClosings.count} CorntechCashClosing records`);

  const deletedSales = await prisma.corntechSale.deleteMany({
    where: { branchId: { in: branchIds } },
  });
  console.warn(`  Deleted ${deletedSales.count} CorntechSale records`);

  // ==================================================================
  // 2. GENERATE SALES (~2,500 across all branches over 90 days)
  // ==================================================================
  console.warn("\n--- Generating CorntechSale records ---");

  const DAYS = 90;
  // Base sales per branch per day — calibrated so total lands near 2,500
  // With 10 branches, 90 days, and multipliers, baseSales ~3 gives ~2,500
  const BASE_SALES_PER_DAY = 3;

  const allSales: GeneratedSale[] = [];
  const globalSeq = { value: 0 };

  for (const branch of branchRecords) {
    for (let day = 0; day < DAYS; day++) {
      const daySales = generateSalesForDay(
        branch.id,
        branch.code,
        day,
        BASE_SALES_PER_DAY,
        globalSeq,
      );
      allSales.push(...daySales);
    }
  }

  console.warn(`  Generated ${allSales.length} sales in memory`);

  // Insert in batches using createMany for efficiency
  const BATCH_SIZE = 500;
  let inserted = 0;
  for (let i = 0; i < allSales.length; i += BATCH_SIZE) {
    const batch = allSales.slice(i, i + BATCH_SIZE);
    const result = await prisma.corntechSale.createMany({
      data: batch.map((s) => ({
        branchId: s.branchId,
        corntechSaleId: s.corntechSaleId,
        saleDate: s.saleDate,
        ticketNumber: s.ticketNumber,
        subtotal: s.subtotal,
        tax: s.tax,
        total: s.total,
        paymentMethod: s.paymentMethod,
        items: s.items as unknown as any,
      })),
      skipDuplicates: true,
    });
    inserted += result.count;
  }

  console.warn(`  Inserted ${inserted} CorntechSale records`);

  // ==================================================================
  // 3. GENERATE CASH CLOSINGS (1 per branch per day for 90 days)
  // ==================================================================
  console.warn("\n--- Generating CorntechCashClosing records ---");

  // Group sales by branch+date for aggregation
  const salesByBranchDate = new Map<string, GeneratedSale[]>();
  for (const sale of allSales) {
    const dateKey = fmtDate(sale.saleDate);
    const key = `${sale.branchId}|${sale.branchCode}|${dateKey}`;
    if (!salesByBranchDate.has(key)) salesByBranchDate.set(key, []);
    salesByBranchDate.get(key)!.push(sale);
  }

  interface ClosingRecord {
    branchId: string;
    corntechClosingId: string;
    closingDate: Date;
    totalCash: number;
    totalCard: number;
    totalOther: number;
    expectedTotal: number;
    actualTotal: number;
    difference: number;
    cashierName: string;
  }

  const closings: ClosingRecord[] = [];

  // Create a closing for every branch+day, even days with 0 sales
  for (const branch of branchRecords) {
    for (let day = 0; day < DAYS; day++) {
      const date = businessDate(day);
      const dateStr = fmtDate(date);
      const key = `${branch.id}|${branch.code}|${dateStr}`;
      const daySales = salesByBranchDate.get(key) || [];

      let totalCash = 0;
      let totalCard = 0;
      let totalOther = 0;

      for (const sale of daySales) {
        switch (sale.paymentMethod) {
          case "CASH":
            totalCash += sale.total;
            break;
          case "CARD":
            totalCard += sale.total;
            break;
          case "TRANSFER":
            totalOther += sale.total;
            break;
          case "MIXED":
            // Split half-and-half between cash and card
            totalCash += sale.total / 2;
            totalCard += sale.total / 2;
            break;
        }
      }

      totalCash = parseFloat(totalCash.toFixed(2));
      totalCard = parseFloat(totalCard.toFixed(2));
      totalOther = parseFloat(totalOther.toFixed(2));

      const expectedTotal = parseFloat((totalCash + totalCard + totalOther).toFixed(2));
      const variance = randDec(-50, 20);
      const actualTotal = parseFloat((expectedTotal + variance).toFixed(2));
      const difference = parseFloat((actualTotal - expectedTotal).toFixed(2));

      // Closing date at end of business day (21:00)
      const closingDate = new Date(date);
      closingDate.setHours(21, 0, 0, 0);

      closings.push({
        branchId: branch.id,
        corntechClosingId: `CC-${branch.code}-${dateStr}`,
        closingDate,
        totalCash,
        totalCard,
        totalOther,
        expectedTotal,
        actualTotal,
        difference,
        cashierName: pick(CASHIER_NAMES),
      });
    }
  }

  // Insert closings in batches
  let closingsInserted = 0;
  for (let i = 0; i < closings.length; i += BATCH_SIZE) {
    const batch = closings.slice(i, i + BATCH_SIZE);
    const result = await prisma.corntechCashClosing.createMany({
      data: batch,
      skipDuplicates: true,
    });
    closingsInserted += result.count;
  }

  console.warn(`  Inserted ${closingsInserted} CorntechCashClosing records`);

  // ==================================================================
  // 4. SUMMARY
  // ==================================================================
  console.warn("\n=== Sales Seed Summary ===\n");

  const totalRevenue = allSales.reduce((sum, s) => sum + s.total, 0);
  console.warn(`  Total sales:     ${allSales.length}`);
  console.warn(
    `  Total revenue:   $${totalRevenue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
  );
  console.warn(`  Cash closings:   ${closingsInserted}`);
  console.warn(`  Date range:      last ${DAYS} days`);

  // Per-branch breakdown
  console.warn("\n  Per-branch breakdown:");
  console.warn(`  ${"Branch".padEnd(12)} ${"Sales".padStart(7)} ${"Revenue".padStart(14)}`);
  console.warn(`  ${"─".repeat(12)} ${"─".repeat(7)} ${"─".repeat(14)}`);

  const branchSales = new Map<string, { count: number; revenue: number }>();
  for (const sale of allSales) {
    const existing = branchSales.get(sale.branchCode) || { count: 0, revenue: 0 };
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
    console.warn(`  ${code.padEnd(12)} ${String(data.count).padStart(7)} $${rev.padStart(13)}`);
  }

  // Payment method breakdown
  console.warn("\n  Payment method breakdown:");
  const paymentCounts = new Map<string, number>();
  for (const sale of allSales) {
    paymentCounts.set(sale.paymentMethod, (paymentCounts.get(sale.paymentMethod) || 0) + 1);
  }
  for (const [method, count] of paymentCounts.entries()) {
    const pct = ((count / allSales.length) * 100).toFixed(1);
    console.warn(`  ${method.padEnd(12)} ${String(count).padStart(6)} (${pct}%)`);
  }

  console.warn("\nSales seed completed successfully!");
}

main()
  .catch((e) => {
    console.error("Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
