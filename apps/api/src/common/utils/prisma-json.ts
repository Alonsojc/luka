import { Prisma } from "@luka/database";

function toJsonValue(value: unknown): Prisma.InputJsonValue | null {
  if (value === null || value === undefined) return null;

  if (typeof value === "string" || typeof value === "boolean") return value;

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (value instanceof Date) return value.toISOString();

  if (Array.isArray(value)) return value.map((item) => toJsonValue(item));

  if (typeof value === "object") return toPrismaJsonObject(value as Record<string, unknown>);

  return String(value);
}

export function toPrismaJsonArray(values: readonly unknown[]): Prisma.InputJsonArray {
  return values.map((value) => toJsonValue(value));
}

export function toPrismaJsonObject(value: Record<string, unknown>): Prisma.InputJsonObject {
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, toJsonValue(entry)]),
  ) as Prisma.InputJsonObject;
}

export function toNullablePrismaJson(
  value: unknown,
): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  const json = toJsonValue(value);
  return json === null ? Prisma.JsonNull : json;
}
