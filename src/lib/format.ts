import { format, parseISO } from "date-fns";

// Money: group thousands, always 2 decimals, with the currency code suffix.
export function formatAmount(
  amount: number | null,
  currency: string | null,
): string {
  if (amount == null) return "—";
  const n = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
  return `${n} ${currency ?? "USD"}`;
}

// Dates come back as "YYYY-MM-DD" (date column) — render as "12 Mar 2026".
export function formatDate(value: string | null): string {
  if (!value) return "No date";
  try {
    return format(parseISO(value), "d MMM yyyy");
  } catch {
    return value;
  }
}
