const nf = (opts: Intl.NumberFormatOptions) => new Intl.NumberFormat(undefined, opts);

export function money(value: number | undefined, currency: string, compact = false): string {
  if (value == null || !Number.isFinite(value)) return "—";
  try {
    return nf({ style: "currency", currency, notation: compact ? "compact" : "standard", maximumFractionDigits: compact ? 2 : value !== 0 && Math.abs(value) < 1 ? 4 : 2 }).format(value);
  } catch {
    // Non-ISO codes such as GBp
    return `${num(value)} ${currency}`;
  }
}

export const num = (v: number | undefined, digits = 2) =>
  v == null || !Number.isFinite(v) ? "—" : nf({ maximumFractionDigits: digits }).format(v);

export const compact = (v: number | undefined) =>
  v == null || !Number.isFinite(v) ? "—" : nf({ notation: "compact", maximumFractionDigits: 2 }).format(v);

export const pct = (v: number | undefined, digits = 2, signed = false) =>
  v == null || !Number.isFinite(v) ? "—" : `${signed && v > 0 ? "+" : ""}${v.toFixed(digits)}%`;

export const signedMoney = (v: number | undefined, currency: string) =>
  v == null ? "—" : `${v > 0 ? "+" : ""}${money(v, currency)}`;

export const trend = (v: number | undefined) => (v == null || v === 0 ? "" : v > 0 ? "up" : "down");

export const TYPE_LABEL: Record<string, string> = {
  EQUITY: "Stock", ETF: "ETF", CASH: "Cash", MUTUALFUND: "Fund", INDEX: "Index", CRYPTOCURRENCY: "Crypto", CURRENCY: "FX", FUTURE: "Future", OTHER: "Other",
};
