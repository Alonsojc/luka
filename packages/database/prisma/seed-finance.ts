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
  d.setHours(randInt(8, 18), randInt(0, 59), 0, 0);
  return d;
}

// SAT product/service codes for poke & restaurant
const SAT_PRODUCTS = [
  { clave: "90101500", desc: "Servicios de restaurante", unidad: "E48", unitName: "Servicio" },
  {
    clave: "50202301",
    desc: "Alimentos preparados - Bowl de poke",
    unidad: "H87",
    unitName: "Pieza",
  },
  { clave: "50202301", desc: "Alimentos preparados - Ensalada", unidad: "H87", unitName: "Pieza" },
  {
    clave: "50202301",
    desc: "Alimentos preparados - Burrito bowl",
    unidad: "H87",
    unitName: "Pieza",
  },
  { clave: "50202301", desc: "Postre del dia", unidad: "H87", unitName: "Pieza" },
  { clave: "50202301", desc: "Bebida natural", unidad: "H87", unitName: "Pieza" },
  { clave: "50202301", desc: "Proteina extra (salmon/atun)", unidad: "KGM", unitName: "Kilogramo" },
  { clave: "50131700", desc: "Arroz de sushi", unidad: "KGM", unitName: "Kilogramo" },
  { clave: "50161500", desc: "Salsa de soya", unidad: "LTR", unitName: "Litro" },
  { clave: "50151500", desc: "Aguacate / Guacamole", unidad: "KGM", unitName: "Kilogramo" },
  { clave: "78101800", desc: "Servicio de delivery", unidad: "E48", unitName: "Servicio" },
  {
    clave: "80141600",
    desc: "Servicio de catering corporativo",
    unidad: "E48",
    unitName: "Evento",
  },
];

// Client data for receivers
const RECEIVERS = [
  { rfc: "XAXX010101000", name: "Publico en general", regimen: "616", usoCfdi: "S01" },
  { rfc: "GOLA850312HDF", name: "Laura Gomez Reyes", regimen: "612", usoCfdi: "G03" },
  { rfc: "MARL900725QR5", name: "Roberto Martinez Lopez", regimen: "612", usoCfdi: "G03" },
  {
    rfc: "ABC120301EX4",
    name: "Alimentos y Bebidas Corp SA de CV",
    regimen: "601",
    usoCfdi: "G03",
  },
  {
    rfc: "SER980515TQ2",
    name: "Servicios Empresariales del Norte SA",
    regimen: "601",
    usoCfdi: "G01",
  },
  { rfc: "TEC200110MX7", name: "Tecnologia y Logistica SA de CV", regimen: "601", usoCfdi: "G03" },
  { rfc: "HOT191201AB3", name: "Hotel Boutique Reforma SA de CV", regimen: "601", usoCfdi: "G01" },
  { rfc: "CON180601CD2", name: "Consultores Asociados SC", regimen: "601", usoCfdi: "G01" },
  { rfc: "PESC880415QW1", name: "Carlos Perez Sanchez", regimen: "612", usoCfdi: "G03" },
  { rfc: "HERA950210NJ8", name: "Andrea Hernandez Ruiz", regimen: "612", usoCfdi: "G01" },
];

const PAYMENT_FORMS = [
  { code: "01", label: "Efectivo" },
  { code: "03", label: "Transferencia" },
  { code: "04", label: "Tarjeta de credito" },
  { code: "28", label: "Tarjeta de debito" },
];

