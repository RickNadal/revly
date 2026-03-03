// lib/ads/utils.ts
export function nowIso() {
  return new Date().toISOString();
}

export function seededUnitFloat(seed: number) {
  let x = seed | 0;
  x ^= x << 13;
  x ^= x >> 17;
  x ^= x << 5;
  return (x >>> 0) / 4294967296;
}

export function hashStringToSeed(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h | 0;
}

export function weightedPick<T extends { weight?: number }>(items: T[], u: number) {
  if (!items.length) return null;
  const total = items.reduce((sum, it) => sum + Math.max(0, it.weight ?? 1), 0);
  if (total <= 0) return items[0];

  let r = u * total;
  for (const it of items) {
    r -= Math.max(0, it.weight ?? 1);
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}