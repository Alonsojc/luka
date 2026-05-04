import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { seedLukaMasterData } from "./luka-master-seed";

const prisma = new PrismaClient();

async function main() {
  console.warn("Seeding Luka System database...");

  // 1. Create Organization
  const org = await prisma.organization.upsert({
    where: { rfc: "LUK240101AAA" },
    update: {},
    create: {
      name: "Luka Poke",
      rfc: "LUK240101AAA",
      razonSocial: "Luka Poke S.A. de C.V.",
      regimenFiscal: "601",
    },
  });
  console.warn("Organization created:", org.name);

  // 2. Create System Roles
  const roleDefinitions = [
    {
      name: "owner",
      description: "Dueño - acceso total",
      permissions: [
        "sucursales:view",
        "sucursales:create",
        "sucursales:update",
        "sucursales:delete",
        "sucursales:approve",
        "sucursales:export",
        "usuarios:view",
        "usuarios:create",
        "usuarios:update",
        "usuarios:delete",
        "usuarios:approve",
        "usuarios:export",
        "inventarios:view",
        "inventarios:create",
        "inventarios:update",
        "inventarios:delete",
        "inventarios:approve",
        "inventarios:export",
        "compras:view",
        "compras:create",
        "compras:update",
        "compras:delete",
        "compras:approve",
        "compras:export",
        "bancos:view",
        "bancos:create",
        "bancos:update",
        "bancos:delete",
        "bancos:approve",
        "bancos:export",
        "nomina:view",
        "nomina:create",
        "nomina:update",
        "nomina:delete",
        "nomina:approve",
        "nomina:export",
        "facturacion:view",
        "facturacion:create",
        "facturacion:update",
        "facturacion:delete",
        "facturacion:approve",
        "facturacion:export",
        "contabilidad:view",
        "contabilidad:create",
        "contabilidad:update",
        "contabilidad:delete",
        "contabilidad:approve",
        "contabilidad:export",
        "reportes:view",
        "reportes:export",
        "inversionistas:view",
        "inversionistas:export",
        "crm:view",
        "crm:create",
        "crm:update",
        "crm:delete",
        "crm:approve",
        "crm:export",
        "corntech:view",
        "corntech:create",
        "corntech:update",
        "corntech:delete",
        "configuracion:view",
        "configuracion:create",
        "configuracion:update",
        "configuracion:delete",
        "delivery:view",
        "delivery:create",
        "delivery:update",
        "delivery:delete",
        "merma:view",
        "merma:create",
        "merma:update",
        "merma:delete",
        "lealtad:view",
        "lealtad:create",
        "lealtad:update",
        "lealtad:delete",
      ],
    },
    {
      name: "investor",
      description: "Inversionista - solo lectura financiera",
      permissions: [
        "reportes:view",
        "reportes:export",
        "inversionistas:view",
        "inversionistas:export",
        "bancos:view",
        "contabilidad:view",
        "sucursales:view",
      ],
    },
    {
      name: "zone_manager",
      description: "Gerente de zona - múltiples sucursales",
      permissions: [
        "sucursales:view",
        "inventarios:view",
        "inventarios:create",
        "inventarios:update",
        "inventarios:approve",
        "compras:view",
        "compras:create",
        "compras:update",
        "compras:approve",
        "bancos:view",
        "nomina:view",
        "reportes:view",
        "reportes:export",
        "crm:view",
        "crm:create",
        "crm:update",
        "corntech:view",
        "usuarios:view",
        "delivery:view",
        "delivery:create",
        "delivery:update",
        "merma:view",
        "merma:create",
        "merma:update",
        "lealtad:view",
        "lealtad:create",
        "lealtad:update",
      ],
    },
    {
      name: "branch_manager",
      description: "Gerente de sucursal - una sucursal",
      permissions: [
        "sucursales:view",
        "inventarios:view",
        "inventarios:create",
        "inventarios:update",
        "compras:view",
        "compras:create",
        "bancos:view",
        "reportes:view",
        "crm:view",
        "crm:create",
        "crm:update",
        "corntech:view",
        "delivery:view",
        "delivery:create",
        "merma:view",
        "merma:create",
        "lealtad:view",
        "lealtad:create",
      ],
    },
    {
      name: "accountant",
      description: "Contador - módulos financieros",
      permissions: [
        "contabilidad:view",
        "contabilidad:create",
        "contabilidad:update",
        "contabilidad:approve",
        "contabilidad:export",
        "facturacion:view",
        "facturacion:create",
        "facturacion:update",
        "facturacion:export",
        "nomina:view",
        "nomina:create",
        "nomina:update",
        "nomina:approve",
        "nomina:export",
        "bancos:view",
        "bancos:create",
        "bancos:update",
        "bancos:approve",
        "bancos:export",
        "reportes:view",
        "reportes:export",
        "sucursales:view",
        "compras:view",
      ],
    },
    {
      name: "cashier",
      description: "Cajero - acceso mínimo",
      permissions: ["corntech:view", "inventarios:view", "sucursales:view"],
    },
  ];

  const roles: Record<string, string> = {};
  for (const def of roleDefinitions) {
    const role = await prisma.role.upsert({
      where: { organizationId_name: { organizationId: org.id, name: def.name } },
      update: { permissions: def.permissions },
      create: {
        organizationId: org.id,
        name: def.name,
        description: def.description,
        permissions: def.permissions,
        isSystem: true,
      },
    });
    roles[def.name] = role.id;
  }
  console.warn("Roles created:", Object.keys(roles).join(", "));

  // 3. Create Luka real branches, CEDIS, POS catalog, and recipe skeletons
  const lukaMasterSeed = await seedLukaMasterData(prisma, org.id);
  const branchIds = lukaMasterSeed.branchIds;
  console.warn("Luka master data seeded:", lukaMasterSeed);

  // 3b. Create Legal Entities (Razones Sociales)
  const legalEntities = [
    {
      name: "Luka Pokes Querétaro",
      rfc: "LPQ240101AAA",
      razonSocial: "Luka Pokes Querétaro S.A. de C.V.",
      regimenFiscal: "601",
      address: "Querétaro, Querétaro",
      postalCode: "00000",
      branchCodes: [
        "CEDIS01",
        "QRO-LDM",
        "QRO-JUR",
        "QRO-LNO",
        "QRO-ZIB",
        "QRO-ANH",
        "QRO-JHD",
        "QRO-AIQ",
      ],
    },
    {
      name: "Luka Pokes León",
      rfc: "LPL240101AAA",
      razonSocial: "Luka Pokes León S.A. de C.V.",
      regimenFiscal: "601",
      address: "León, Guanajuato",
      postalCode: "00000",
      branchCodes: ["LEON-JM", "LEON-EM"],
    },
    {
      name: "Luka Pokes San Luis",
      rfc: "LPS240101AAA",
      razonSocial: "Luka Pokes San Luis S.A. de C.V.",
      regimenFiscal: "601",
      address: "San Luis Potosí, San Luis Potosí",
      postalCode: "00000",
      branchCodes: ["SLP-SL"],
    },
  ];

  for (const le of legalEntities) {
    const { branchCodes, ...entityData } = le;
    const entity = await prisma.legalEntity.upsert({
      where: {
        organizationId_rfc: { organizationId: org.id, rfc: le.rfc },
      },
      update: {},
      create: {
        organizationId: org.id,
        ...entityData,
      },
    });

    // Assign branches to this legal entity
    for (const code of branchCodes) {
      if (branchIds[code]) {
        await prisma.branch.update({
          where: { id: branchIds[code] },
          data: { legalEntityId: entity.id },
        });
      }
    }
  }
  console.warn("Legal entities created:", legalEntities.length);

  // 4. Create initial users
  const passwordHash = await bcrypt.hash("Admin123!", 12);

  const owner = await prisma.user.upsert({
    where: { email: "admin@lukapoke.com" },
    update: {},
    create: {
      organizationId: org.id,
      email: "admin@lukapoke.com",
      passwordHash,
      firstName: "Alonso",
      lastName: "Janeiro",
    },
  });

  async function ensureOrgWideRole(userId: string, roleId: string) {
    const existing = await prisma.userBranchRole.findFirst({
      where: { userId, branchId: null, roleId },
    });
    if (!existing) {
      await prisma.userBranchRole.create({
        data: { userId, branchId: null, roleId },
      });
    }
  }

  // Assign owner role (org-wide, no specific branch)
  await ensureOrgWideRole(owner.id, roles["owner"]);

  const investor = await prisma.user.upsert({
    where: { email: "inversionista@lukapoke.com" },
    update: {},
    create: {
      organizationId: org.id,
      email: "inversionista@lukapoke.com",
      passwordHash,
      firstName: "Carlos",
      lastName: "Inversionista",
    },
  });

  await ensureOrgWideRole(investor.id, roles["investor"]);

  console.warn(
    "Users created: admin@lukapoke.com / inversionista@lukapoke.com (password: Admin123!)",
  );

  // 5. Create ISR Tables 2026 (Monthly)
  const isrMonthly2026 = [
    { lower: 0.01, upper: 746.04, fixed: 0, rate: 0.0192 },
    { lower: 746.05, upper: 6332.05, fixed: 14.32, rate: 0.064 },
    { lower: 6332.06, upper: 11128.01, fixed: 371.83, rate: 0.1088 },
    { lower: 11128.02, upper: 12935.82, fixed: 893.63, rate: 0.16 },
    { lower: 12935.83, upper: 15487.71, fixed: 1182.88, rate: 0.1792 },
    { lower: 15487.72, upper: 31236.49, fixed: 1640.18, rate: 0.2136 },
    { lower: 31236.5, upper: 49233.0, fixed: 5004.12, rate: 0.2352 },
    { lower: 49233.01, upper: 93993.9, fixed: 9236.89, rate: 0.3 },
    { lower: 93993.91, upper: 125325.2, fixed: 22665.17, rate: 0.32 },
    { lower: 125325.21, upper: 375975.61, fixed: 32691.18, rate: 0.34 },
    { lower: 375975.62, upper: 999999999, fixed: 117912.32, rate: 0.35 },
  ];

  for (const row of isrMonthly2026) {
    await prisma.iSRTable.create({
      data: {
        organizationId: org.id,
        year: 2026,
        lowerLimit: row.lower,
        upperLimit: row.upper,
        fixedFee: row.fixed,
        ratePercentage: row.rate,
        periodType: "MONTHLY",
      },
    });
  }
  console.warn("ISR tables 2026 seeded (monthly)");

  // 6. Create IMSS Rates 2026
  const imssRates2026 = [
    { branch: "enfermedades_maternidad_fija", employerRate: 0.204, employeeRate: 0, ceiling: null },
    {
      branch: "enfermedades_maternidad_excedente",
      employerRate: 0.011,
      employeeRate: 0.004,
      ceiling: 25,
    },
    {
      branch: "enfermedades_maternidad_prestaciones",
      employerRate: 0.007,
      employeeRate: 0.0025,
      ceiling: 25,
    },
    {
      branch: "enfermedades_maternidad_gastos_medicos",
      employerRate: 0.0105,
      employeeRate: 0.00375,
      ceiling: 25,
    },
    { branch: "invalidez_vida", employerRate: 0.0175, employeeRate: 0.00625, ceiling: 25 },
    { branch: "retiro", employerRate: 0.02, employeeRate: 0, ceiling: 25 },
    { branch: "cesantia_vejez", employerRate: 0.0515, employeeRate: 0.01125, ceiling: 25 },
    { branch: "guarderias", employerRate: 0.01, employeeRate: 0, ceiling: 25 },
    { branch: "infonavit", employerRate: 0.05, employeeRate: 0, ceiling: 25 },
    { branch: "riesgo_trabajo_clase_1", employerRate: 0.0054355, employeeRate: 0, ceiling: null },
  ];

  for (const rate of imssRates2026) {
    await prisma.iMSSRate.create({
      data: {
        organizationId: org.id,
        year: 2026,
        branch: rate.branch,
        employerRate: rate.employerRate,
        employeeRate: rate.employeeRate,
        ceilingUmaFactor: rate.ceiling,
      },
    });
  }
  console.warn("IMSS rates 2026 seeded");

  // 7. Create basic chart of accounts
  const accounts = [
    { code: "100", name: "Activo", type: "ASSET", nature: "DEBIT", isDetail: false },
    { code: "100.01", name: "Caja y Bancos", type: "ASSET", nature: "DEBIT", parent: "100" },
    { code: "100.02", name: "Clientes (CxC)", type: "ASSET", nature: "DEBIT", parent: "100" },
    { code: "100.03", name: "Inventarios", type: "ASSET", nature: "DEBIT", parent: "100" },
    { code: "100.04", name: "IVA Acreditable", type: "ASSET", nature: "DEBIT", parent: "100" },
    { code: "200", name: "Pasivo", type: "LIABILITY", nature: "CREDIT", isDetail: false },
    {
      code: "200.01",
      name: "Proveedores (CxP)",
      type: "LIABILITY",
      nature: "CREDIT",
      parent: "200",
    },
    { code: "200.02", name: "IVA Trasladado", type: "LIABILITY", nature: "CREDIT", parent: "200" },
    { code: "200.03", name: "ISR por Pagar", type: "LIABILITY", nature: "CREDIT", parent: "200" },
    { code: "200.04", name: "IMSS por Pagar", type: "LIABILITY", nature: "CREDIT", parent: "200" },
    {
      code: "200.05",
      name: "Sueldos por Pagar",
      type: "LIABILITY",
      nature: "CREDIT",
      parent: "200",
    },
    { code: "300", name: "Capital", type: "EQUITY", nature: "CREDIT", isDetail: false },
    { code: "300.01", name: "Capital Social", type: "EQUITY", nature: "CREDIT", parent: "300" },
    {
      code: "300.02",
      name: "Utilidades Acumuladas",
      type: "EQUITY",
      nature: "CREDIT",
      parent: "300",
    },
    { code: "400", name: "Ingresos", type: "REVENUE", nature: "CREDIT", isDetail: false },
    { code: "400.01", name: "Ventas", type: "REVENUE", nature: "CREDIT", parent: "400" },
    { code: "400.02", name: "Otros Ingresos", type: "REVENUE", nature: "CREDIT", parent: "400" },
    { code: "500", name: "Costos", type: "EXPENSE", nature: "DEBIT", isDetail: false },
    { code: "500.01", name: "Costo de Ventas", type: "EXPENSE", nature: "DEBIT", parent: "500" },
    {
      code: "500.02",
      name: "Costo de Materia Prima",
      type: "EXPENSE",
      nature: "DEBIT",
      parent: "500",
    },
    { code: "600", name: "Gastos de Operación", type: "EXPENSE", nature: "DEBIT", isDetail: false },
    { code: "600.01", name: "Sueldos y Salarios", type: "EXPENSE", nature: "DEBIT", parent: "600" },
    { code: "600.02", name: "Cuotas IMSS Patrón", type: "EXPENSE", nature: "DEBIT", parent: "600" },
    { code: "600.03", name: "Renta de Local", type: "EXPENSE", nature: "DEBIT", parent: "600" },
    {
      code: "600.04",
      name: "Servicios (Luz, Agua, Gas)",
      type: "EXPENSE",
      nature: "DEBIT",
      parent: "600",
    },
    {
      code: "600.05",
      name: "Publicidad y Marketing",
      type: "EXPENSE",
      nature: "DEBIT",
      parent: "600",
    },
    { code: "600.06", name: "Mantenimiento", type: "EXPENSE", nature: "DEBIT", parent: "600" },
    { code: "600.07", name: "Gastos Diversos", type: "EXPENSE", nature: "DEBIT", parent: "600" },
  ];

  // Create parent accounts first, then children
  const accountIds: Record<string, string> = {};
  for (const acc of accounts) {
    const parentId = acc.parent ? accountIds[acc.parent] || null : null;
    const created = await prisma.accountCatalog.upsert({
      where: { organizationId_code: { organizationId: org.id, code: acc.code } },
      update: {},
      create: {
        organizationId: org.id,
        code: acc.code,
        name: acc.name,
        type: acc.type as any,
        nature: acc.nature as any,
        isDetail: acc.isDetail !== false,
        parentAccountId: parentId,
      },
    });
    accountIds[acc.code] = created.id;
  }
  console.warn("Chart of accounts seeded:", accounts.length, "accounts");

  // 8. Product categories are loaded from the Luka master POS catalog above.
  console.warn("Product categories seeded:", lukaMasterSeed.categoriesSeeded);

  // 9. Open fiscal periods for 2026
  for (let month = 1; month <= 12; month++) {
    await prisma.fiscalPeriod.upsert({
      where: { organizationId_year_month: { organizationId: org.id, year: 2026, month } },
      update: {},
      create: { organizationId: org.id, year: 2026, month, status: "OPEN" },
    });
  }
  console.warn("Fiscal periods 2026 opened");

  console.warn("\nSeed completed successfully!");
  console.warn("Login with: admin@lukapoke.com / Admin123!");
}

main()
  .catch((e) => {
    console.error("Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
