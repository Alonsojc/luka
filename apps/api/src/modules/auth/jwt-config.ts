import type { JwtSignOptions } from "@nestjs/jwt";

const DEV_JWT_SECRET = "dev-secret-minimum-32-characters-change-me";
const DEV_JWT_REFRESH_SECRET = "dev-refresh-secret-minimum-32-chars-change-me";

export function getJwtSecret(envKey: "JWT_SECRET" | "JWT_REFRESH_SECRET"): string {
  const value = process.env[envKey];
  if (value) return value;

  if (process.env.NODE_ENV === "production") {
    throw new Error(`${envKey} is required in production`);
  }

  return envKey === "JWT_SECRET" ? DEV_JWT_SECRET : DEV_JWT_REFRESH_SECRET;
}

export function getJwtExpiresIn(
  value: string | undefined,
  fallback: string,
): NonNullable<JwtSignOptions["expiresIn"]> {
  return (value || fallback) as NonNullable<JwtSignOptions["expiresIn"]>;
}
