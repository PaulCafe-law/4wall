export function createRng(seedInput: number | string): () => number {
  let seed =
    typeof seedInput === 'number'
      ? seedInput >>> 0
      : [...seedInput].reduce((acc, ch) => Math.imul(acc ^ ch.charCodeAt(0), 16777619) >>> 0, 2166136261);
  if (seed === 0) seed = 0x9e3779b9;

  return () => {
    seed += 0x6d2b79f5;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(items: T[], rng: () => number): T[] {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

export function pickWeighted<T>(items: T[], weight: (item: T) => number, rng: () => number): T {
  const total = items.reduce((sum, item) => sum + Math.max(0, weight(item)), 0);
  let needle = rng() * total;
  for (const item of items) {
    needle -= Math.max(0, weight(item));
    if (needle <= 0) return item;
  }
  return items[items.length - 1];
}
