/**
 * Display helpers aligned with strategy precision.
 *
 * Money path: Amount = bigint (on-chain units).
 * Edge path: floor division → integer bps (same as edgeBps in journals).
 * FloatLib is for research ratios in @cavalre/strategy — not for CSS layout.
 * UI must never invent sub-bps from IEEE floats on money.
 */

/** Truncate to integer bps; matches strategy floor edge. */
export function formatEdgeBps(
  raw: string | number | null | undefined
): { value: string; label: string; sign: -1 | 0 | 1 } {
  if (raw == null || raw === "" || raw === "—") {
    return { value: "—", label: "—", sign: 0 };
  }
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) {
    return { value: String(raw), label: String(raw), sign: 0 };
  }
  const i = Math.trunc(n);
  const sign = i > 0 ? 1 : i < 0 ? -1 : 0;
  const prefix = i > 0 ? "+" : "";
  return { value: String(i), label: `${prefix}${i} bps`, sign };
}

/** Integer milliseconds. */
export function formatMs(raw: number | null | undefined): string {
  if (raw == null || !Number.isFinite(raw)) return "—";
  return `${Math.round(raw)}ms`;
}

/** Basis-point rate from counts using integer math (ceil-safe). */
export function rateBps(numer: number, denom: number): number | null {
  if (denom <= 0) return null;
  return Math.round((numer * 10000) / denom);
}

export function formatPctFromBps(bps: number | null): string {
  if (bps == null) return "—";
  return `${Math.round(bps / 100)}%`;
}
