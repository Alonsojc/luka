import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcryptjs";

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

  // 3. Create Demo Branches
  const branches = [
    {
      code: "CEDIS01",
      name: "CEDIS Central",
      city: "Ciudad de México",
      state: "CMX",
      address: "Parque Industrial Vallejo, Nave 5",
      postalCode: "07700",
      branchType: "CEDIS",
    },
    {
      code: "CDMX01",
      name: "Luka Polanco",
      city: "Ciudad de México",
      state: "CMX",
      address: "Av. Presidente Masaryk 123",
      postalCode: "11560",
      branchType: "TIENDA",
    },
    {
      code: "CDMX02",
      name: "Luka Roma",
      city: "Ciudad de México",
      state: "CMX",
      address: "Calle Orizaba 45",
      postalCode: "06700",
      branchType: "TIENDA",
    },
    {
      code: "GDL01",
      name: "Luka Providencia",
      city: "Guadalajara",
      state: "JAL",
      address: "Av. Providencia 890",
      postalCode: "44630",
      branchType: "TIENDA",
    },
    {
      code: "MTY01",
      name: "Luka San Pedro",
      city: "Monterrey",
      state: "NLE",
      address: "Calzada del Valle 200",
      postalCode: "66220",
      branchType: "TIENDA",
    },
    {
      code: "QRO01",
      name: "Luka Juriquilla",
      city: "Querétaro",
      state: "QUE",
      address: "Blvd. Juriquilla 500",
      postalCode: "76226",
      branchType: "TIENDA",
    },
    {
      code: "CAN01",
      name: "Luka Cancún",
      city: "Cancún",
      state: "ROO",
      address: "Blvd. Kukulcán km 12",
      postalCode: "77500",
      branchType: "TIENDA",
    },
    {
      code: "PUE01",
      name: "Luka Angelópolis",
      city: "Puebla",
      state: "PUE",
      address: "Blvd. del Niño Poblano 2510",
      postalCode: "72197",
      branchType: "TIENDA",
    },
    {
      code: "MER01",
      name: "Luka Montejo",
      city: "Mérida",
      state: "YUC",
      address: "Paseo de Montejo 480",
      postalCode: "97000",
      branchType: "TIENDA",
    },
    {
      code: "TIJ01",
      name: "Luka Zona Río",
      city: "Tijuana",
      state: "BCN",
      address: "Blvd. Sánchez Taboada 100",
      postalCode: "22320",
      branchType: "TIENDA",
    },
    {
      code: "LEON01",
      name: "Luka Centro Max",
      city: "León",
      state: "GUA",
      address: "Blvd. Adolfo López Mateos 1102",
      postalCode: "37150",
      branchType: "TIENDA",
    },
  ];

  const branchIds: Record<string, string> = {};
  for (const b of branches) {
    const branch = await prisma.branch.upsert({
      where: { organizationId_code: { organizationId: org.id, code: b.code } },
      update: {},
      create: { organizationId: org.id, ...b },
    });
    branchIds[b.code] = branch.id;
  }
  console.warn("Branches created:", branches.length);

  // 3b. Create Legal Entities (Razones Sociales)
  const legalEntities = [
    {
      name: "Food Now, S.A. de C.V.",
      rfc: "FNO150101ABC",
      razonSocial: "Food Now, S.A. de C.V.",
      regimenFiscal: "601",
      address: "Av. Presidente Masaryk 123, Col. Polanco",
      postalCode: "11560",
      branchCodes: ["CDMX01", "CDMX02", "GDL01"],
    },
    {
      name: "Poke Fresh, S.A. de C.V.",
      rfc: "PFR180601XYZ",
      razonSocial: "Poke Fresh, S.A. de C.V.",
      regimenFiscal: "601",
      address: "Calzada del Valle 200, Col. Del Valle",
      postalCode: "66220",
      branchCodes: ["MTY01", "QRO01"],
    },
    {
      name: "Luka Foods del Sureste, S.A. de C.V.",
      rfc: "LFS200301DEF",
      razonSocial: "Luka Foods del Sureste, S.A. de C.V.",
      regimenFiscal: "601",
      address: "Blvd. Kukulcan km 12, Zona Hotelera",
      postalCode: "77500",
      branchCodes: ["CAN01", "MER01", "PUE01"],
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
  console.warn(
    "Legal entities created:",
    legalEntities.length,
    "(CEDIS01, TIJ01, LEON01 remain unassigned)",
  );

  // 4. Create Demo Users
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

  // Assign owner role (org-wide, no specific branch)
  await prisma.userBranchRole.upsert({
    where: {
      userId_branchId_roleId: {
        userId: owner.id,
        branchId: branchIds["CDMX01"],
        roleId: roles["owner"],
      },
    },
    update: {},
    create: { userId: owner.id, branchId: null, roleId: roles["owner"] },
  });

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

  await prisma.userBranchRole.upsert({
    where: {
      userId_branchId_roleId: {
        userId: investor.id,
        branchId: branchIds["CDMX01"],
        roleId: roles["investor"],
      },
    },
    update: {},
    create: { userId: investor.id, branchId: null, roleId: roles["investor"] },
  });

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

  // 8. Create sample product categories
  const categories = ["Proteínas", "Bases", "Toppings", "Salsas", "Bebidas", "Empaques"];
  for (const name of categories) {
    await prisma.productCategory.upsert({
      where: { organizationId_name: { organizationId: org.id, name } },
      update: {},
      create: { organizationId: org.id, name },
    });
  }
  console.warn("Product categories seeded:", categories.length);

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
