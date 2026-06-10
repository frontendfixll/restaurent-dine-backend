/**
 * Tiny duration parser — `"15m"`, `"30d"`, `"2h"`, `"45s"` → milliseconds.
 * Kept local to avoid pulling the `ms` package and its types juggling.
 */
const UNIT_MS: Record<string, number> = {
  ms: 1,
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

export default function ms(input: string): number {
  const match = /^(\d+)\s*(ms|s|m|h|d)$/.exec(input.trim());
  if (!match) throw new Error(`Invalid duration: ${input}`);
  const value = Number(match[1]);
  const unit = match[2];
  return value * UNIT_MS[unit];
}
