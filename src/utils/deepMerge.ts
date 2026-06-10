/**
 * Recursive object merge. Arrays and primitives are replaced (not merged).
 * Returns a new object — does not mutate `target`.
 */
export function deepMerge<T extends Record<string, unknown>>(target: T, source: Partial<T>): T {
  if (!source || typeof source !== 'object') return target;
  const out: Record<string, unknown> = { ...target };
  for (const key of Object.keys(source)) {
    const s = (source as Record<string, unknown>)[key];
    const t = (target as Record<string, unknown>)[key];
    if (s === undefined) continue;
    if (
      s !== null &&
      typeof s === 'object' &&
      !Array.isArray(s) &&
      t !== null &&
      typeof t === 'object' &&
      !Array.isArray(t)
    ) {
      out[key] = deepMerge(t as Record<string, unknown>, s as Record<string, unknown>);
    } else {
      out[key] = s;
    }
  }
  return out as T;
}
