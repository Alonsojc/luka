import { Injectable, ConflictException, Logger } from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../../common/prisma/prisma.service";

/** Default system roles with their permissions. */
const SYSTEM_ROLES = [
  {
    name: "owner",
    description: "Dueño - acceso total",
    permissions: [
      "sucursales:view", "sucursales:create", "sucursales:update", "sucursales:delete", "sucursales:approve", "sucursales:export",
      "usuarios:view", "usuarios:create", "usuarios:update", "usuarios:delete", "usuarios:approve", "usuarios:export",
      "inventarios:view", "inventarios:create", "inventarios:update", "inventarios:delete", "inventarios:approve", "inventarios:export",
      "compras:view", "compras:create", "compras:update", "compras:delete", "compras:approve", "compras:export",
      "bancos:view", "bancos:create", "bancos:update", "bancos:delete", "bancos:approve", "bancos:export",
      "nomina:view", "nomina:create", "nomina:update", "nomina:delete", "nomina:approve", "nomina:export",
      "facturacion:view", "facturacion:create", "facturacion:update", "facturacion:delete", "facturacion:approve", "facturacion:export",
      "contabilidad:view", "contabilidad:create", "contabilidad:update", "contabilidad:delete", "contabilidad:approve", "contabilidad:export",
      "reportes:view", "reportes:export",
      "inversionistas:view", "inversionistas:export",
      "crm:view", "crm:create", "crm:update", "crm:delete", "crm:approve", "crm:export",
      "corntech:view", "corntech:create", "corntech:update", "corntech:delete",
      "configuracion:view", "configuracion:create", "configuracion:update", "configuracion:delete",
      "delivery:view", "delivery:create", "delivery:update", "delivery:delete",
      "merma:view", "merma:create", "merma:update", "merma:delete",
      "lealtad:view", "lealtad:create", "lealtad:update", "lealtad:delete",
    ],
  },
  {
    name: "investor",
    description: "Inversionista - solo lectura financiera",
    permissions: [
      "reportes:view", "reportes:export", "inversionistas:view", "inversionistas:export",
      "bancos:view", "contabilidad:view", "sucursales:view",
    ],
  },
  {
    name: "zone_manager",
    description: "Gerente de zona - múltiples sucursales",
    permissions: [
      "sucursales:view", "inventarios:view", "inventarios:create", "inventarios:update", "inventarios:approve",
      "compras:view", "compras:create", "compras:update", "compras:approve",
      "bancos:view", "nomina:view", "reportes:view", "reportes:export",
      "crm:view", "crm:create", "crm:update", "corntech:view", "usuarios:view",
      "delivery:view", "delivery:create", "delivery:update",
      "merma:view", "merma:create", "merma:update",
      "lealtad:view", "lealtad:create", "lealtad:update",
    ],
  },
  {
    name: "branch_manager",
    description: "Gerente de sucursal - una sucursal",
    permissions: [
      "sucursales:view", "inventarios:view", "inventarios:create", "inventarios:update",
      "compras:view", "compras:create", "bancos:view", "reportes:view",
      "crm:view", "crm:create", "crm:update", "corntech:view",
      "delivery:view", "delivery:create", "merma:view", "merma:create",
      "lealtad:view", "lealtad:create",
    ],
  },
  {
    name: "accountant",
    description: "Contador - módulos financieros",
    permissions: [
      "contabilidad:view", "contabilidad:create", "contabilidad:update", "contabilidad:approve", "contabilidad:export",
      "facturacion:view", "facturacion:create", "facturacion:update", "facturacion:export",
      "nomina:view", "nomina:create", "nomina:update", "nomina:approve", "nomina:export",
      "bancos:view", "bancos:create", "bancos:update", "bancos:approve", "bancos:export",
      "reportes:view", "reportes:export", "sucursales:view", "compras:view",
    ],
  },
  {
    name: "cashier",
    description: "Cajero - acceso mínimo",
    permissions: ["corntech:view", "inventarios:view", "sucursales:view"],
  },
];

