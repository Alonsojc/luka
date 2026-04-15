export const MODULES = [
  "sucursales",
  "usuarios",
  "inventarios",
  "compras",
  "bancos",
  "nomina",
  "facturacion",
  "contabilidad",
  "reportes",
  "inversionistas",
  "crm",
  "corntech",
  "configuracion",
] as const;

export type Module = (typeof MODULES)[number];

export const ACTIONS = ["view", "create", "update", "delete", "approve", "export"] as const;

export type Action = (typeof ACTIONS)[number];

export type Permission = `${Module}:${Action}`;

export const SYSTEM_ROLES = {
  OWNER: "owner",
  INVESTOR: "investor",
  ZONE_MANAGER: "zone_manager",
  BRANCH_MANAGER: "branch_manager",
  ACCOUNTANT: "accountant",
  CASHIER: "cashier",
} as const;

export type SystemRole = (typeof SYSTEM_ROLES)[keyof typeof SYSTEM_ROLES];

export const ROLE_PERMISSIONS: Record<SystemRole, Permission[]> = {
  owner: MODULES.flatMap((m) => ACTIONS.map((a) => `${m}:${a}` as Permission)),

  investor: [
    "reportes:view",
    "reportes:export",
    "inversionistas:view",
    "inversionistas:export",
    "bancos:view",
    "contabilidad:view",
    "sucursales:view",
  ],

  zone_manager: [
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
  ],

  branch_manager: [
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
  ],

  accountant: [
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

  cashier: ["corntech:view", "inventarios:view", "sucursales:view"],
};
