import type { AuthUser } from "./auth";

/**
 * Map each dashboard route to the permission required to access it.
 * An empty string means no permission is needed (everyone can see it).
 */
export const ROUTE_PERMISSIONS: Record<string, string> = {
  "/dashboard": "",
  "/inventarios": "inventarios:view",
  "/compras": "compras:view",
  "/sucursales": "sucursales:view",
  "/bancos": "bancos:view",
  "/facturacion": "facturacion:view",
  "/contabilidad": "contabilidad:view",
  "/nomina": "nomina:view",
  "/reportes": "reportes:view",
  "/inversionistas": "inversionistas:view",
  "/crm": "crm:view",
  "/lealtad": "crm:view",
  "/merma": "inventarios:view",
  "/delivery": "delivery:view",
  "/requisiciones": "inventarios:view",
  "/razones-sociales": "sucursales:view",
  "/inventarios/kardex": "inventarios:view",
  "/inventarios/conteo": "inventarios:view",
  "/inventarios/lotes": "inventarios:view",
  "/predicciones": "inventarios:view",
  "/presupuesto": "reportes:view",
  "/horarios": "nomina:view",
  "/alertas": "sucursales:view",
  "/notificaciones": "",
  "/configuracion": "configuracion:view",
  "/importar": "configuracion:view",
  "/auditoria": "configuracion:view",
  "/asistencia": "nomina:view",
  "/pos": "corntech:view",
};

/**
 * Check whether the user holds a specific permission string.
 * Returns true when no permission is required (empty string).
 */
export function hasPermission(userPermissions: string[], required: string): boolean {
  if (!required) return true;
  return userPermissions.includes(required);
}

/**
 * Collect all unique permissions from every role assigned to the user.
 */
export function getUserPermissions(user: AuthUser | null): string[] {
  if (!user) return [];
  const roles = user.roles || [];
  const permissions: string[] = [];
  for (const role of roles) {
    if (role.permissions) {
      permissions.push(...role.permissions);
    }
  }
  return [...new Set(permissions)];
}

/**
 * Determine whether a user can access a given route path.
 * Unknown routes (not in ROUTE_PERMISSIONS) are allowed by default.
 */
export function canAccessRoute(user: AuthUser | null, route: string): boolean {
  const perms = getUserPermissions(user);
  const required = ROUTE_PERMISSIONS[route];
  if (required === undefined) return true;
  return hasPermission(perms, required);
}