/** Default SAT-compliant chart of accounts. */
const CHART_OF_ACCOUNTS = [
  { code: "100", name: "Activo", type: "ASSET", nature: "DEBIT", isDetail: false },
  { code: "100.01", name: "Caja y Bancos", type: "ASSET", nature: "DEBIT", parent: "100" },
  { code: "100.02", name: "Clientes (CxC)", type: "ASSET", nature: "DEBIT", parent: "100" },
  { code: "100.03", name: "Inventarios", type: "ASSET", nature: "DEBIT", parent: "100" },
  { code: "100.04", name: "IVA Acreditable", type: "ASSET", nature: "DEBIT", parent: "100" },
  { code: "200", name: "Pasivo", type: "LIABILITY", nature: "CREDIT", isDetail: false },
  { code: "200.01", name: "Proveedores (CxP)", type: "LIABILITY", nature: "CREDIT", parent: "200" },
  { code: "200.02", name: "IVA Trasladado", type: "LIABILITY", nature: "CREDIT", parent: "200" },
  { code: "200.03", name: "ISR por Pagar", type: "LIABILITY", nature: "CREDIT", parent: "200" },
  { code: "200.04", name: "IMSS por Pagar", type: "LIABILITY", nature: "CREDIT", parent: "200" },
  { code: "200.05", name: "Sueldos por Pagar", type: "LIABILITY", nature: "CREDIT", parent: "200" },
  { code: "300", name: "Capital", type: "EQUITY", nature: "CREDIT", isDetail: false },
  { code: "300.01", name: "Capital Social", type: "EQUITY", nature: "CREDIT", parent: "300" },
  { code: "300.02", name: "Utilidades Acumuladas", type: "EQUITY", nature: "CREDIT", parent: "300" },
  { code: "400", name: "Ingresos", type: "REVENUE", nature: "CREDIT", isDetail: false },
  { code: "400.01", name: "Ventas", type: "REVENUE", nature: "CREDIT", parent: "400" },
  { code: "400.02", name: "Otros Ingresos", type: "REVENUE", nature: "CREDIT", parent: "400" },
  { code: "500", name: "Costos", type: "EXPENSE", nature: "DEBIT", isDetail: false },
  { code: "500.01", name: "Costo de Ventas", type: "EXPENSE", nature: "DEBIT", parent: "500" },
  { code: "500.02", name: "Costo de Materia Prima", type: "EXPENSE", nature: "DEBIT", parent: "500" },
  { code: "600", name: "Gastos de Operación", type: "EXPENSE", nature: "DEBIT", isDetail: false },
  { code: "600.01", name: "Sueldos y Salarios", type: "EXPENSE", nature: "DEBIT", parent: "600" },
  { code: "600.02", name: "Cuotas IMSS Patrón", type: "EXPENSE", nature: "DEBIT", parent: "600" },
  { code: "600.03", name: "Renta de Local", type: "EXPENSE", nature: "DEBIT", parent: "600" },
  { code: "600.04", name: "Servicios (Luz, Agua, Gas)", type: "EXPENSE", nature: "DEBIT", parent: "600" },
  { code: "600.05", name: "Publicidad y Marketing", type: "EXPENSE", nature: "DEBIT", parent: "600" },
  { code: "600.06", name: "Mantenimiento", type: "EXPENSE", nature: "DEBIT", parent: "600" },
  { code: "600.07", name: "Gastos Diversos", type: "EXPENSE", nature: "DEBIT", parent: "600" },
];

/** Default product categories for food service. */
const PRODUCT_CATEGORIES = [
  "Proteínas", "Bases", "Toppings", "Salsas", "Bebidas", "Empaques",
];

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Create a complete organization setup in a single transaction:
   * - Organization record
   * - Admin user with owner role
   * - All system roles with permissions
   * - SAT-compliant chart of accounts
   * - Default product categories
   * - Open fiscal periods for current year
   */
  async onboard(data: {
    orgName: string;
    rfc: string;
    razonSocial: string;
    regimenFiscal: string;
    adminEmail: string;
    adminPassword: string;
    adminFirstName: string;
    adminLastName: string;
    firstBranch: {
      name: string;
      code: string;
      city: string;
      state: string;
      address: string;
      postalCode: string;
    };
  }) {
    // Check for existing RFC or email
    const existingOrg = await this.prisma.organization.findFirst({
      where: { rfc: data.rfc },
    });
    if (existingOrg) {
      throw new ConflictException(`Ya existe una organización con RFC ${data.rfc}`);
    }

    const existingUser = await this.prisma.user.findFirst({
      where: { email: data.adminEmail },
    });
    if (existingUser) {
      throw new ConflictException(`El email ${data.adminEmail} ya está registrado`);
    }

    const passwordHash = await bcrypt.hash(data.adminPassword, 12);
    const currentYear = new Date().getFullYear();

    return this.prisma.$transaction(async (tx) => {
      // 1. Organization
      const org = await tx.organization.create({
        data: {
          name: data.orgName,
          rfc: data.rfc,
          razonSocial: data.razonSocial,
          regimenFiscal: data.regimenFiscal,
        },
      });

      // 2. System roles
      const roleIds: Record<string, string> = {};
      for (const roleDef of SYSTEM_ROLES) {
        const role = await tx.role.create({
          data: {
            organizationId: org.id,
            name: roleDef.name,
            description: roleDef.description,
            permissions: roleDef.permissions,
            isSystem: true,
          },
        });
        roleIds[roleDef.name] = role.id;
      }

      // 3. First branch
      const branch = await tx.branch.create({
        data: {
          organizationId: org.id,
          ...data.firstBranch,
        },
      });

      // 4. Admin user with owner role (org-wide)
      const admin = await tx.user.create({
        data: {
          organizationId: org.id,
          email: data.adminEmail,
          passwordHash,
          firstName: data.adminFirstName,
          lastName: data.adminLastName,
          branchRoles: {
            create: {
              branchId: null, // org-wide
              roleId: roleIds["owner"],
            },
          },
        },
      });

      // 5. Chart of accounts
      const accountIds: Record<string, string> = {};
      for (const acc of CHART_OF_ACCOUNTS) {
        const parentId = (acc as any).parent
          ? accountIds[(acc as any).parent] || null
          : null;
        const created = await tx.accountCatalog.create({
          data: {
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

      // 6. Product categories
      for (const cat of PRODUCT_CATEGORIES) {
        await tx.productCategory.create({
          data: { organizationId: org.id, name: cat },
        });
      }

      // 7. Fiscal periods (current year, all months open)
      for (let month = 1; month <= 12; month++) {
        await tx.fiscalPeriod.create({
          data: {
            organizationId: org.id,
            year: currentYear,
            month,
            status: "OPEN",
          },
        });
      }

      this.logger.log(
        `Organization onboarded: ${data.orgName} (${data.rfc}) — admin: ${data.adminEmail}`,
      );

      return {
        organization: { id: org.id, name: org.name, rfc: org.rfc },
        admin: { id: admin.id, email: admin.email },
        branch: { id: branch.id, name: branch.name, code: branch.code },
        rolesCreated: Object.keys(roleIds).length,
        accountsCreated: CHART_OF_ACCOUNTS.length,
        categoriesCreated: PRODUCT_CATEGORIES.length,
        fiscalPeriodsOpened: 12,
      };
    });
  }
}
