"use client";

const TOKEN_KEY = "luka_access_token";
const REFRESH_KEY = "luka_refresh_token";
const USER_KEY = "luka_user";

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  organizationId: string;
  roles: Array<{
    branchId: string | null;
    roleName: string;
    permissions: string[];
  }>;
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(REFRESH_KEY);
}

export function getUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setAuth(accessToken: string, refreshToken: string, user: AuthUser) {
  localStorage.setItem(TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_KEY, refreshToken);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(USER_KEY);
}

export function hasPermission(user: AuthUser | null, permission: string): boolean {
  if (!user) return false;
  return user.roles.some((r) => {
    const perms = r.permissions as string[];
    return perms.includes(permission);
  });
}

export function hasRole(user: AuthUser | null, role: string): boolean {
  if (!user) return false;
  return user.roles.some((r) => r.roleName === role);
}

export function getUserBranches(user: AuthUser | null): string[] {
  if (!user) return [];
  // null branchId means org-wide access
  if (user.roles.some((r) => r.branchId === null)) return ["ALL"];
  return [...new Set(user.roles.map((r) => r.branchId!))];
}
