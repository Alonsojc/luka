import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Return a random integer between min and max (inclusive). */
function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Return a random decimal with 4 fractional digits between min and max. */
function randDec(min: number, max: number): number {
  return parseFloat((Math.random() * (max - min) + min).toFixed(4));
}

/** Pick a random element from an array. */
function pick<T>(arr: T[]): T {
  return arr[randInt(0, arr.length - 1)];
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.warn("=== Luka System — Demo Data Seed ===\n");

  // ------------------------------------------------------------------
  // 0. Look up existing records created by seed.ts
  // ------------------------------------------------------------------
  const org = await prisma.organization.findFirstOrThrow({ where: { rfc: "LUK240101AAA" } });
  console.warn("Organization found:", org.name);

  const branchRecords = await prisma.branch.findMany({ where: { organizationId: org.id } });
  const branches: Record<string, string> = {};
  for (const b of branchRecords) {
    branches[b.code] = b.id;
  }
  console.warn("Branches found:", Object.keys(branches).length);

  const categoryRecords = await prisma.productCategory.findMany({
    where: { organizationId: org.id },
  });
  const categories: Record<string, string> = {};
  for (const c of categoryRecords) {
    categories[c.name] = c.id;
  }
  console.warn("Categories found:", Object.keys(categories).length);

  const adminUser = await prisma.user.findFirstOrThrow({ where: { email: "admin@lukapoke.com" } });
  console.warn("Admin user found:", adminUser.email);

  const accountRecords = await prisma.accountCatalog.findMany({
    where: { organizationId: org.id },
  });
  const accounts: Record<string, string> = {};
  for (const a of accountRecords) {
    accounts[a.code] = a.id;
  }
  console.warn("Accounts found:", Object.keys(accounts).length);

  // ------------------------------------------------------------------
  // 1. PRODUCTS (~33 items)
  // ------------------------------------------------------------------
  console.warn("\n--- Creating Products ---");

  const productDefs = [
    // Proteínas
    {
      sku: "PROT-001",
      name: "Salmón Fresco",
      cat: "Proteínas",
      unit: "kg",
      cost: 380,
      claveUnidad: "KGM",
      claveProd: "50181900",
    },
    {
      sku: "PROT-002",
      name: "Atún Fresco",
      cat: "Proteínas",
      unit: "kg",
      cost: 420,
      claveUnidad: "KGM",
      claveProd: "50181900",
    },
    {
      sku: "PROT-003",
      name: "Camarón Cocido",
      cat: "Proteínas",
      unit: "kg",
      cost: 280,
      claveUnidad: "KGM",
      claveProd: "50181900",
    },
    {
      sku: "PROT-004",
      name: "Pulpo Cocido",
      cat: "Proteínas",
      unit: "kg",
      cost: 350,
      claveUnidad: "KGM",
      claveProd: "50181900",
    },
    {
      sku: "PROT-005",
      name: "Pollo Teriyaki",
      cat: "Proteínas",
      unit: "kg",
      cost: 120,
      claveUnidad: "KGM",
      claveProd: "50181900",
    },
    {
      sku: "PROT-006",
      name: "Tofu Firme",
      cat: "Proteínas",
      unit: "kg",
      cost: 85,
      claveUnidad: "KGM",
      claveProd: "50181900",
    },
    // Bases
    {
      sku: "BASE-001",
      name: "Arroz Sushi",
      cat: "Bases",
      unit: "kg",
      cost: 35,
      claveUnidad: "KGM",
      claveProd: "50181900",
    },
    {
      sku: "BASE-002",
      name: "Arroz Integral",
      cat: "Bases",
      unit: "kg",
      cost: 38,
      claveUnidad: "KGM",
      claveProd: "50181900",
    },
    {
      sku: "BASE-003",
      name: "Lechuga Mixta",
      cat: "Bases",
      unit: "kg",
      cost: 45,
      claveUnidad: "KGM",
      claveProd: "50181900",
    },
    {
      sku: "BASE-004",
      name: "Base Mixta",
      cat: "Bases",
      unit: "kg",
      cost: 40,
      claveUnidad: "KGM",
      claveProd: "50181900",
    },
    // Toppings
    {
      sku: "TOP-001",
      name: "Edamame",
      cat: "Toppings",
      unit: "kg",
      cost: 95,
      claveUnidad: "KGM",
      claveProd: "50181900",
    },
    {
      sku: "TOP-002",
      name: "Pepino",
      cat: "Toppings",
      unit: "kg",
      cost: 25,
      claveUnidad: "KGM",
      claveProd: "50181900",
    },
    {
      sku: "TOP-003",
      name: "Mango",
      cat: "Toppings",
      unit: "kg",
      cost: 40,
      claveUnidad: "KGM",
      claveProd: "50181900",
    },
    {
      sku: "TOP-004",
      name: "Aguacate",
      cat: "Toppings",
      unit: "kg",
      cost: 80,
      claveUnidad: "KGM",
      claveProd: "50181900",
    },
    {
      sku: "TOP-005",
      name: "Zanahoria Rallada",
      cat: "Toppings",
      unit: "kg",
      cost: 18,
      claveUnidad: "KGM",
      claveProd: "50181900",
    },
    {
      sku: "TOP-006",
      name: "Elote Desgranado",
      cat: "Toppings",
      unit: "kg",
      cost: 22,
      claveUnidad: "KGM",
      claveProd: "50181900",
    },
    {
      sku: "TOP-007",
      name: "Cebolla Morada",
      cat: "Toppings",
      unit: "kg",
      cost: 15,
      claveUnidad: "KGM",
      claveProd: "50181900",
    },
    {
      sku: "TOP-008",
      name: "Masago",
      cat: "Toppings",
      unit: "kg",
      cost: 520,
      claveUnidad: "KGM",
      claveProd: "50181900",
    },
    {
      sku: "TOP-009",
      name: "Ajonjolí",
      cat: "Toppings",
      unit: "kg",
      cost: 60,
      claveUnidad: "KGM",
      claveProd: "50181900",
    },
    {
      sku: "TOP-010",
      name: "Surimi",
      cat: "Toppings",
      unit: "kg",
      cost: 75,
      claveUnidad: "KGM",
      claveProd: "50181900",
    },
    {
      sku: "TOP-011",
      name: "Wonton Crujiente",
      cat: "Toppings",
      unit: "kg",
      cost: 90,
      claveUnidad: "KGM",
      claveProd: "50181900",
    },
    // Salsas
    {
      sku: "SAL-001",
      name: "Salsa Ponzu",
      cat: "Salsas",
      unit: "lt",
      cost: 85,
      claveUnidad: "LTR",
      claveProd: "50181900",
    },
    {
      sku: "SAL-002",
      name: "Sriracha Mayo",
      cat: "Salsas",
      unit: "lt",
      cost: 65,
      claveUnidad: "LTR",
      claveProd: "50181900",
    },
    {
      sku: "SAL-003",
      name: "Salsa Teriyaki",
      cat: "Salsas",
      unit: "lt",
      cost: 70,
      claveUnidad: "LTR",
      claveProd: "50181900",
    },
    {
      sku: "SAL-004",
      name: "Salsa Soya",
      cat: "Salsas",
      unit: "lt",
      cost: 45,
      claveUnidad: "LTR",
      claveProd: "50181900",
    },
    {
      sku: "SAL-005",
      name: "Salsa Anguila",
      cat: "Salsas",
      unit: "lt",
      cost: 110,
      claveUnidad: "LTR",
      claveProd: "50181900",
    },
    // Bebidas
    {
      sku: "BEB-001",
      name: "Agua Natural 500ml",
      cat: "Bebidas",
      unit: "pza",
      cost: 3.5,
      claveUnidad: "H87",
      claveProd: "15101500",
    },
    {
      sku: "BEB-002",
      name: "Agua Mineral 355ml",
      cat: "Bebidas",
      unit: "pza",
      cost: 8,
      claveUnidad: "H87",
      claveProd: "15101500",
    },
    {
      sku: "BEB-003",
      name: "Té Verde Embotellado",
      cat: "Bebidas",
      unit: "pza",
      cost: 18,
      claveUnidad: "H87",
      claveProd: "15101500",
    },
    {
      sku: "BEB-004",
      name: "Limonada Natural",
      cat: "Bebidas",
      unit: "lt",
      cost: 25,
      claveUnidad: "LTR",
      claveProd: "15101500",
    },
    // Empaques
    {
      sku: "EMP-001",
      name: "Bowl Craft 16oz",
      cat: "Empaques",
      unit: "pza",
      cost: 4.5,
      claveUnidad: "H87",
      claveProd: "24112700",
    },
    {
      sku: "EMP-002",
      name: "Palillos Desechables",
      cat: "Empaques",
      unit: "pza",
      cost: 0.8,
      claveUnidad: "H87",
      claveProd: "24112700",
    },
    {
      sku: "EMP-003",
      name: "Bolsa Kraft",
      cat: "Empaques",
      unit: "pza",
      cost: 2.5,
      claveUnidad: "H87",
      claveProd: "24112700",
    },
  ];

  const products: Record<string, string> = {};
  for (const p of productDefs) {
    const prod = await prisma.product.upsert({
      where: { organizationId_sku: { organizationId: org.id, sku: p.sku } },
      update: {},
      create: {
        organizationId: org.id,
        sku: p.sku,
        name: p.name,
        categoryId: categories[p.cat] ?? null,
        unitOfMeasure: p.unit,
        costPerUnit: p.cost,
        satClaveUnidad: p.claveUnidad,
        satClaveProdServ: p.claveProd,
      },
    });
    products[p.sku] = prod.id;
  }
  console.warn(`Products created: ${Object.keys(products).length}`);

  // ------------------------------------------------------------------
  // 2. RECIPES (4 poke bowls)
  // ------------------------------------------------------------------
  console.warn("\n--- Creating Recipes ---");

  const recipeDefs = [
    {
      name: "Luka Classic",
      yield: 1,
      unit: "pza",
      sellingPrice: 189,
      ingredients: [
        { sku: "PROT-001", qty: 0.15, unit: "kg", waste: 5 },
        { sku: "BASE-001", qty: 0.2, unit: "kg", waste: 0 },
        { sku: "TOP-001", qty: 0.03, unit: "kg", waste: 0 },
        { sku: "TOP-002", qty: 0.04, unit: "kg", waste: 0 },
        { sku: "TOP-004", qty: 0.05, unit: "kg", waste: 0 },
        { sku: "SAL-001", qty: 0.03, unit: "lt", waste: 0 },
      ],
    },
    {
      name: "Spicy Tuna",
      yield: 1,
      unit: "pza",
      sellingPrice: 199,
      ingredients: [
        { sku: "PROT-002", qty: 0.15, unit: "kg", waste: 5 },
        { sku: "BASE-001", qty: 0.2, unit: "kg", waste: 0 },
        { sku: "TOP-003", qty: 0.04, unit: "kg", waste: 0 },
        { sku: "TOP-005", qty: 0.03, unit: "kg", waste: 0 },
        { sku: "TOP-008", qty: 0.02, unit: "kg", waste: 0 },
        { sku: "SAL-002", qty: 0.03, unit: "lt", waste: 0 },
      ],
    },
    {
      name: "Camarón Bowl",
      yield: 1,
      unit: "pza",
      sellingPrice: 219,
      ingredients: [
        { sku: "PROT-003", qty: 0.12, unit: "kg", waste: 0 },
        { sku: "BASE-002", qty: 0.2, unit: "kg", waste: 0 },
        { sku: "TOP-006", qty: 0.04, unit: "kg", waste: 0 },
        { sku: "TOP-007", qty: 0.03, unit: "kg", waste: 0 },
        { sku: "TOP-004", qty: 0.04, unit: "kg", waste: 0 },
        { sku: "SAL-003", qty: 0.03, unit: "lt", waste: 0 },
      ],
    },
    {
      name: "Veggie Bowl",
      yield: 1,
      unit: "pza",
      sellingPrice: 169,
      ingredients: [
        { sku: "PROT-006", qty: 0.1, unit: "kg", waste: 0 },
        { sku: "BASE-003", qty: 0.15, unit: "kg", waste: 0 },
        { sku: "TOP-001", qty: 0.04, unit: "kg", waste: 0 },
        { sku: "TOP-002", qty: 0.04, unit: "kg", waste: 0 },
        { sku: "TOP-003", qty: 0.03, unit: "kg", waste: 0 },
        { sku: "TOP-004", qty: 0.05, unit: "kg", waste: 0 },
        { sku: "SAL-001", qty: 0.03, unit: "lt", waste: 0 },
      ],
    },
  ];

  for (const r of recipeDefs) {
    // Check if recipe already exists (by name + org)
    const existing = await prisma.recipe.findFirst({
      where: { organizationId: org.id, menuItemName: r.name },
    });
    if (existing) {
      console.warn(`  Recipe "${r.name}" already exists — skipping`);
      continue;
    }

    await prisma.recipe.create({
      data: {
        organizationId: org.id,
        menuItemName: r.name,
        yieldQuantity: r.yield,
        yieldUnit: r.unit,
        sellingPrice: r.sellingPrice,
        ingredients: {
          create: r.ingredients.map((ing) => ({
            productId: products[ing.sku],
            quantity: ing.qty,
            unitOfMeasure: ing.unit,
            wastePercentage: ing.waste,
          })),
        },
      },
    });
    console.warn(`  Recipe created: ${r.name}`);
  }

  // ------------------------------------------------------------------
  // 2b. PRODUCT PRESENTATIONS
  // ------------------------------------------------------------------
  console.warn("\n--- Creating Product Presentations ---");

  const presentationDefs: Array<{
    sku: string;
    presentations: Array<{
      name: string;
      conversionFactor: number;
      conversionUnit: string;
      purchasePrice?: number;
      salePrice?: number;
      isDefault?: boolean;
      barcode?: string;
    }>;
  }> = [
    {
      sku: "PROT-002", // Atún Fresco
      presentations: [
        {
          name: "Bolsa 1kg",
          conversionFactor: 1.0,
          conversionUnit: "kg",
          purchasePrice: 420,
          salePrice: 520,
          isDefault: true,
          barcode: "7501234000101",
        },
        {
          name: "Bolsa 500g",
          conversionFactor: 0.5,
          conversionUnit: "kg",
          purchasePrice: 215,
          salePrice: 270,
          barcode: "7501234000102",
        },
        {
          name: "Pieza ~200g",
          conversionFactor: 0.2,
          conversionUnit: "kg",
          purchasePrice: 90,
          salePrice: 115,
          barcode: "7501234000103",
        },
      ],
    },
    {
      sku: "PROT-001", // Salmón Fresco
      presentations: [
        {
          name: "Filete 1kg",
          conversionFactor: 1.0,
          conversionUnit: "kg",
          purchasePrice: 380,
          salePrice: 480,
          isDefault: true,
          barcode: "7501234000201",
        },
        {
          name: "Filete 500g",
          conversionFactor: 0.5,
          conversionUnit: "kg",
          purchasePrice: 195,
          salePrice: 250,
          barcode: "7501234000202",
        },
      ],
    },
    {
      sku: "BASE-001", // Arroz Sushi
      presentations: [
        {
          name: "Saco 25kg",
          conversionFactor: 25.0,
          conversionUnit: "kg",
          purchasePrice: 800,
          salePrice: 950,
          isDefault: true,
          barcode: "7501234000301",
        },
        {
          name: "Bolsa 5kg",
          conversionFactor: 5.0,
          conversionUnit: "kg",
          purchasePrice: 170,
          salePrice: 200,
          barcode: "7501234000302",
        },
        {
          name: "Bolsa 1kg",
          conversionFactor: 1.0,
          conversionUnit: "kg",
          purchasePrice: 35,
          salePrice: 45,
          barcode: "7501234000303",
        },
      ],
    },
  ];

  for (const pDef of presentationDefs) {
    const productId = products[pDef.sku];
    if (!productId) {
      console.warn(`  Product ${pDef.sku} not found — skipping presentations`);
      continue;
    }

    for (const pres of pDef.presentations) {
      const existing = await prisma.productPresentation.findFirst({
        where: { productId, name: pres.name },
      });
      if (existing) {
        console.warn(`  Presentation "${pres.name}" for ${pDef.sku} already exists — skipping`);
        continue;
      }
      await prisma.productPresentation.create({
        data: {
          productId,
          name: pres.name,
          conversionFactor: pres.conversionFactor,
          conversionUnit: pres.conversionUnit,
          purchasePrice: pres.purchasePrice,
          salePrice: pres.salePrice,
          isDefault: pres.isDefault ?? false,
          barcode: pres.barcode,
        },
      });
      console.warn(`  Presentation created: ${pres.name} for ${pDef.sku}`);
    }
  }

  // ------------------------------------------------------------------
  // 3. SUPPLIERS (6)
  // ------------------------------------------------------------------
  console.warn("\n--- Creating Suppliers ---");

  const supplierDefs = [
    {
      name: "Pescadería del Pacífico",
      rfc: "PPB201015ABC",
      contact: "Roberto Mares",
      email: "ventas@pescaderiadelpacifico.mx",
      phone: "3331234567",
      payDays: 15,
      rating: 5,
    },
    {
      name: "Distribuidora Yakimeshi",
      rfc: "DYA190322XYZ",
      contact: "Kenji Tanaka",
      email: "pedidos@yakimeshi.mx",
      phone: "5549876543",
      payDays: 30,
      rating: 4,
    },
    {
      name: "Verduras Frescas de Jalisco",
      rfc: "VFJ180601MNO",
      contact: "María González",
      email: "contacto@verdurasfrescas.mx",
      phone: "3338765432",
      payDays: 7,
      rating: 4,
    },
    {
      name: "Kikkoman México",
      rfc: "KME200101QRS",
      contact: "Hiroshi Nakamura",
      email: "empresas@kikkoman.mx",
      phone: "5521234567",
      payDays: 45,
      rating: 5,
    },
    {
      name: "Plásticos EcoPack",
      rfc: "PEC210715TUV",
      contact: "Luis Herrera",
      email: "ventas@ecopack.mx",
      phone: "8181234567",
      payDays: 30,
      rating: 3,
    },
    {
      name: "Bebidas del Valle",
      rfc: "BDV190801DEF",
      contact: "Ana Castillo",
      email: "distribucion@bebidasdelvalle.mx",
      phone: "2221234567",
      payDays: 15,
      rating: 4,
    },
  ];

  const suppliers: Record<string, string> = {};
  for (const s of supplierDefs) {
    const existing = await prisma.supplier.findFirst({
      where: { organizationId: org.id, rfc: s.rfc },
    });
    if (existing) {
      suppliers[s.rfc] = existing.id;
      console.warn(`  Supplier "${s.name}" already exists — skipping`);
      continue;
    }
    const sup = await prisma.supplier.create({
      data: {
        organizationId: org.id,
        name: s.name,
        rfc: s.rfc,
        contactName: s.contact,
        email: s.email,
        phone: s.phone,
        paymentTermsDays: s.payDays,
        rating: s.rating,
      },
    });
    suppliers[s.rfc] = sup.id;
    console.warn(`  Supplier created: ${s.name}`);
  }

  // ------------------------------------------------------------------
  // 4. PURCHASE ORDERS (6)
  // ------------------------------------------------------------------
  console.warn("\n--- Creating Purchase Orders ---");

  // Helper to build PO items and compute subtotal
  type POItemInput = {
    sku: string;
    qty: number;
    unitPrice: number;
    unit: string;
    receivedQty: number;
  };

  function buildPO(items: POItemInput[]) {
    const subtotal = items.reduce((sum, i) => sum + i.qty * i.unitPrice, 0);
    const tax = parseFloat((subtotal * 0.16).toFixed(2));
    const total = parseFloat((subtotal + tax).toFixed(2));
    return { subtotal, tax, total, items };
  }

  const poDefs: Array<{
    branchCode: string;
    supplierRfc: string;
    status: "DRAFT" | "SENT" | "RECEIVED" | "PARTIALLY_RECEIVED";
    notes: string;
    items: POItemInput[];
  }> = [
    // PO 1 — RECEIVED (Pescadería → CDMX01)
    {
      branchCode: "CDMX01",
      supplierRfc: "PPB201015ABC",
      status: "RECEIVED",
      notes: "Pedido semanal de proteínas marinas",
      items: [
        { sku: "PROT-001", qty: 20, unitPrice: 380, unit: "kg", receivedQty: 20 },
        { sku: "PROT-002", qty: 15, unitPrice: 420, unit: "kg", receivedQty: 15 },
        { sku: "PROT-003", qty: 10, unitPrice: 280, unit: "kg", receivedQty: 10 },
      ],
    },
    // PO 2 — RECEIVED (Yakimeshi → GDL01)
    {
      branchCode: "GDL01",
      supplierRfc: "DYA190322XYZ",
      status: "RECEIVED",
      notes: "Resurtido de arroz y bases",
      items: [
        { sku: "BASE-001", qty: 50, unitPrice: 35, unit: "kg", receivedQty: 50 },
        { sku: "BASE-002", qty: 40, unitPrice: 38, unit: "kg", receivedQty: 40 },
        { sku: "BASE-004", qty: 30, unitPrice: 40, unit: "kg", receivedQty: 30 },
      ],
    },
    // PO 3 — SENT (Verduras → MTY01)
    {
      branchCode: "MTY01",
      supplierRfc: "VFJ180601MNO",
      status: "SENT",
      notes: "Toppings de temporada",
      items: [
        { sku: "TOP-003", qty: 25, unitPrice: 40, unit: "kg", receivedQty: 0 },
        { sku: "TOP-004", qty: 20, unitPrice: 80, unit: "kg", receivedQty: 0 },
        { sku: "TOP-002", qty: 30, unitPrice: 25, unit: "kg", receivedQty: 0 },
      ],
    },
    // PO 4 — SENT (Kikkoman → QRO01)
    {
      branchCode: "QRO01",
      supplierRfc: "KME200101QRS",
      status: "SENT",
      notes: "Salsas para el mes",
      items: [
        { sku: "SAL-001", qty: 10, unitPrice: 85, unit: "lt", receivedQty: 0 },
        { sku: "SAL-002", qty: 8, unitPrice: 65, unit: "lt", receivedQty: 0 },
        { sku: "SAL-003", qty: 12, unitPrice: 70, unit: "lt", receivedQty: 0 },
        { sku: "SAL-004", qty: 15, unitPrice: 45, unit: "lt", receivedQty: 0 },
      ],
    },
    // PO 5 — DRAFT (EcoPack → CAN01)
    {
      branchCode: "CAN01",
      supplierRfc: "PEC210715TUV",
      status: "DRAFT",
      notes: "Empaques biodegradables — por aprobar",
      items: [
        { sku: "EMP-001", qty: 500, unitPrice: 4.5, unit: "pza", receivedQty: 0 },
        { sku: "EMP-002", qty: 1000, unitPrice: 0.8, unit: "pza", receivedQty: 0 },
        { sku: "EMP-003", qty: 300, unitPrice: 2.5, unit: "pza", receivedQty: 0 },
      ],
    },
    // PO 6 — PARTIALLY_RECEIVED (Bebidas → CDMX02)
    {
      branchCode: "CDMX02",
      supplierRfc: "BDV190801DEF",
      status: "PARTIALLY_RECEIVED",
      notes: "Bebidas — entrega parcial",
      items: [
        { sku: "BEB-001", qty: 200, unitPrice: 3.5, unit: "pza", receivedQty: 120 },
        { sku: "BEB-002", qty: 150, unitPrice: 8, unit: "pza", receivedQty: 150 },
        { sku: "BEB-003", qty: 100, unitPrice: 18, unit: "pza", receivedQty: 0 },
      ],
    },
  ];

  // Check if any PO already exist for this org (simple idempotency)
  const existingPOs = await prisma.purchaseOrder.count({ where: { organizationId: org.id } });
  if (existingPOs > 0) {
    console.warn(`  ${existingPOs} purchase orders already exist — skipping PO creation`);
  } else {
    for (const po of poDefs) {
      const { subtotal, tax, total } = buildPO(po.items);
      await prisma.purchaseOrder.create({
        data: {
          organizationId: org.id,
          branchId: branches[po.branchCode],
          supplierId: suppliers[po.supplierRfc],
          status: po.status,
          subtotal,
          tax,
          total,
          notes: po.notes,
          createdById: adminUser.id,
          items: {
            create: po.items.map((i) => ({
              productId: products[i.sku],
              quantity: i.qty,
              unitPrice: i.unitPrice,
              receivedQuantity: i.receivedQty,
              unitOfMeasure: i.unit,
            })),
          },
        },
      });
      console.warn(
        `  PO created: ${po.status} → ${po.branchCode} (${po.supplierRfc}) — $${total.toLocaleString()}`,
      );
    }
  }

  // ------------------------------------------------------------------
  // 5. EMPLOYEES (30 — 3 per branch)
  // ------------------------------------------------------------------
  console.warn("\n--- Creating Employees ---");

  const branchCodes = [
    "CDMX01",
    "CDMX02",
    "GDL01",
    "MTY01",
    "QRO01",
    "CAN01",
    "PUE01",
    "MER01",
    "TIJ01",
    "LEON01",
  ];

  // Realistic Mexican names: [firstName, lastName]
  const employeeNames: [string, string][] = [
    // CDMX01
    ["Alejandro", "Ramírez Soto"],
    ["Daniela", "Flores Huerta"],
    ["Sofía", "Martínez López"],
    // CDMX02
    ["Fernando", "García Medina"],
    ["Valentina", "Hernández Ruiz"],
    ["Luis", "Pérez Castillo"],
    // GDL01
    ["Guadalupe", "Torres Rivera"],
    ["Miguel", "Sánchez Mora"],
    ["Carolina", "Reyes Vargas"],
    // MTY01
    ["Roberto", "Garza Salinas"],
    ["Mariana", "Cavazos Treviño"],
    ["Eduardo", "Elizondo Cruz"],
    // QRO01
    ["Paola", "Mendoza Ríos"],
    ["Héctor", "Juárez Delgado"],
    ["Andrea", "Rojas Pineda"],
    // CAN01
    ["Jorge", "Chan Pat"],
    ["Ximena", "Poot Canul"],
    ["Diego", "Nah Couoh"],
    // PUE01
    ["Gabriela", "Cuautle Romero"],
    ["Ricardo", "Huerta Solís"],
    ["Mónica", "Jiménez Téllez"],
    // MER01
    ["Sergio", "Moguel Baqueiro"],
    ["Laura", "Cámara Escalante"],
    ["Emilio", "Peón Méndez"],
    // TIJ01
    ["César", "Ochoa Valdez"],
    ["Karla", "Ramírez Ibarra"],
    ["Iván", "Soto Contreras"],
    // LEON01
    ["Armando", "Rangel Muñoz"],
    ["Leticia", "Domínguez Lara"],
    ["Óscar", "Villalobos Herrera"],
  ];

  const positions = ["Gerente de Sucursal", "Chef/Preparador", "Cajero"];
  const salaries = [750, 450, 300]; // daily, by position index
  const hireDates = [
    new Date("2024-01-15"),
    new Date("2024-03-01"),
    new Date("2024-06-10"),
    new Date("2024-02-20"),
    new Date("2024-05-05"),
    new Date("2024-08-01"),
    new Date("2024-04-01"),
    new Date("2024-07-15"),
    new Date("2024-10-01"),
    new Date("2024-01-10"),
    new Date("2024-04-20"),
    new Date("2024-09-01"),
    new Date("2024-03-15"),
    new Date("2024-06-01"),
    new Date("2024-11-15"),
    new Date("2025-01-10"),
    new Date("2025-02-01"),
    new Date("2025-04-15"),
    new Date("2024-02-01"),
    new Date("2024-05-15"),
    new Date("2024-12-01"),
    new Date("2025-01-20"),
    new Date("2025-03-01"),
    new Date("2025-05-01"),
    new Date("2024-06-01"),
    new Date("2024-09-15"),
    new Date("2025-01-05"),
    new Date("2024-07-01"),
    new Date("2024-10-15"),
    new Date("2025-02-15"),
  ];

  let empIdx = 0;
  for (let b = 0; b < branchCodes.length; b++) {
    for (let p = 0; p < 3; p++) {
      const empNum = `EMP-${String(empIdx + 1).padStart(3, "0")}`;
      const [firstName, lastName] = employeeNames[empIdx];
      const existing = await prisma.employee.findFirst({
        where: { organizationId: org.id, employeeNumber: empNum },
      });
      if (!existing) {
        await prisma.employee.create({
          data: {
            organizationId: org.id,
            branchId: branches[branchCodes[b]],
            employeeNumber: empNum,
            firstName,
            lastName,
            jobPosition: positions[p],
            department: "Operaciones",
            dailySalary: salaries[p],
            contractType: "PERMANENT",
            paymentFrequency: "BIWEEKLY",
            hireDate: hireDates[empIdx],
            riskClass: 1,
          },
        });
      }
      empIdx++;
    }
  }
  console.warn(`Employees created/verified: ${empIdx}`);

  // ------------------------------------------------------------------
  // 6. BANK ACCOUNTS (3)
  // ------------------------------------------------------------------
  console.warn("\n--- Creating Bank Accounts ---");

  const bankDefs = [
    {
      bankName: "BBVA Empresarial",
      accountNumber: "0123456789",
      clabe: "012180001234567890",
      balance: 1250000,
    },
    {
      bankName: "Banorte Nómina",
      accountNumber: "9876543210",
      clabe: "072180098765432101",
      balance: 485000,
    },
    {
      bankName: "HSBC Operaciones",
      accountNumber: "5555666677",
      clabe: "021180055556666770",
      balance: 320000,
    },
  ];

  const bankAccounts: Record<string, string> = {};
  for (const ba of bankDefs) {
    const existing = await prisma.bankAccount.findFirst({
      where: { organizationId: org.id, accountNumber: ba.accountNumber },
    });
    if (existing) {
      bankAccounts[ba.bankName] = existing.id;
      console.warn(`  Bank "${ba.bankName}" already exists — skipping`);
      continue;
    }
    const created = await prisma.bankAccount.create({
      data: {
        organizationId: org.id,
        bankName: ba.bankName,
        accountNumber: ba.accountNumber,
        clabe: ba.clabe,
        currentBalance: ba.balance,
      },
    });
    bankAccounts[ba.bankName] = created.id;
    console.warn(`  Bank account created: ${ba.bankName} — $${ba.balance.toLocaleString()}`);
  }

  // ------------------------------------------------------------------
  // 7. BANK TRANSACTIONS (20)
  // ------------------------------------------------------------------
  console.warn("\n--- Creating Bank Transactions ---");

  const existingTxns = await prisma.bankTransaction.count({
    where: { bankAccountId: { in: Object.values(bankAccounts) } },
  });
  if (existingTxns > 0) {
    console.warn(`  ${existingTxns} transactions already exist — skipping`);
  } else {
    const txnDefs: Array<{
      bank: string;
      date: string;
      amount: number;
      type: string;
      desc: string;
      ref: string;
    }> = [
      // BBVA — mainly supplier payments and sales deposits
      {
        bank: "BBVA Empresarial",
        date: "2026-03-01",
        amount: -85000,
        type: "debit",
        desc: "Pago Pescadería del Pacífico — Factura F-2301",
        ref: "SPEI-001",
      },
      {
        bank: "BBVA Empresarial",
        date: "2026-03-03",
        amount: 125000,
        type: "credit",
        desc: "Depósito ventas semana 9 — CDMX01",
        ref: "DEP-001",
      },
      {
        bank: "BBVA Empresarial",
        date: "2026-03-07",
        amount: -42000,
        type: "debit",
        desc: "Pago Distribuidora Yakimeshi — Factura F-1105",
        ref: "SPEI-002",
      },
      {
        bank: "BBVA Empresarial",
        date: "2026-03-10",
        amount: 98000,
        type: "credit",
        desc: "Depósito ventas semana 10 — CDMX02+GDL01",
        ref: "DEP-002",
      },
      {
        bank: "BBVA Empresarial",
        date: "2026-03-15",
        amount: -35000,
        type: "debit",
        desc: "Renta local Polanco — Marzo 2026",
        ref: "SPEI-003",
      },
      {
        bank: "BBVA Empresarial",
        date: "2026-03-18",
        amount: 112000,
        type: "credit",
        desc: "Depósito ventas semana 11 — Consolidado",
        ref: "DEP-003",
      },
      {
        bank: "BBVA Empresarial",
        date: "2026-03-25",
        amount: -28500,
        type: "debit",
        desc: "Pago Kikkoman México — Salsas",
        ref: "SPEI-004",
      },
      {
        bank: "BBVA Empresarial",
        date: "2026-04-01",
        amount: 250000,
        type: "credit",
        desc: "Depósito ventas consolidado Marzo",
        ref: "DEP-004",
      },
      // Banorte — payroll
      {
        bank: "Banorte Nómina",
        date: "2026-03-01",
        amount: -185000,
        type: "debit",
        desc: "Dispersión nómina quincena 1 Marzo",
        ref: "NOM-Q1-MAR",
      },
      {
        bank: "Banorte Nómina",
        date: "2026-03-02",
        amount: 200000,
        type: "credit",
        desc: "Transferencia BBVA→Banorte para nómina",
        ref: "TRF-001",
      },
      {
        bank: "Banorte Nómina",
        date: "2026-03-15",
        amount: -185000,
        type: "debit",
        desc: "Dispersión nómina quincena 2 Marzo",
        ref: "NOM-Q2-MAR",
      },
      {
        bank: "Banorte Nómina",
        date: "2026-03-16",
        amount: 200000,
        type: "credit",
        desc: "Transferencia BBVA→Banorte para nómina",
        ref: "TRF-002",
      },
      {
        bank: "Banorte Nómina",
        date: "2026-04-01",
        amount: -185000,
        type: "debit",
        desc: "Dispersión nómina quincena 1 Abril",
        ref: "NOM-Q1-ABR",
      },
      // HSBC — operational expenses
      {
        bank: "HSBC Operaciones",
        date: "2026-03-05",
        amount: -12500,
        type: "debit",
        desc: "Pago CFE — Sucursales CDMX",
        ref: "CFE-MAR",
      },
      {
        bank: "HSBC Operaciones",
        date: "2026-03-08",
        amount: -8700,
        type: "debit",
        desc: "Pago agua — Sucursales CDMX+GDL",
        ref: "AGUA-MAR",
      },
      {
        bank: "HSBC Operaciones",
        date: "2026-03-12",
        amount: -5200,
        type: "debit",
        desc: "Mantenimiento equipos refrigeración — MTY01",
        ref: "MANT-001",
      },
      {
        bank: "HSBC Operaciones",
        date: "2026-03-15",
        amount: 50000,
        type: "credit",
        desc: "Transferencia BBVA→HSBC para operaciones",
        ref: "TRF-003",
      },
      {
        bank: "HSBC Operaciones",
        date: "2026-03-20",
        amount: -15000,
        type: "debit",
        desc: "Pago publicidad digital — Marzo",
        ref: "MKT-MAR",
      },
      {
        bank: "HSBC Operaciones",
        date: "2026-03-28",
        amount: -7800,
        type: "debit",
        desc: "Pago Plásticos EcoPack — Empaques",
        ref: "SPEI-005",
      },
      {
        bank: "HSBC Operaciones",
        date: "2026-04-02",
        amount: -9500,
        type: "debit",
        desc: "Pago seguro de sucursales — Abril",
        ref: "SEG-ABR",
      },
    ];

    for (const txn of txnDefs) {
      await prisma.bankTransaction.create({
        data: {
          bankAccountId: bankAccounts[txn.bank],
          transactionDate: new Date(txn.date),
          amount: Math.abs(txn.amount),
          type: txn.type,
          description: txn.desc,
          reference: txn.ref,
          importedFrom: "manual",
        },
      });
    }
    console.warn(`  Bank transactions created: ${txnDefs.length}`);
  }

  // ------------------------------------------------------------------
  // 8. CUSTOMERS CRM (15)
  // ------------------------------------------------------------------
  console.warn("\n--- Creating Customers ---");

  const customerDefs = [
    // GOLD (3)
    {
      name: "Mariana Villarreal Treviño",
      email: "mariana.vt@gmail.com",
      phone: "8112345678",
      points: 2450,
      tier: "GOLD" as const,
      branch: "MTY01",
    },
    {
      name: "Santiago Díaz Ordaz",
      email: "sdiaz.ordaz@hotmail.com",
      phone: "5534567890",
      points: 3100,
      tier: "GOLD" as const,
      branch: "CDMX01",
    },
    {
      name: "Fernanda Ochoa Reyes",
      email: "fer.ochoa@outlook.com",
      phone: "3323456789",
      points: 2780,
      tier: "GOLD" as const,
      branch: "GDL01",
    },
    // SILVER (4)
    {
      name: "Ricardo Noriega Solís",
      email: "r.noriega@gmail.com",
      phone: "5545678901",
      points: 1200,
      tier: "SILVER" as const,
      branch: "CDMX02",
    },
    {
      name: "Camila Estrada Mejía",
      email: "camila.em@yahoo.com",
      phone: "4421234567",
      points: 980,
      tier: "SILVER" as const,
      branch: "QRO01",
    },
    {
      name: "Andrés Moreno Fuentes",
      email: "andres.mf@gmail.com",
      phone: "9981234567",
      points: 1550,
      tier: "SILVER" as const,
      branch: "CAN01",
    },
    {
      name: "Luisa Herrera Campos",
      email: "luisa.hc@outlook.com",
      phone: "2229876543",
      points: 1100,
      tier: "SILVER" as const,
      branch: "PUE01",
    },
    // BRONZE (8)
    {
      name: "Pablo Guerrero Luna",
      email: "pablo.gl@gmail.com",
      phone: "9991234567",
      points: 350,
      tier: "BRONZE" as const,
      branch: "MER01",
    },
    {
      name: "Natalia Rivas Coronado",
      email: "nat.rivas@hotmail.com",
      phone: "6641234567",
      points: 120,
      tier: "BRONZE" as const,
      branch: "TIJ01",
    },
    {
      name: "Emiliano Vega Durán",
      email: "emi.vega@gmail.com",
      phone: "4771234567",
      points: 580,
      tier: "BRONZE" as const,
      branch: "LEON01",
    },
    {
      name: "Valeria Montes de Oca",
      email: "val.montes@yahoo.com",
      phone: "5556789012",
      points: 200,
      tier: "BRONZE" as const,
      branch: "CDMX01",
    },
    {
      name: "Tomás Aguirre Peña",
      email: "tomas.ap@gmail.com",
      phone: "8187654321",
      points: 75,
      tier: "BRONZE" as const,
      branch: "MTY01",
    },
    {
      name: "Isabella Cruz Navarro",
      email: "isa.cruz@outlook.com",
      phone: "3345678901",
      points: 420,
      tier: "BRONZE" as const,
      branch: "GDL01",
    },
    {
      name: "Mateo López Serrano",
      email: "mateo.ls@gmail.com",
      phone: "4429876543",
      points: 680,
      tier: "BRONZE" as const,
      branch: "QRO01",
    },
    {
      name: "Renata Solís Ibarra",
      email: "renata.si@hotmail.com",
      phone: "9989876543",
      points: 50,
      tier: "BRONZE" as const,
      branch: "CAN01",
    },
  ];

  const existingCustomers = await prisma.customer.count({ where: { organizationId: org.id } });
  if (existingCustomers > 0) {
    console.warn(`  ${existingCustomers} customers already exist — skipping`);
  } else {
    for (const c of customerDefs) {
      await prisma.customer.create({
        data: {
          organizationId: org.id,
          name: c.name,
          email: c.email,
          phone: c.phone,
          loyaltyPoints: c.points,
          tier: c.tier,
          preferredBranchId: branches[c.branch],
        },
      });
    }
    console.warn(`  Customers created: ${customerDefs.length}`);
  }

  // ------------------------------------------------------------------
  // 9. PROMOTIONS (3)
  // ------------------------------------------------------------------
  console.warn("\n--- Creating Promotions ---");

  const promoDefs = [
    {
      name: "Martes de Puntos Dobles",
      type: "POINTS_MULTIPLIER" as const,
      conditions: { multiplier: 2, dayOfWeek: 2, description: "Puntos dobles todos los martes" },
      start: "2026-01-01",
      end: "2026-12-31",
    },
    {
      name: "Descuento Cumpleañero 15%",
      type: "DISCOUNT" as const,
      conditions: {
        discountPercent: 15,
        requiresBirthday: true,
        description: "15% de descuento en tu cumpleaños",
      },
      start: "2026-01-01",
      end: "2026-12-31",
    },
    {
      name: "Luka Bowl Gratis 500pts",
      type: "FREE_ITEM" as const,
      conditions: {
        pointsCost: 500,
        freeItem: "Luka Classic",
        description: "Canjea 500 puntos por un Luka Classic gratis",
      },
      start: "2026-03-01",
      end: "2026-06-30",
    },
  ];

  for (const promo of promoDefs) {
    const existing = await prisma.promotion.findFirst({
      where: { organizationId: org.id, name: promo.name },
    });
    if (existing) {
      console.warn(`  Promotion "${promo.name}" already exists — skipping`);
      continue;
    }
    await prisma.promotion.create({
      data: {
        organizationId: org.id,
        name: promo.name,
        type: promo.type,
        conditions: promo.conditions,
        startDate: new Date(promo.start),
        endDate: new Date(promo.end),
        isActive: true,
      },
    });
    console.warn(`  Promotion created: ${promo.name}`);
  }

  // ------------------------------------------------------------------
  // 10. BRANCH INVENTORY (all products × all branches)
  // ------------------------------------------------------------------
  console.warn("\n--- Creating Branch Inventory ---");

  // Stock ranges by category
  const stockRanges: Record<string, { min: number; max: number; minStockRatio: number }> = {
    Proteínas: { min: 15, max: 40, minStockRatio: 0.25 },
    Bases: { min: 30, max: 80, minStockRatio: 0.25 },
    Toppings: { min: 10, max: 50, minStockRatio: 0.25 },
    Salsas: { min: 5, max: 20, minStockRatio: 0.25 },
    Bebidas: { min: 50, max: 200, minStockRatio: 0.25 },
    Empaques: { min: 200, max: 800, minStockRatio: 0.25 },
  };

  let invCount = 0;
  for (const bCode of branchCodes) {
    for (const pDef of productDefs) {
      const range = stockRanges[pDef.cat] ?? { min: 10, max: 50, minStockRatio: 0.25 };
      const currentQty = randDec(range.min, range.max);
      const minStock = parseFloat((((range.min + range.max) / 2) * range.minStockRatio).toFixed(4));

      await prisma.branchInventory.upsert({
        where: {
          branchId_productId: {
            branchId: branches[bCode],
            productId: products[pDef.sku],
          },
        },
        update: {},
        create: {
          branchId: branches[bCode],
          productId: products[pDef.sku],
          currentQuantity: currentQty,
          minimumStock: minStock,
        },
      });
      invCount++;
    }
  }
  console.warn(`Branch inventory records created/verified: ${invCount}`);

  // ------------------------------------------------------------------
  // Done
  // ------------------------------------------------------------------
  console.warn("\n=== Demo data seeding completed successfully! ===");
}

main()
  .catch((e) => {
    console.error("Demo seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
