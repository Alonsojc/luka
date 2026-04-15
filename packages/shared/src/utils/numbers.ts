/**
 * Safely convert a value (possibly null, undefined, or Prisma Decimal) to a
 * finite number. Returns 0 when the conversion would produce NaN.
 */
export function safeNum(value: unknown): number {
  const n = Number(value);
  return isNaN(n) ? 0 : n;
}