async function main() {
  console.log("=== Seed Finance — CFDIs ===\n");

  const org = await prisma.organization.findFirstOrThrow({ where: { rfc: "LUK240101AAA" } });
  const branches = await prisma.branch.findMany({
    where: { organizationId: org.id, isActive: true },
  });
  const admin = await prisma.user.findFirstOrThrow({ where: { email: "admin@lukapoke.com" } });

  // Check existing
  const existingCfdis = await prisma.cFDI.count({ where: { organizationId: org.id } });
  if (existingCfdis > 0) {
    console.log(`  ${existingCfdis} CFDIs already exist — skipping`);
    return;
  }

  const storeBranches = branches.filter((b) => b.branchType !== "CEDIS");
  let cfdiCount = 0;
  let folioCounter = 1;

  // ------------------------------------------------------------------
  // INGRESO invoices (35) — the main revenue invoices
  // ------------------------------------------------------------------
  console.log("Creating INGRESO CFDIs...");
  for (let i = 0; i < 35; i++) {
    const receiver = pick(RECEIVERS);
    const branch = pick(storeBranches);
    const daysBack = randInt(1, 90);
    const createdAt = daysAgo(daysBack);
    const numConcepts = randInt(1, 5);

    // Generate concepts
    const concepts: {
      satClaveProdServ: string;
      quantity: number;
      unitOfMeasure: string;
      satClaveUnidad: string;
      description: string;
      unitPrice: number;
      amount: number;
      discount: number;
      taxDetails: any;
    }[] = [];

    let subtotal = 0;
    for (let c = 0; c < numConcepts; c++) {
      const prod = pick(SAT_PRODUCTS);
      const qty = randInt(1, 20);
      const unitPrice = randDec(85, 450);
      const amount = parseFloat((qty * unitPrice).toFixed(2));
      subtotal += amount;
      concepts.push({
        satClaveProdServ: prod.clave,
        quantity: qty,
        unitOfMeasure: prod.unitName,
        satClaveUnidad: prod.unidad,
        description: prod.desc,
        unitPrice,
        amount,
        discount: 0,
        taxDetails: {
          traslados: [
            {
              impuesto: "002",
              tipoFactor: "Tasa",
              tasaOCuota: "0.160000",
              base: amount,
              importe: parseFloat((amount * 0.16).toFixed(2)),
            },
          ],
        },
      });
    }

    const iva = parseFloat((subtotal * 0.16).toFixed(2));
    const total = parseFloat((subtotal + iva).toFixed(2));

    const isStamped = Math.random() < 0.6;
    const isCancelled = !isStamped && Math.random() < 0.15;
    const status = isCancelled ? "CANCELLED" : isStamped ? "STAMPED" : "DRAFT";

    const payForm = pick(PAYMENT_FORMS);
    const folio = String(folioCounter++).padStart(5, "0");

    await prisma.cFDI.create({
      data: {
        organizationId: org.id,
        branchId: branch.id,
        cfdiType: "INGRESO",
        series: "A",
        folio,
        uuid: status === "STAMPED" ? `${crypto.randomUUID()}` : null,
        issuerRfc: org.rfc,
        issuerName: org.name,
        issuerRegimen: "601",
        receiverRfc: receiver.rfc,
        receiverName: receiver.name,
        receiverRegimen: receiver.regimen,
        receiverUsoCfdi: receiver.usoCfdi,
        subtotal,
        discount: 0,
        total,
        currency: "MXN",
        paymentMethod: receiver.rfc === "XAXX010101000" ? "PUE" : pick(["PUE", "PPD"]),
        paymentForm: payForm.code,
        status: status as any,
        stampedAt: status === "STAMPED" ? createdAt : null,
        cancelledAt: status === "CANCELLED" ? daysAgo(daysBack - randInt(1, 5)) : null,
        cancellationReason: status === "CANCELLED" ? pick(["01", "02", "03"]) : null,
        createdById: admin.id,
        createdAt,
        concepts: {
          create: concepts,
        },
      },
    });
    cfdiCount++;
  }
  console.log(`  INGRESO CFDIs: ${cfdiCount}`);

  // ------------------------------------------------------------------
  // EGRESO (credit notes) — 8 linked to random INGRESO
  // ------------------------------------------------------------------
  console.log("Creating EGRESO CFDIs (notas de credito)...");
  const stampedIngresos = await prisma.cFDI.findMany({
    where: { organizationId: org.id, cfdiType: "INGRESO", status: "STAMPED" },
    take: 8,
  });

  let egresoCount = 0;
  for (const parent of stampedIngresos) {
    const folio = String(folioCounter++).padStart(5, "0");
    const ncSubtotal = parseFloat((Number(parent.subtotal) * randDec(0.1, 0.5)).toFixed(2));
    const ncIva = parseFloat((ncSubtotal * 0.16).toFixed(2));
    const ncTotal = parseFloat((ncSubtotal + ncIva).toFixed(2));

    await prisma.cFDI.create({
      data: {
        organizationId: org.id,
        branchId: parent.branchId,
        cfdiType: "EGRESO",
        series: "NC",
        folio,
        uuid: `${crypto.randomUUID()}`,
        issuerRfc: org.rfc,
        issuerName: org.name,
        issuerRegimen: "601",
        receiverRfc: parent.receiverRfc,
        receiverName: parent.receiverName,
        receiverRegimen: parent.receiverRegimen,
        receiverUsoCfdi: parent.receiverUsoCfdi,
        subtotal: ncSubtotal,
        discount: 0,
        total: ncTotal,
        currency: "MXN",
        paymentMethod: "PUE",
        paymentForm: "17", // Compensacion
        status: "STAMPED",
        stampedAt: daysAgo(randInt(1, 30)),
        createdById: admin.id,
        concepts: {
          create: [
            {
              satClaveProdServ: "84111506",
              quantity: 1,
              unitOfMeasure: "Actividad",
              satClaveUnidad: "ACT",
              description: "Nota de credito - devolucion parcial",
              unitPrice: ncSubtotal,
              amount: ncSubtotal,
              discount: 0,
              taxDetails: {
                traslados: [
                  {
                    impuesto: "002",
                    tipoFactor: "Tasa",
                    tasaOCuota: "0.160000",
                    base: ncSubtotal,
                    importe: ncIva,
                  },
                ],
              },
            },
          ],
        },
        relatedCfdis: {
          create: [
            {
              relatedCfdiUuid: parent.uuid!,
              relationshipType: "01", // Nota de credito
            },
          ],
        },
      },
    });
    egresoCount++;
  }
  console.log(`  EGRESO CFDIs: ${egresoCount}`);

  // ------------------------------------------------------------------
  // PAGO (payment complements) — 5
  // ------------------------------------------------------------------
  console.log("Creating PAGO CFDIs (complementos de pago)...");
  const ppdIngresos = await prisma.cFDI.findMany({
    where: { organizationId: org.id, cfdiType: "INGRESO", status: "STAMPED", paymentMethod: "PPD" },
    take: 5,
  });

  let pagoCount = 0;
  for (const parent of ppdIngresos) {
    const folio = String(folioCounter++).padStart(5, "0");
    const paymentAmount = parseFloat((Number(parent.total) * randDec(0.5, 1.0)).toFixed(2));

    await prisma.cFDI.create({
      data: {
        organizationId: org.id,
        branchId: parent.branchId,
        cfdiType: "PAGO",
        series: "P",
        folio,
        uuid: `${crypto.randomUUID()}`,
        issuerRfc: org.rfc,
        issuerName: org.name,
        issuerRegimen: "601",
        receiverRfc: parent.receiverRfc,
        receiverName: parent.receiverName,
        receiverRegimen: parent.receiverRegimen,
        receiverUsoCfdi: "CP01",
        subtotal: 0,
        discount: 0,
        total: 0,
        currency: "MXN",
        paymentMethod: null,
        paymentForm: null,
        status: "STAMPED",
        stampedAt: daysAgo(randInt(1, 20)),
        createdById: admin.id,
        paymentComplement: {
          create: {
            paymentDate: daysAgo(randInt(1, 25)),
            paymentForm: pick(["03", "04", "28"]),
            currency: "MXN",
            amount: paymentAmount,
            relatedDocuments: JSON.stringify([
              {
                uuid: parent.uuid,
                serie: parent.series,
                folio: parent.folio,
                parcialidad: 1,
                saldoAnterior: Number(parent.total),
                importePagado: paymentAmount,
                saldoInsoluto: parseFloat((Number(parent.total) - paymentAmount).toFixed(2)),
              },
            ]),
          },
        },
      },
    });
    pagoCount++;
  }
  console.log(`  PAGO CFDIs: ${pagoCount}`);

  // ------------------------------------------------------------------
  // Fiscal Periods (if missing)
  // ------------------------------------------------------------------
  const existingFP = await prisma.fiscalPeriod.count({ where: { organizationId: org.id } });
  if (existingFP === 0) {
    console.log("\nCreating Fiscal Periods...");
    const months = [
      { y: 2026, m: 1 },
      { y: 2026, m: 2 },
      { y: 2026, m: 3 },
      { y: 2026, m: 4 },
    ];
    for (const { y, m } of months) {
      await prisma.fiscalPeriod.create({
        data: {
          organizationId: org.id,
          year: y,
          month: m,
          status: m < 4 ? "CLOSED" : "OPEN",
          closedAt: m < 4 ? new Date(y, m, 1) : null,
        },
      });
    }
    console.log("  Fiscal periods created: 4 (Jan-Apr 2026)");
  }

  // ------------------------------------------------------------------
  // Summary
  // ------------------------------------------------------------------
  console.log("\n=== Finance Seed Complete ===");
  console.log({
    "INGRESO CFDIs": cfdiCount,
    "EGRESO CFDIs (notas de credito)": egresoCount,
    "PAGO CFDIs (complementos)": pagoCount,
    "Total CFDIs": cfdiCount + egresoCount + pagoCount,
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
