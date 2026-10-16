/** Named streams prevent changes in map generation from consuming population randomness. */
export function random(
  streams: Record<string, number>,
  seed: number,
  name: string,
): number {
  let x = streams[name];
  if (x === undefined) {
    x = seed >>> 0;
    for (const c of name) x = Math.imul(x ^ c.charCodeAt(0), 16777619) >>> 0;
  }
  x = (x + 0x6d2b79f5) >>> 0;
  streams[name] = x;
  let t = Math.imul(x ^ (x >>> 15), x | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
