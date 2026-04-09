const MXN_FORMATTER = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatMXN(amount: number | string | null | undefined): string {
  const num = typeof amount === "string" ? parseFloat(amount) : Number(amount);
  return MXN_FORMATTER.format(isNaN(num) ? 0 : num);
}

export function roundCents(amount: number): number {
  return Math.round(amount * 100) / 100;
}

export function sumAmounts(...amounts: (number | string)[]): number {
  return roundCents(
    amounts.reduce((sum: number, a) => {
      const num = typeof a === "string" ? parseFloat(a) : a;
      return sum + (isNaN(num) ? 0 : num);
    }, 0)
  );
}
