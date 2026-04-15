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

function pickN<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

/** Return a Date shifted by `days` from "today" (2026-04-08), with a random hour. */
function daysAgo(days: number): Date {
  const d = new Date("2026-04-08T12:00:00Z");
  d.setDate(d.getDate() - days);
  d.setHours(randInt(8, 21), randInt(0, 59), randInt(0, 59), 0);
  return d;
}

/** Return a specific date. */
function dateOf(y: number, m: number, d: number, h = 12): Date {
  return new Date(y, m - 1, d, h, 0, 0);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.warn("=== Luka System — Sprint 5 Comprehensive Seed ===\n");

  // ==================================================================
  // 0. QUERY EXISTING REFERENCES
  // ==================================================================
  const org = await prisma.organization.findFirstOrThrow({ where: { rfc: "LUK240101AAA" } });
  console.warn("Organization:", org.name);

  const branchRecords = await prisma.branch.findMany({ where: { organizationId: org.id } });
  if (branchRecords.length === 0) throw new Error("No branches found. Run seed.ts first.");
  const branches: Record<string, (typeof branchRecords)[0]> = {};
  for (const b of branchRecords) branches[b.code] = b;
  console.warn("Branches found:", branchRecords.length);

  // If no CEDIS branch exists, promote the first branch to CEDIS
  let cedisBranch = branchRecords.find((b) => b.branchType === "CEDIS");
  if (!cedisBranch) {
    console.warn("No CEDIS branch found — promoting first branch...");
    cedisBranch = await prisma.branch.update({
      where: { id: branchRecords[0].id },
      data: { branchType: "CEDIS" },
    });
  }
  const storeBranches = branchRecords.filter((b) => b.id !== cedisBranch!.id);

  const productRecords = await prisma.product.findMany({
    where: { organizationId: org.id },
    include: { category: true },
  });
  if (productRecords.length === 0) throw new Error("No products found. Run seed-demo.ts first.");
  console.warn("Products found:", productRecords.length);

  const adminUser = await prisma.user.findFirstOrThrow({ where: { email: "admin@lukapoke.com" } });
  console.warn("Admin user:", adminUser.email);

  const allUsers = await prisma.user.findMany({ where: { organizationId: org.id } });

  const supplierRecords = await prisma.supplier.findMany({ where: { organizationId: org.id } });
  if (supplierRecords.length === 0) throw new Error("No suppliers found. Run seed-demo.ts first.");
  console.warn("Suppliers found:", supplierRecords.length);

  const employeeRecords = await prisma.employee.findMany({
    where: { organizationId: org.id, isActive: true },
  });
  if (employeeRecords.length === 0) throw new Error("No employees found. Run seed-demo.ts first.");
  console.warn("Employees found:", employeeRecords.length);

  const bankAccountRecords = await prisma.bankAccount.findMany({
    where: { organizationId: org.id },
  });
  console.warn("Bank accounts found:", bankAccountRecords.length);

  const accountRecords = await prisma.accountCatalog.findMany({
    where: { organizationId: org.id },
  });
  const accounts: Record<string, string> = {};
  for (const a of accountRecords) accounts[a.code] = a.id;
  console.warn("Chart of accounts found:", accountRecords.length);

  const customerRecords = await prisma.customer.findMany({ where: { organizationId: org.id } });
  console.warn("Customers found:", customerRecords.length);

  // ==================================================================
  // 1. ADDITIONAL ACCOUNT CATALOG ENTRIES
  // ==================================================================
  console.warn("\n--- Ensuring Extended Chart of Accounts ---");

  const extraAccounts = [
    {
      code: "1101",
      name: "Bancos",
      type: "ASSET" as const,
      nature: "DEBIT" as const,
      parent: "100.01",
    },
    {
      code: "1201",
      name: "Clientes",
      type: "ASSET" as const,
      nature: "DEBIT" as const,
      parent: "100.02",
    },
    {
      code: "1301",
      name: "Inventarios",
      type: "ASSET" as const,
      nature: "DEBIT" as const,
      parent: "100.03",
    },
    {
      code: "2101",
      name: "Proveedores",
      type: "LIABILITY" as const,
      nature: "CREDIT" as const,
      parent: "200.01",
    },
    {
      code: "3101",
      name: "Capital Contribuido",
      type: "EQUITY" as const,
      nature: "CREDIT" as const,
      parent: "300.01",
    },
    {
      code: "4101",
      name: "Ventas Netas",
      type: "REVENUE" as const,
      nature: "CREDIT" as const,
      parent: "400.01",
    },
    {
      code: "5101",
      name: "Costo de Ventas",
      type: "EXPENSE" as const,
      nature: "DEBIT" as const,
      parent: "500.01",
    },
    {
      code: "6101",
      name: "Gastos de Operacion",
      type: "EXPENSE" as const,
      nature: "DEBIT" as const,
      parent: "600",
    },
  ];

  for (const acc of extraAccounts) {
    const parentId = acc.parent ? accounts[acc.parent] || null : null;
    const existing = await prisma.accountCatalog.findFirst({
      where: { organizationId: org.id, code: acc.code },
    });
    if (!existing) {
      const created = await prisma.accountCatalog.create({
        data: {
          organizationId: org.id,
          code: acc.code,
          name: acc.name,
          type: acc.type,
          nature: acc.nature,
          isDetail: true,
          parentAccountId: parentId,
        },
      });
      accounts[acc.code] = created.id;
      console.warn(`  Account created: ${acc.code} - ${acc.name}`);
    } else {
      accounts[acc.code] = existing.id;
    }
  }

  // ==================================================================
  // 2. PRODUCT PRESENTATIONS (additional)
  // ==================================================================
  console.warn("\n--- Creating Additional Product Presentations ---");

  const presentationDefs = [
    {
      sku: "PROT-003",
      presentations: [
        { name: "Bolsa 1kg", factor: 1.0, unit: "kg", price: 280, sale: 350 },
        { name: "Bolsa 500g", factor: 0.5, unit: "kg", price: 145, sale: 180 },
        { name: "Caja 5kg", factor: 5.0, unit: "kg", price: 1350, sale: 1700 },
      ],
    },
    {
      sku: "PROT-004",
      presentations: [
        { name: "Bolsa 1kg", factor: 1.0, unit: "kg", price: 350, sale: 440 },
        { name: "Porcion 200g", factor: 0.2, unit: "kg", price: 75, sale: 95 },
      ],
    },
    {
      sku: "PROT-005",
      presentations: [
        { name: "Paquete 1kg", factor: 1.0, unit: "kg", price: 120, sale: 155 },
        { name: "Charola 500g", factor: 0.5, unit: "kg", price: 65, sale: 80 },
        { name: "Caja 10kg", factor: 10.0, unit: "kg", price: 1100, sale: 1450 },
      ],
    },
    {
      sku: "TOP-004",
      presentations: [
        { name: "Pieza", factor: 0.25, unit: "kg", price: 20, sale: 28 },
        { name: "Caja 4kg", factor: 4.0, unit: "kg", price: 300, sale: 380 },
      ],
    },
    {
      sku: "SAL-001",
      presentations: [
        { name: "Botella 500ml", factor: 0.5, unit: "lt", price: 45, sale: 58 },
        { name: "Garrafa 5lt", factor: 5.0, unit: "lt", price: 400, sale: 510 },
      ],
    },
    {
      sku: "SAL-003",
      presentations: [
        { name: "Botella 1lt", factor: 1.0, unit: "lt", price: 70, sale: 90 },
        { name: "Garrafa 4lt", factor: 4.0, unit: "lt", price: 260, sale: 340 },
      ],
    },
    {
      sku: "EMP-001",
      presentations: [
        { name: "Paquete 50 pzas", factor: 50, unit: "pza", price: 210, sale: 270 },
        { name: "Caja 500 pzas", factor: 500, unit: "pza", price: 2000, sale: 2500 },
      ],
    },
    {
      sku: "BEB-001",
      presentations: [{ name: "Caja 24 pzas", factor: 24, unit: "pza", price: 78, sale: 120 }],
    },
  ];

  let presCount = 0;
  for (const pd of presentationDefs) {
    const product = productRecords.find((p) => p.sku === pd.sku);
    if (!product) continue;
    for (const pres of pd.presentations) {
      const existing = await prisma.productPresentation.findFirst({
        where: { productId: product.id, name: pres.name },
      });
      if (!existing) {
        await prisma.productPresentation.create({
          data: {
            productId: product.id,
            name: pres.name,
            conversionFactor: pres.factor,
            conversionUnit: pres.unit,
            purchasePrice: pres.price,
            salePrice: pres.sale,
            isDefault: false,
          },
        });
        presCount++;
      }
    }
  }
  console.warn(`  Product presentations created: ${presCount}`);

  // ==================================================================
  // 3. INVENTORY MOVEMENTS (60+)
  // ==================================================================
  console.warn("\n--- Creating Inventory Movements ---");

  const existingMovements = await prisma.inventoryMovement.count({
    where: { branchId: { in: branchRecords.map((b) => b.id) } },
  });

  if (existingMovements > 0) {
    console.warn(`  ${existingMovements} movements already exist — skipping`);
  } else {
    const movementTypes: Array<
      "IN" | "OUT" | "ADJUSTMENT" | "TRANSFER_IN" | "TRANSFER_OUT" | "WASTE" | "SALE_DEDUCTION"
    > = [
      "IN",
      "IN",
      "IN",
      "OUT",
      "OUT",
      "ADJUSTMENT",
      "TRANSFER_IN",
      "TRANSFER_OUT",
      "WASTE",
      "SALE_DEDUCTION",
    ];
    const movementNotes: Record<string, string[]> = {
      IN: ["Recepcion de orden de compra", "Entrada por devolucion", "Ingreso de mercancia"],
      OUT: ["Consumo de cocina", "Traspaso a otra sucursal", "Salida por merma"],
      ADJUSTMENT: ["Ajuste por conteo fisico", "Correccion de inventario", "Ajuste por diferencia"],
      TRANSFER_IN: ["Recepcion de CEDIS", "Transferencia entre sucursales"],
      TRANSFER_OUT: ["Envio a sucursal", "Salida por transferencia"],
      WASTE: ["Producto caducado", "Merma por dano", "Producto en mal estado"],
      SALE_DEDUCTION: ["Deduccion automatica por venta POS"],
    };

    let movCount = 0;
    for (let i = 0; i < 65; i++) {
      const branch = pick(storeBranches);
      const product = pick(productRecords);
      const type = pick(movementTypes);
      const qty = randDec(0.5, 25, 4);
      const cost = Number(product.costPerUnit);

      await prisma.inventoryMovement.create({
        data: {
          branchId: branch.id,
          productId: product.id,
          movementType: type,
          quantity: qty,
          unitCost: cost,
          referenceType:
            type === "IN"
              ? "purchase_order"
              : type === "SALE_DEDUCTION"
                ? "sale"
                : type.startsWith("TRANSFER")
                  ? "transfer"
                  : "manual",
          notes: pick(movementNotes[type] || movementNotes["ADJUSTMENT"]),
          userId: adminUser.id,
          timestamp: daysAgo(randInt(0, 60)),
        },
      });
      movCount++;
    }
    console.warn(`  Inventory movements created: ${movCount}`);
  }

  // ==================================================================
  // 4. INTER-BRANCH TRANSFERS (12)
  // ==================================================================
  console.warn("\n--- Creating Inter-Branch Transfers ---");

  const existingTransfers = await prisma.interBranchTransfer.count({
    where: { fromBranchId: cedisBranch.id },
  });

  if (existingTransfers > 0) {
    console.warn(`  ${existingTransfers} transfers already exist — skipping`);
  } else {
    const transferStatuses: Array<
      "PENDING" | "APPROVED" | "IN_TRANSIT" | "RECEIVED" | "CANCELLED"
    > = [
      "RECEIVED",
      "RECEIVED",
      "RECEIVED",
      "RECEIVED",
      "RECEIVED",
      "IN_TRANSIT",
      "IN_TRANSIT",
      "APPROVED",
      "PENDING",
      "PENDING",
      "CANCELLED",
    ];

    for (let i = 0; i < 12; i++) {
      const toBranch = pick(storeBranches);
      const status = transferStatuses[i % transferStatuses.length];
      const daysBack = randInt(1, 45);
      const items = pickN(productRecords, randInt(2, 5));

      await prisma.interBranchTransfer.create({
        data: {
          fromBranchId: cedisBranch.id,
          toBranchId: toBranch.id,
          status,
          requestedById: adminUser.id,
          approvedById: status !== "PENDING" ? adminUser.id : null,
          notes: `Resurtido programado para ${toBranch.name}`,
          createdAt: daysAgo(daysBack),
          completedAt: status === "RECEIVED" ? daysAgo(daysBack - 1) : null,
          items: {
            create: items.map((product) => {
              const reqQty = randDec(5, 50, 4);
              return {
                productId: product.id,
                requestedQuantity: reqQty,
                sentQuantity: status !== "PENDING" ? reqQty : null,
                receivedQuantity: status === "RECEIVED" ? reqQty * randDec(0.9, 1.0, 4) : null,
              };
            }),
          },
        },
      });
    }
    console.warn("  Inter-branch transfers created: 12");
  }

  // ==================================================================
  // 5. PURCHASE ORDERS (30+)
  // ==================================================================
  console.warn("\n--- Creating Additional Purchase Orders ---");

  const existingPOs = await prisma.purchaseOrder.count({ where: { organizationId: org.id } });

  if (existingPOs >= 20) {
    console.warn(`  ${existingPOs} purchase orders already exist — skipping`);
  } else {
    const poStatuses: Array<"DRAFT" | "SENT" | "PARTIALLY_RECEIVED" | "RECEIVED" | "CANCELLED"> = [
      "RECEIVED",
      "RECEIVED",
      "RECEIVED",
      "RECEIVED",
      "RECEIVED",
      "RECEIVED",
      "RECEIVED",
      "RECEIVED",
      "SENT",
      "SENT",
      "SENT",
      "SENT",
      "SENT",
      "PARTIALLY_RECEIVED",
      "PARTIALLY_RECEIVED",
      "PARTIALLY_RECEIVED",
      "DRAFT",
      "DRAFT",
      "DRAFT",
      "CANCELLED",
      "CANCELLED",
    ];

    const poNotes = [
      "Pedido semanal de proteinas",
      "Resurtido urgente de toppings",
      "Orden mensual de salsas y condimentos",
      "Reposicion de inventario bajo",
      "Pedido especial para evento",
      "Compra de empaques biodegradables",
      "Resurtido quincenal de bases",
      "Orden de bebidas para temporada alta",
      "Compra de insumos para nueva sucursal",
      "Pedido de emergencia por faltante",
    ];

    for (let i = 0; i < 25; i++) {
      const supplier = pick(supplierRecords);
      const branch = pick(storeBranches);
      const status = poStatuses[i % poStatuses.length];
      const items = pickN(productRecords, randInt(2, 6));

      let subtotal = 0;
      const poItems = items.map((product) => {
        const qty = randDec(5, 100, 4);
        const price = Number(product.costPerUnit) * randDec(0.95, 1.1, 4);
        subtotal += qty * price;
        return {
          productId: product.id,
          quantity: qty,
          unitPrice: parseFloat(price.toFixed(4)),
          receivedQuantity:
            status === "RECEIVED"
              ? qty
              : status === "PARTIALLY_RECEIVED"
                ? qty * randDec(0.3, 0.7, 4)
                : 0,
          unitOfMeasure: product.unitOfMeasure,
        };
      });

      const tax = parseFloat((subtotal * 0.16).toFixed(2));
      const total = parseFloat((subtotal + tax).toFixed(2));
      subtotal = parseFloat(subtotal.toFixed(2));

      await prisma.purchaseOrder.create({
        data: {
          organizationId: org.id,
          branchId: branch.id,
          supplierId: supplier.id,
          status,
          subtotal,
          tax,
          total,
          notes: pick(poNotes),
          createdById: adminUser.id,
          approvedById: ["SENT", "RECEIVED", "PARTIALLY_RECEIVED"].includes(status)
            ? adminUser.id
            : null,
          createdAt: daysAgo(randInt(1, 75)),
          items: { create: poItems },
        },
      });
    }
    console.warn("  Additional purchase orders created: 25");
  }

  // ==================================================================
  // 6. POS SALES (120)
  // ==================================================================
  console.warn("\n--- Creating POS Sales ---");

  const existingPosSales = await prisma.posSale.count({ where: { organizationId: org.id } });

  if (existingPosSales > 0) {
    console.warn(`  ${existingPosSales} POS sales already exist — skipping`);
  } else {
    const paymentMethods = ["CASH", "CASH", "CARD", "CARD", "CARD", "TRANSFER"];
    const menuItems = [
      { sku: "MENU-001", name: "Luka Classic", price: 189 },
      { sku: "MENU-002", name: "Spicy Tuna", price: 199 },
      { sku: "MENU-003", name: "Camaron Bowl", price: 219 },
      { sku: "MENU-004", name: "Veggie Bowl", price: 169 },
      { sku: "MENU-005", name: "Salmon Premium", price: 249 },
      { sku: "MENU-006", name: "Pulpo Bowl", price: 239 },
      { sku: "MENU-007", name: "Pollo Teriyaki Bowl", price: 179 },
      { sku: "BEB-001", name: "Agua Natural 500ml", price: 25 },
      { sku: "BEB-002", name: "Agua Mineral 355ml", price: 30 },
      { sku: "BEB-003", name: "Te Verde Embotellado", price: 39 },
      { sku: "BEB-004", name: "Limonada Natural", price: 45 },
    ];

    let salesCreated = 0;
    for (let i = 0; i < 120; i++) {
      const branch = pick(storeBranches);
      const saleDate = daysAgo(randInt(0, 89));
      const ticketNum = `T-${branch.code}-${String(i + 1).padStart(5, "0")}`;
      const numItems = randInt(1, 4);
      const saleItems = pickN(menuItems, numItems);

      let subtotal = 0;
      const itemData = saleItems.map((item) => {
        const qty = randInt(1, 2);
        const total = item.price * qty;
        subtotal += total;
        return {
          productSku: item.sku,
          productName: item.name,
          quantity: qty,
          unitPrice: item.price,
          total,
        };
      });

      const tax = parseFloat((subtotal * 0.16).toFixed(2));
      const total = parseFloat((subtotal + tax).toFixed(2));

      await prisma.posSale.create({
        data: {
          organizationId: org.id,
          branchId: branch.id,
          ticketNumber: ticketNum,
          saleDate,
          subtotal,
          tax,
          total,
          paymentMethod: pick(paymentMethods),
          items: { create: itemData },
        },
      });
      salesCreated++;
    }
    console.warn(`  POS sales created: ${salesCreated}`);
  }

  // ==================================================================
  // 7. CORNTECH SALES (120)
  // ==================================================================
  console.warn("\n--- Creating Corntech Sales ---");

  const existingCorntechSales = await prisma.corntechSale.count({
    where: { branchId: { in: branchRecords.map((b) => b.id) } },
  });

  if (existingCorntechSales > 0) {
    console.warn(`  ${existingCorntechSales} Corntech sales already exist — skipping`);
  } else {
    const corntechPayments = ["EFECTIVO", "TARJETA_DEBITO", "TARJETA_CREDITO", "TRANSFERENCIA"];
    const corntechItems = [
      { name: "Luka Classic Bowl", qty: 1, price: 189 },
      { name: "Spicy Tuna Bowl", qty: 1, price: 199 },
      { name: "Camaron Bowl", qty: 1, price: 219 },
      { name: "Salmon Premium Bowl", qty: 1, price: 249 },
      { name: "Veggie Bowl", qty: 1, price: 169 },
      { name: "Agua Natural", qty: 1, price: 25 },
      { name: "Limonada", qty: 1, price: 45 },
    ];

    let ctSales = 0;
    for (let i = 0; i < 120; i++) {
      const branch = pick(storeBranches);
      const saleDate = daysAgo(randInt(0, 89));
      const saleId = `CT-${Date.now()}-${i}`;
      const numItems = randInt(1, 3);
      const items = pickN(corntechItems, numItems).map((it) => ({
        ...it,
        qty: randInt(1, 2),
      }));

      const subtotal = items.reduce((s, it) => s + it.price * it.qty, 0);
      const tax = parseFloat((subtotal * 0.16).toFixed(2));
      const total = parseFloat((subtotal + tax).toFixed(2));

      await prisma.corntechSale.create({
        data: {
          branchId: branch.id,
          corntechSaleId: saleId,
          saleDate,
          ticketNumber: `CK-${String(i + 1).padStart(6, "0")}`,
          subtotal,
          tax,
          total,
          paymentMethod: pick(corntechPayments),
          items,
        },
      });
      ctSales++;
    }
    console.warn(`  Corntech sales created: ${ctSales}`);
  }

  // ==================================================================
  // 8. BANK TRANSACTIONS (additional 40+)
  // ==================================================================
  console.warn("\n--- Creating Additional Bank Transactions ---");

  if (bankAccountRecords.length === 0) {
    console.warn("  No bank accounts found — skipping");
  } else {
    const existingBankTxn = await prisma.bankTransaction.count({
      where: { bankAccountId: { in: bankAccountRecords.map((b) => b.id) } },
    });

    if (existingBankTxn >= 40) {
      console.warn(`  ${existingBankTxn} bank transactions already exist — skipping`);
    } else {
      const bankTxnTemplates = [
        {
          type: "credit",
          descs: [
            "Deposito ventas del dia",
            "Transferencia recibida",
            "Ingreso por evento catering",
            "Cobro cuenta por cobrar",
            "Deposito ventas delivery",
            "Ingreso por franquicia",
          ],
        },
        {
          type: "debit",
          descs: [
            "Pago a proveedor",
            "Pago renta de local",
            "Pago servicios CFE",
            "Pago publicidad digital",
            "Compra de insumos",
            "Pago mantenimiento",
            "Pago IMSS patronal",
            "Comision bancaria",
            "Pago seguro",
            "Transferencia a cuenta nomina",
          ],
        },
      ];

      let bankTxnCount = 0;
      for (const ba of bankAccountRecords) {
        const txnPerAccount = randInt(12, 18);
        for (let i = 0; i < txnPerAccount; i++) {
          const template = pick(bankTxnTemplates);
          const amount = template.type === "credit" ? randDec(15000, 180000) : randDec(3000, 85000);

          await prisma.bankTransaction.create({
            data: {
              bankAccountId: ba.id,
              transactionDate: daysAgo(randInt(0, 60)),
              amount,
              type: template.type,
              description: pick(template.descs),
              reference: `REF-${Date.now()}-${bankTxnCount}`,
              importedFrom: "manual",
              isReconciled: Math.random() < 0.6,
            },
          });
          bankTxnCount++;
        }
      }
      console.warn(`  Bank transactions created: ${bankTxnCount}`);
    }
  }

  // ==================================================================
  // 9. ACCOUNTS PAYABLE (35)
  // ==================================================================
  console.warn("\n--- Creating Accounts Payable ---");

  const existingAP = await prisma.accountPayable.count({ where: { organizationId: org.id } });

  if (existingAP > 0) {
    console.warn(`  ${existingAP} accounts payable already exist — skipping`);
  } else {
    const apStatuses: Array<"PENDING" | "PARTIALLY_PAID" | "PAID" | "OVERDUE" | "CANCELLED"> = [
      "PAID",
      "PAID",
      "PAID",
      "PAID",
      "PAID",
      "PAID",
      "PAID",
      "PAID",
      "PAID",
      "PAID",
      "PENDING",
      "PENDING",
      "PENDING",
      "PENDING",
      "PENDING",
      "PENDING",
      "PENDING",
      "OVERDUE",
      "OVERDUE",
      "OVERDUE",
      "OVERDUE",
      "OVERDUE",
      "PARTIALLY_PAID",
      "PARTIALLY_PAID",
      "PARTIALLY_PAID",
      "CANCELLED",
    ];

    let apCount = 0;
    for (let i = 0; i < 35; i++) {
      const supplier = pick(supplierRecords);
      const branch = pick(storeBranches);
      const status = apStatuses[i % apStatuses.length];
      const amount = randDec(5000, 120000);
      const daysBack = randInt(5, 75);
      const dueDate = daysAgo(status === "OVERDUE" ? randInt(1, 30) : -randInt(5, 45));

      let balanceDue = amount;
      if (status === "PAID") balanceDue = 0;
      else if (status === "PARTIALLY_PAID")
        balanceDue = parseFloat((amount * randDec(0.2, 0.7)).toFixed(2));
      else if (status === "CANCELLED") balanceDue = 0;

      await prisma.accountPayable.create({
        data: {
          organizationId: org.id,
          supplierId: supplier.id,
          branchId: branch.id,
          invoiceNumber: `FAC-${supplier.name.substring(0, 3).toUpperCase()}-${String(i + 1).padStart(4, "0")}`,
          amount,
          balanceDue,
          dueDate,
          status,
          createdAt: daysAgo(daysBack),
        },
      });
      apCount++;
    }
    console.warn(`  Accounts payable created: ${apCount}`);
  }

  // ==================================================================
  // 10. ACCOUNTS RECEIVABLE (25)
  // ==================================================================
  console.warn("\n--- Creating Accounts Receivable ---");

  const existingAR = await prisma.accountReceivable.count({ where: { organizationId: org.id } });

  if (existingAR > 0) {
    console.warn(`  ${existingAR} accounts receivable already exist — skipping`);
  } else {
    const arStatuses: Array<"PENDING" | "PARTIALLY_PAID" | "PAID" | "OVERDUE" | "CANCELLED"> = [
      "PAID",
      "PAID",
      "PAID",
      "PAID",
      "PAID",
      "PAID",
      "PAID",
      "PENDING",
      "PENDING",
      "PENDING",
      "PENDING",
      "PENDING",
      "PENDING",
      "OVERDUE",
      "OVERDUE",
      "OVERDUE",
      "PARTIALLY_PAID",
      "PARTIALLY_PAID",
      "CANCELLED",
    ];

    let arCount = 0;
    for (let i = 0; i < 25; i++) {
      const branch = pick(storeBranches);
      const customer = customerRecords.length > 0 ? pick(customerRecords) : null;
      const status = arStatuses[i % arStatuses.length];
      const amount = randDec(2500, 45000);
      const dueDate = daysAgo(status === "OVERDUE" ? randInt(1, 20) : -randInt(5, 30));

      let balanceDue = amount;
      if (status === "PAID") balanceDue = 0;
      else if (status === "PARTIALLY_PAID")
        balanceDue = parseFloat((amount * randDec(0.3, 0.6)).toFixed(2));
      else if (status === "CANCELLED") balanceDue = 0;

      await prisma.accountReceivable.create({
        data: {
          organizationId: org.id,
          customerId: customer?.id || null,
          branchId: branch.id,
          amount,
          balanceDue,
          dueDate,
          status,
          createdAt: daysAgo(randInt(5, 60)),
        },
      });
      arCount++;
    }
    console.warn(`  Accounts receivable created: ${arCount}`);
  }

  // ==================================================================
  // 11. PAYMENTS (20)
  // ==================================================================
  console.warn("\n--- Creating Payments ---");

  const existingPayments = await prisma.payment.count({ where: { organizationId: org.id } });

  if (existingPayments > 0) {
    console.warn(`  ${existingPayments} payments already exist — skipping`);
  } else {
    // Fetch payables and receivables that are PAID or PARTIALLY_PAID
    const paidPayables = await prisma.accountPayable.findMany({
      where: { organizationId: org.id, status: { in: ["PAID", "PARTIALLY_PAID"] } },
    });
    const paidReceivables = await prisma.accountReceivable.findMany({
      where: { organizationId: org.id, status: { in: ["PAID", "PARTIALLY_PAID"] } },
    });

    const paymentMethods = ["TRANSFERENCIA", "CHEQUE", "EFECTIVO", "TARJETA"];
    let payCount = 0;

    // Payments for payables
    for (const ap of paidPayables.slice(0, 12)) {
      const ba = bankAccountRecords.length > 0 ? pick(bankAccountRecords) : null;
      const payAmount =
        ap.status === "PAID"
          ? Number(ap.amount)
          : parseFloat((Number(ap.amount) - Number(ap.balanceDue)).toFixed(2));

      await prisma.payment.create({
        data: {
          organizationId: org.id,
          type: "payable",
          payableId: ap.id,
          amount: payAmount,
          paymentDate: daysAgo(randInt(1, 30)),
          paymentMethod: pick(paymentMethods),
          bankAccountId: ba?.id || null,
          reference: `PAG-${String(payCount + 1).padStart(4, "0")}`,
        },
      });
      payCount++;
    }

    // Payments for receivables
    for (const ar of paidReceivables.slice(0, 8)) {
      const ba = bankAccountRecords.length > 0 ? pick(bankAccountRecords) : null;
      const payAmount =
        ar.status === "PAID"
          ? Number(ar.amount)
          : parseFloat((Number(ar.amount) - Number(ar.balanceDue)).toFixed(2));

      await prisma.payment.create({
        data: {
          organizationId: org.id,
          type: "receivable",
          receivableId: ar.id,
          amount: payAmount,
          paymentDate: daysAgo(randInt(1, 20)),
          paymentMethod: pick(paymentMethods),
          bankAccountId: ba?.id || null,
          reference: `COB-${String(payCount + 1).padStart(4, "0")}`,
        },
      });
      payCount++;
    }
    console.warn(`  Payments created: ${payCount}`);
  }

  // ==================================================================
  // 12. JOURNAL ENTRIES (25)
  // ==================================================================
  console.warn("\n--- Creating Journal Entries ---");

  const existingJE = await prisma.journalEntry.count({ where: { organizationId: org.id } });

  if (existingJE > 0) {
    console.warn(`  ${existingJE} journal entries already exist — skipping`);
  } else {
    const journalTemplates = [
      {
        desc: "Registro de ventas del dia",
        type: "INGRESO" as const,
        debit: "1101",
        credit: "4101",
        minAmt: 8000,
        maxAmt: 45000,
      },
      {
        desc: "Costo de ventas del dia",
        type: "DIARIO" as const,
        debit: "5101",
        credit: "1301",
        minAmt: 2500,
        maxAmt: 15000,
      },
      {
        desc: "Pago a proveedor",
        type: "EGRESO" as const,
        debit: "2101",
        credit: "1101",
        minAmt: 10000,
        maxAmt: 85000,
      },
      {
        desc: "Registro de nomina quincenal",
        type: "DIARIO" as const,
        debit: "600.01",
        credit: "200.05",
        minAmt: 80000,
        maxAmt: 200000,
      },
      {
        desc: "Pago de renta mensual",
        type: "EGRESO" as const,
        debit: "600.03",
        credit: "1101",
        minAmt: 25000,
        maxAmt: 55000,
      },
      {
        desc: "Pago de servicios (luz, agua, gas)",
        type: "EGRESO" as const,
        debit: "600.04",
        credit: "1101",
        minAmt: 5000,
        maxAmt: 18000,
      },
      {
        desc: "Gasto de publicidad",
        type: "EGRESO" as const,
        debit: "600.05",
        credit: "1101",
        minAmt: 8000,
        maxAmt: 25000,
      },
      {
        desc: "Ingreso por ventas delivery",
        type: "INGRESO" as const,
        debit: "1101",
        credit: "4101",
        minAmt: 5000,
        maxAmt: 30000,
      },
      {
        desc: "Ajuste de inventario",
        type: "DIARIO" as const,
        debit: "1301",
        credit: "5101",
        minAmt: 1000,
        maxAmt: 8000,
      },
      {
        desc: "Pago cuotas IMSS patronal",
        type: "EGRESO" as const,
        debit: "600.02",
        credit: "1101",
        minAmt: 15000,
        maxAmt: 45000,
      },
    ];

    let jeCount = 0;
    for (let i = 0; i < 25; i++) {
      const template = journalTemplates[i % journalTemplates.length];
      const amount = randDec(template.minAmt, template.maxAmt);
      const branch = pick(storeBranches);
      const entryDate = daysAgo(randInt(1, 75));

      const debitAccountId = accounts[template.debit];
      const creditAccountId = accounts[template.credit];
      if (!debitAccountId || !creditAccountId) continue;

      await prisma.journalEntry.create({
        data: {
          organizationId: org.id,
          branchId: branch.id,
          entryDate,
          type: template.type,
          description: `${template.desc} — ${branch.name}`,
          status: Math.random() < 0.8 ? "POSTED" : "DRAFT",
          createdById: adminUser.id,
          postedById: Math.random() < 0.8 ? adminUser.id : null,
          lines: {
            create: [
              { accountId: debitAccountId, debit: amount, credit: 0, description: template.desc },
              { accountId: creditAccountId, debit: 0, credit: amount, description: template.desc },
            ],
          },
        },
      });
      jeCount++;
    }
    console.warn(`  Journal entries created: ${jeCount}`);
  }

  // ==================================================================
  // 13. PAYROLL PERIODS + RECEIPTS
  // ==================================================================
  console.warn("\n--- Creating Payroll Periods & Receipts ---");

  const existingPayrolls = await prisma.payrollPeriod.count({ where: { organizationId: org.id } });

  if (existingPayrolls > 0) {
    console.warn(`  ${existingPayrolls} payroll periods already exist — skipping`);
  } else {
    const payrollPeriods = [
      { start: "2026-03-01", end: "2026-03-15", status: "PAID" as const },
      { start: "2026-03-16", end: "2026-03-31", status: "PAID" as const },
      { start: "2026-04-01", end: "2026-04-15", status: "CALCULATED" as const },
    ];

    for (const pp of payrollPeriods) {
      let totalGross = 0;
      let totalDeductions = 0;
      let totalNet = 0;
      let totalEmployerCost = 0;

      const receipts: Array<{
        employeeId: string;
        branchId: string;
        daysWorked: number;
        grossSalary: number;
        isrWithheld: number;
        imssEmployee: number;
        netSalary: number;
        employerImss: number;
        employerRcv: number;
        employerInfonavit: number;
        employmentSubsidy: number;
        perceptionDetails: any;
        deductionDetails: any;
      }> = [];

      for (const emp of employeeRecords) {
        const dailySalary = Number(emp.dailySalary);
        const daysWorked = randDec(14, 15, 2);
        const grossSalary = parseFloat((dailySalary * daysWorked).toFixed(2));

        // Simplified ISR calculation (approximate)
        let isrWithheld = 0;
        const monthlyGross = grossSalary * 2; // approximate monthly
        if (monthlyGross > 49233) isrWithheld = grossSalary * 0.25;
        else if (monthlyGross > 31236) isrWithheld = grossSalary * 0.2;
        else if (monthlyGross > 15487) isrWithheld = grossSalary * 0.15;
        else if (monthlyGross > 11128) isrWithheld = grossSalary * 0.12;
        else if (monthlyGross > 6332) isrWithheld = grossSalary * 0.08;
        else isrWithheld = grossSalary * 0.03;
        isrWithheld = parseFloat(isrWithheld.toFixed(2));

        // Employment subsidy for low earners
        let employmentSubsidy = 0;
        if (monthlyGross < 7382) employmentSubsidy = parseFloat((grossSalary * 0.08).toFixed(2));

        // IMSS employee deductions (approximate)
        const imssEmployee = parseFloat((grossSalary * 0.025).toFixed(2));

        const totalDeductionsEmp = isrWithheld + imssEmployee;
        const netSalary = parseFloat(
          (grossSalary - totalDeductionsEmp + employmentSubsidy).toFixed(2),
        );

        // Employer costs
        const employerImss = parseFloat((grossSalary * 0.135).toFixed(2));
        const employerRcv = parseFloat((grossSalary * 0.0515).toFixed(2));
        const employerInfonavit = parseFloat((grossSalary * 0.05).toFixed(2));

        totalGross += grossSalary;
        totalDeductions += totalDeductionsEmp;
        totalNet += netSalary;
        totalEmployerCost += grossSalary + employerImss + employerRcv + employerInfonavit;

        receipts.push({
          employeeId: emp.id,
          branchId: emp.branchId,
          daysWorked,
          grossSalary,
          isrWithheld,
          imssEmployee,
          netSalary,
          employerImss,
          employerRcv,
          employerInfonavit,
          employmentSubsidy,
          perceptionDetails: [
            { code: "P001", description: "Sueldo quincenal", amount: grossSalary },
          ],
          deductionDetails: [
            { code: "D001", description: "ISR", amount: isrWithheld },
            { code: "D002", description: "IMSS empleado", amount: imssEmployee },
          ],
        });
      }

      await prisma.payrollPeriod.create({
        data: {
          organizationId: org.id,
          periodType: "BIWEEKLY",
          startDate: new Date(pp.start),
          endDate: new Date(pp.end),
          status: pp.status,
          totalGross: parseFloat(totalGross.toFixed(2)),
          totalDeductions: parseFloat(totalDeductions.toFixed(2)),
          totalNet: parseFloat(totalNet.toFixed(2)),
          totalEmployerCost: parseFloat(totalEmployerCost.toFixed(2)),
          receipts: {
            create: receipts,
          },
        },
      });
      console.warn(
        `  Payroll period ${pp.start} to ${pp.end} (${pp.status}): ${receipts.length} receipts, gross $${totalGross.toLocaleString()}`,
      );
    }
  }

  // ==================================================================
  // 14. SHIFT TEMPLATES
  // ==================================================================
  console.warn("\n--- Creating Shift Templates ---");

  const shiftDefs = [
    { name: "Matutino", startTime: "08:00", endTime: "16:00", breakMinutes: 30, color: "#3B82F6" },
    {
      name: "Vespertino",
      startTime: "14:00",
      endTime: "22:00",
      breakMinutes: 30,
      color: "#10B981",
    },
    { name: "Nocturno", startTime: "22:00", endTime: "06:00", breakMinutes: 30, color: "#6366F1" },
    {
      name: "Medio Turno",
      startTime: "10:00",
      endTime: "14:00",
      breakMinutes: 0,
      color: "#F59E0B",
    },
  ];

  const shiftTemplates: Record<string, string> = {};
  for (const s of shiftDefs) {
    const existing = await prisma.shiftTemplate.findFirst({
      where: { organizationId: org.id, name: s.name },
    });
    if (existing) {
      shiftTemplates[s.name] = existing.id;
    } else {
      const created = await prisma.shiftTemplate.create({
        data: {
          organizationId: org.id,
          name: s.name,
          startTime: s.startTime,
          endTime: s.endTime,
          breakMinutes: s.breakMinutes,
          color: s.color,
        },
      });
      shiftTemplates[s.name] = created.id;
      console.warn(`  Shift template created: ${s.name} (${s.startTime}-${s.endTime})`);
    }
  }

  // ==================================================================
  // 15. SHIFT ASSIGNMENTS (2 weeks, 3 branches)
  // ==================================================================
  console.warn("\n--- Creating Shift Assignments ---");

  const existingShifts = await prisma.shiftAssignment.count({ where: { organizationId: org.id } });

  if (existingShifts > 0) {
    console.warn(`  ${existingShifts} shift assignments already exist — skipping`);
  } else {
    const shiftBranches = ["CDMX01", "CDMX02", "GDL01"];
    const shiftNames = ["Matutino", "Vespertino", "Medio Turno"];
    let assignCount = 0;

    for (const bCode of shiftBranches) {
      const branch = branches[bCode];
      if (!branch) continue;

      const branchEmployees = employeeRecords.filter((e) => e.branchId === branch.id);
      if (branchEmployees.length === 0) continue;

      for (let dayOffset = 0; dayOffset < 14; dayOffset++) {
        const date = daysAgo(dayOffset);
        // Reset time to midnight for date-only field
        date.setHours(0, 0, 0, 0);

        for (const emp of branchEmployees) {
          // Skip Sundays (rest day)
          if (date.getDay() === 0) continue;

          const shiftName = pick(shiftNames);
          const templateId = shiftTemplates[shiftName];
          if (!templateId) continue;

          // Check for existing assignment on this date
          const exists = await prisma.shiftAssignment.findFirst({
            where: { employeeId: emp.id, date },
          });
          if (exists) continue;

          await prisma.shiftAssignment.create({
            data: {
              organizationId: org.id,
              employeeId: emp.id,
              branchId: branch.id,
              shiftTemplateId: templateId,
              date,
              status: dayOffset > 0 ? "COMPLETED" : "SCHEDULED",
            },
          });
          assignCount++;
        }
      }
    }
    console.warn(`  Shift assignments created: ${assignCount}`);
  }

  // ==================================================================
  // 16. ATTENDANCE RECORDS (2 weeks, 3 branches)
  // ==================================================================
  console.warn("\n--- Creating Attendance Records ---");

  const existingAttendance = await prisma.attendanceRecord.count({
    where: { organizationId: org.id },
  });

  if (existingAttendance > 0) {
    console.warn(`  ${existingAttendance} attendance records already exist — skipping`);
  } else {
    const attendanceBranches = ["CDMX01", "CDMX02", "GDL01"];
    const statusWeights = [
      "PRESENT",
      "PRESENT",
      "PRESENT",
      "PRESENT",
      "PRESENT",
      "PRESENT",
      "PRESENT",
      "LATE",
      "LATE",
      "ABSENT",
    ];
    let attCount = 0;

    for (const bCode of attendanceBranches) {
      const branch = branches[bCode];
      if (!branch) continue;

      const branchEmployees = employeeRecords.filter((e) => e.branchId === branch.id);
      if (branchEmployees.length === 0) continue;

      for (let dayOffset = 1; dayOffset <= 14; dayOffset++) {
        const date = daysAgo(dayOffset);
        date.setHours(0, 0, 0, 0);

        // Skip Sundays
        if (date.getDay() === 0) continue;

        for (const emp of branchEmployees) {
          const status = pick(statusWeights);

          const exists = await prisma.attendanceRecord.findFirst({
            where: { employeeId: emp.id, date },
          });
          if (exists) continue;

          let clockIn: Date | null = null;
          let clockOut: Date | null = null;
          let lateMinutes = 0;
          let workedHours: number | null = null;

          if (status === "PRESENT") {
            clockIn = new Date(date);
            clockIn.setHours(8, randInt(0, 5), 0, 0);
            clockOut = new Date(date);
            clockOut.setHours(16, randInt(0, 15), 0, 0);
            workedHours = 8;
          } else if (status === "LATE") {
            lateMinutes = randInt(5, 45);
            clockIn = new Date(date);
            clockIn.setHours(8, lateMinutes, 0, 0);
            clockOut = new Date(date);
            clockOut.setHours(16, randInt(0, 30), 0, 0);
            workedHours = parseFloat((8 - lateMinutes / 60).toFixed(2));
          }
          // ABSENT: no clockIn/clockOut

          await prisma.attendanceRecord.create({
            data: {
              organizationId: org.id,
              employeeId: emp.id,
              branchId: branch.id,
              date,
              clockIn,
              clockOut,
              scheduledIn: "08:00",
              scheduledOut: "16:00",
              status,
              lateMinutes,
              workedHours,
              source: "MANUAL",
            },
          });
          attCount++;
        }
      }
    }
    console.warn(`  Attendance records created: ${attCount}`);
  }

  // ==================================================================
  // 17. BRANCH BUDGETS (3 branches x 12 months x 5 categories)
  // ==================================================================
  console.warn("\n--- Creating Branch Budgets ---");

  const existingBudgets = await prisma.branchBudget.count({ where: { organizationId: org.id } });

  if (existingBudgets > 0) {
    console.warn(`  ${existingBudgets} budgets already exist — skipping`);
  } else {
    const budgetBranches = ["CDMX01", "CDMX02", "GDL01"];
    const budgetCategories: Record<string, { min: number; max: number }> = {
      LABOR: { min: 120000, max: 200000 },
      FOOD_COST: { min: 80000, max: 150000 },
      RENT: { min: 35000, max: 65000 },
      UTILITIES: { min: 8000, max: 18000 },
      MARKETING: { min: 10000, max: 35000 },
    };

    let budgetCount = 0;
    for (const bCode of budgetBranches) {
      const branch = branches[bCode];
      if (!branch) continue;

      for (let month = 1; month <= 12; month++) {
        for (const [category, range] of Object.entries(budgetCategories)) {
          // Add seasonal variation
          const seasonMultiplier = [12, 7, 8].includes(month)
            ? 1.2
            : [1, 2].includes(month)
              ? 0.85
              : 1.0;
          const amount = parseFloat((randDec(range.min, range.max) * seasonMultiplier).toFixed(2));

          await prisma.branchBudget.create({
            data: {
              organizationId: org.id,
              branchId: branch.id,
              year: 2026,
              month,
              category,
              budgetAmount: amount,
            },
          });
          budgetCount++;
        }
      }
    }
    console.warn(`  Branch budgets created: ${budgetCount}`);
  }

  // ==================================================================
  // 18. NOTIFICATIONS (25 for admin)
  // ==================================================================
  console.warn("\n--- Creating Notifications ---");

  const existingNotifs = await prisma.notification.count({ where: { userId: adminUser.id } });

  if (existingNotifs > 0) {
    console.warn(`  ${existingNotifs} notifications already exist — skipping`);
  } else {
    const notifDefs = [
      {
        type: "LOW_STOCK",
        severity: "warning",
        title: "Inventario bajo: Salmon Fresco",
        message:
          "El inventario de Salmon Fresco en Luka Polanco esta por debajo del minimo (3.2 kg restantes, minimo: 6.9 kg)",
        link: "/inventarios",
      },
      {
        type: "LOW_STOCK",
        severity: "critical",
        title: "Stock critico: Masago",
        message:
          "Masago en Luka Roma tiene solo 0.5 kg. Requerido: 5 kg. Generar orden de compra urgente.",
        link: "/inventarios",
      },
      {
        type: "LOW_STOCK",
        severity: "warning",
        title: "Inventario bajo: Aguacate",
        message: "Aguacate en Luka Providencia esta al 15% de stock minimo.",
        link: "/inventarios",
      },
      {
        type: "PENDING_ORDER",
        severity: "info",
        title: "Orden de compra pendiente",
        message: "La OC #FAC-PES-0012 de Pescaderia del Pacifico lleva 5 dias sin confirmacion.",
        link: "/compras",
      },
      {
        type: "PENDING_ORDER",
        severity: "warning",
        title: "OC retrasada",
        message:
          "Orden de compra a Distribuidora Yakimeshi debio llegar el 02/04/2026 y sigue en transito.",
        link: "/compras",
      },
      {
        type: "OVERDUE_PAYABLE",
        severity: "critical",
        title: "Cuenta por pagar vencida",
        message: "Factura FAC-KIK-0008 de Kikkoman Mexico ($42,500 MXN) vencio hace 12 dias.",
        link: "/finanzas/cxp",
      },
      {
        type: "OVERDUE_PAYABLE",
        severity: "warning",
        title: "CxP proxima a vencer",
        message: "Factura de Plasticos EcoPack por $18,200 MXN vence en 3 dias.",
        link: "/finanzas/cxp",
      },
      {
        type: "OVERDUE_PAYABLE",
        severity: "critical",
        title: "3 facturas vencidas",
        message: "Tienes 3 facturas de proveedores vencidas por un total de $87,300 MXN.",
        link: "/finanzas/cxp",
      },
      {
        type: "PAYROLL_PENDING",
        severity: "info",
        title: "Nomina por aprobar",
        message:
          "La nomina del periodo 01-15 Abril 2026 esta calculada y lista para aprobacion. Total neto: $185,430 MXN.",
        link: "/nomina",
      },
      {
        type: "PAYROLL_PENDING",
        severity: "warning",
        title: "Plazo de dispersion",
        message:
          "La nomina de la primera quincena de abril debe dispersarse antes del 16 de abril.",
        link: "/nomina",
      },
      {
        type: "SHIFT_CHANGE",
        severity: "info",
        title: "Cambio de turno solicitado",
        message:
          "Alejandro Ramirez solicita cambio de turno Matutino a Vespertino para el 10/04/2026.",
        link: "/rrhh/turnos",
      },
      {
        type: "SHIFT_CHANGE",
        severity: "info",
        title: "Asistencia incompleta",
        message: "3 empleados no registraron salida ayer en Luka Roma.",
        link: "/rrhh/asistencia",
      },
      {
        type: "REQUISITION_STATUS",
        severity: "info",
        title: "Nueva requisicion",
        message: "Luka Cancun solicita resurtido de 15 productos. Prioridad: ALTA.",
        link: "/inventarios/requisiciones",
      },
      {
        type: "REQUISITION_STATUS",
        severity: "info",
        title: "Requisicion aprobada",
        message: "Requisicion de Luka San Pedro ha sido aprobada. 8 productos listos para envio.",
        link: "/inventarios/requisiciones",
      },
      {
        type: "DELIVERY_UPDATE",
        severity: "info",
        title: "Resumen delivery diario",
        message:
          "Ayer se procesaron 23 ordenes de delivery. Ingreso neto: $8,450 MXN. Plataforma top: UberEats (12 ordenes).",
        link: "/delivery",
      },
      {
        type: "DELIVERY_UPDATE",
        severity: "warning",
        title: "Cancelacion elevada en Rappi",
        message: "La tasa de cancelacion en Rappi subio a 15% esta semana en Luka Condesa.",
        link: "/delivery",
      },
      {
        type: "SYSTEM",
        severity: "info",
        title: "Sincronizacion Corntech exitosa",
        message: "Se sincronizaron 45 ventas de 5 sucursales. Ultima sincronizacion: hace 2 horas.",
        link: "/integraciones/corntech",
      },
      {
        type: "SYSTEM",
        severity: "info",
        title: "Respaldo de datos completado",
        message:
          "El respaldo automatico de la base de datos se completo exitosamente a las 03:00 AM.",
        link: "/configuracion",
      },
      {
        type: "SYSTEM",
        severity: "warning",
        title: "Periodo fiscal por cerrar",
        message: "El periodo fiscal de Marzo 2026 aun no se ha cerrado. Fecha limite: 17 de abril.",
        link: "/contabilidad/periodos",
      },
      {
        type: "CUSTOM",
        severity: "info",
        title: "Meta de ventas alcanzada",
        message: "Luka Polanco alcanzo el 105% de su meta de ventas de marzo. Total: $487,200 MXN.",
        link: "/reportes",
      },
      {
        type: "CUSTOM",
        severity: "info",
        title: "Nuevo cliente frecuente",
        message:
          "Santiago Diaz Ordaz alcanzo nivel Oro en el programa de lealtad con 3,100 puntos.",
        link: "/crm/clientes",
      },
      {
        type: "LOW_STOCK",
        severity: "warning",
        title: "Alerta de caducidad",
        message: "5 lotes de productos caducan en los proximos 7 dias en CEDIS Central.",
        link: "/inventarios/lotes",
      },
      {
        type: "SYSTEM",
        severity: "info",
        title: "Actualizacion de sistema",
        message:
          "Se actualizo el modulo de reportes con nuevas graficas de tendencia y comparativos.",
        link: "/reportes",
      },
      {
        type: "DELIVERY_UPDATE",
        severity: "info",
        title: "Mejor mes en delivery",
        message:
          "Marzo 2026 fue el mejor mes en delivery con 312 ordenes y $125,400 MXN de ingreso neto.",
        link: "/delivery",
      },
      {
        type: "OVERDUE_PAYABLE",
        severity: "info",
        title: "Pago registrado",
        message:
          "Se registro el pago de $85,000 MXN a Pescaderia del Pacifico. Saldo pendiente: $0.",
        link: "/finanzas/cxp",
      },
    ];

    for (let i = 0; i < notifDefs.length; i++) {
      const n = notifDefs[i];
      const isRead = i < 10; // first 10 are read, rest unread
      await prisma.notification.create({
        data: {
          organizationId: org.id,
          userId: adminUser.id,
          type: n.type,
          severity: n.severity,
          title: n.title,
          message: n.message,
          link: n.link,
          isRead,
          readAt: isRead ? daysAgo(randInt(0, 5)) : null,
          createdAt: daysAgo(randInt(0, 14)),
        },
      });
    }
    console.warn(`  Notifications created: ${notifDefs.length}`);
  }

  // ==================================================================
  // 19. AUDIT LOGS (60)
  // ==================================================================
  console.warn("\n--- Creating Audit Logs ---");

  const existingAudit = await prisma.auditLog.count({ where: { organizationId: org.id } });

  if (existingAudit > 0) {
    console.warn(`  ${existingAudit} audit logs already exist — skipping`);
  } else {
    const auditTemplates = [
      { action: "LOGIN", module: "AUTH", desc: "Inicio de sesion exitoso" },
      { action: "LOGIN", module: "AUTH", desc: "Inicio de sesion desde nueva IP" },
      { action: "LOGOUT", module: "AUTH", desc: "Cierre de sesion" },
      {
        action: "CREATE",
        module: "COMPRAS",
        desc: "Creo orden de compra",
        entityType: "PurchaseOrder",
      },
      {
        action: "UPDATE",
        module: "COMPRAS",
        desc: "Actualizo status de orden de compra a SENT",
        entityType: "PurchaseOrder",
      },
      {
        action: "CREATE",
        module: "INVENTARIOS",
        desc: "Registro movimiento de inventario",
        entityType: "InventoryMovement",
      },
      {
        action: "UPDATE",
        module: "INVENTARIOS",
        desc: "Ajuste de inventario por conteo fisico",
        entityType: "BranchInventory",
      },
      {
        action: "CREATE",
        module: "INVENTARIOS",
        desc: "Creo transferencia entre sucursales",
        entityType: "InterBranchTransfer",
      },
      {
        action: "UPDATE",
        module: "INVENTARIOS",
        desc: "Transferencia recibida en sucursal",
        entityType: "InterBranchTransfer",
      },
      {
        action: "CREATE",
        module: "NOMINA",
        desc: "Genero periodo de nomina quincenal",
        entityType: "PayrollPeriod",
      },
      {
        action: "UPDATE",
        module: "NOMINA",
        desc: "Aprobo nomina para dispersion",
        entityType: "PayrollPeriod",
      },
      {
        action: "CREATE",
        module: "BANCOS",
        desc: "Registro transaccion bancaria",
        entityType: "BankTransaction",
      },
      {
        action: "UPDATE",
        module: "BANCOS",
        desc: "Concilio transaccion bancaria",
        entityType: "BankTransaction",
      },
      {
        action: "CREATE",
        module: "CONTABILIDAD",
        desc: "Creo poliza contable",
        entityType: "JournalEntry",
      },
      {
        action: "UPDATE",
        module: "CONTABILIDAD",
        desc: "Posteo poliza contable",
        entityType: "JournalEntry",
      },
      { action: "EXPORT", module: "REPORTES", desc: "Exporto reporte de ventas a Excel" },
      { action: "EXPORT", module: "REPORTES", desc: "Exporto estado de resultados PDF" },
      {
        action: "CREATE",
        module: "USERS",
        desc: "Creo nuevo usuario del sistema",
        entityType: "User",
      },
      { action: "UPDATE", module: "USERS", desc: "Actualizo permisos de rol", entityType: "Role" },
      {
        action: "CREATE",
        module: "MERMA",
        desc: "Registro merma de producto",
        entityType: "WasteLog",
      },
      {
        action: "CREATE",
        module: "DELIVERY",
        desc: "Nuevo pedido de delivery sincronizado",
        entityType: "DeliveryOrder",
      },
      {
        action: "UPDATE",
        module: "DELIVERY",
        desc: "Pedido de delivery entregado",
        entityType: "DeliveryOrder",
      },
      {
        action: "CREATE",
        module: "LEALTAD",
        desc: "Asigno puntos de lealtad",
        entityType: "LoyaltyTransaction",
      },
      {
        action: "UPDATE",
        module: "LEALTAD",
        desc: "Canjeo recompensa de lealtad",
        entityType: "LoyaltyTransaction",
      },
      { action: "CREATE", module: "FACTURACION", desc: "Genero factura CFDI", entityType: "CFDI" },
      {
        action: "UPDATE",
        module: "CONFIGURACION",
        desc: "Actualizo configuracion de sucursal",
        entityType: "Branch",
      },
      {
        action: "CREATE",
        module: "TURNOS",
        desc: "Asigno turno a empleado",
        entityType: "ShiftAssignment",
      },
      {
        action: "UPDATE",
        module: "ASISTENCIA",
        desc: "Registro check-in de empleado",
        entityType: "AttendanceRecord",
      },
    ];

    const ipAddresses = [
      "189.203.45.67",
      "201.174.22.110",
      "187.192.88.45",
      "189.145.62.30",
      "201.141.95.80",
      "177.243.11.55",
    ];

    let auditCount = 0;
    for (let i = 0; i < 60; i++) {
      const template = pick(auditTemplates);
      const user = pick(allUsers);

      await prisma.auditLog.create({
        data: {
          organizationId: org.id,
          userId: user.id,
          userName: `${user.firstName} ${user.lastName}`,
          action: template.action,
          module: template.module,
          entityType: template.entityType || null,
          entityId: template.entityType ? `cuid_${randInt(10000, 99999)}` : null,
          description: template.desc,
          ipAddress: pick(ipAddresses),
          userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          createdAt: daysAgo(randInt(0, 30)),
        },
      });
      auditCount++;
    }
    console.warn(`  Audit logs created: ${auditCount}`);
  }

  // ==================================================================
  // 20. CORNTECH CASH CLOSINGS (30 days x 3 branches)
  // ==================================================================
  console.warn("\n--- Creating Corntech Cash Closings ---");

  const existingClosings = await prisma.corntechCashClosing.count({
    where: { branchId: { in: branchRecords.map((b) => b.id) } },
  });

  if (existingClosings > 0) {
    console.warn(`  ${existingClosings} cash closings already exist — skipping`);
  } else {
    const closingBranches = ["CDMX01", "CDMX02", "GDL01"];
    const cashierNames = [
      "Alejandro R.",
      "Sofia M.",
      "Fernando G.",
      "Valentina H.",
      "Guadalupe T.",
    ];
    let closingCount = 0;

    for (const bCode of closingBranches) {
      const branch = branches[bCode];
      if (!branch) continue;

      for (let dayOffset = 1; dayOffset <= 30; dayOffset++) {
        const closingDate = daysAgo(dayOffset);
        const totalCash = randDec(3000, 12000);
        const totalCard = randDec(8000, 25000);
        const totalOther = randDec(500, 3000);
        const expectedTotal = parseFloat((totalCash + totalCard + totalOther).toFixed(2));
        const diff = randDec(-50, 50);
        const actualTotal = parseFloat((expectedTotal + diff).toFixed(2));

        await prisma.corntechCashClosing.create({
          data: {
            branchId: branch.id,
            corntechClosingId: `CC-${bCode}-${dayOffset}-${Date.now()}`,
            closingDate,
            totalCash,
            totalCard,
            totalOther,
            expectedTotal,
            actualTotal,
            difference: parseFloat(diff.toFixed(2)),
            cashierName: pick(cashierNames),
          },
        });
        closingCount++;
      }
    }
    console.warn(`  Cash closings created: ${closingCount}`);
  }

  // ==================================================================
  // SUMMARY
  // ==================================================================
  console.warn("\n=== Sprint 5 Seed Summary ===");

  const counts = {
    "Product Presentations": await prisma.productPresentation.count(),
    "Inventory Movements": await prisma.inventoryMovement.count(),
    "Inter-Branch Transfers": await prisma.interBranchTransfer.count(),
    "Purchase Orders": await prisma.purchaseOrder.count(),
    "POS Sales": await prisma.posSale.count(),
    "Corntech Sales": await prisma.corntechSale.count(),
    "Cash Closings": await prisma.corntechCashClosing.count(),
    "Bank Transactions": await prisma.bankTransaction.count(),
    "Accounts Payable": await prisma.accountPayable.count(),
    "Accounts Receivable": await prisma.accountReceivable.count(),
    Payments: await prisma.payment.count(),
    "Journal Entries": await prisma.journalEntry.count(),
    "Payroll Periods": await prisma.payrollPeriod.count(),
    "Payroll Receipts": await prisma.payrollReceipt.count(),
    "Shift Templates": await prisma.shiftTemplate.count(),
    "Shift Assignments": await prisma.shiftAssignment.count(),
    "Attendance Records": await prisma.attendanceRecord.count(),
    "Branch Budgets": await prisma.branchBudget.count(),
    Notifications: await prisma.notification.count({ where: { userId: adminUser.id } }),
    "Audit Logs": await prisma.auditLog.count({ where: { organizationId: org.id } }),
  };

  for (const [key, val] of Object.entries(counts)) {
    console.warn(`  ${key.padEnd(25)} ${val}`);
  }

  console.warn("\nSprint 5 seed completed successfully!");
}

main()
  .catch((e) => {
    console.error("Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
