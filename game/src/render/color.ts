export function hexToRgb(h: string): [number, number, number] {
  if (h.startsWith('rgb')) { const m = h.match(/[\d.]+/g) ?? ['0', '0', '0']; return [Number(m[0]), Number(m[1]), Number(m[2])]; }
  const n = parseInt(h.slice(1), 16);
  if (h.length === 4) { const r = parseInt(h[1] + h[1], 16), g = parseInt(h[2] + h[2], 16), b = parseInt(h[3] + h[3], 16); return [r, g, b]; }
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function shade(h: string, f: number): string {
  const [r, g, b] = hexToRgb(h);
  const m = (v: number) => Math.max(0, Math.min(255, Math.round(f >= 0 ? v + (255 - v) * f : v * (1 + f))));
  return `rgb(${m(r)},${m(g)},${m(b)})`;
}
export function rgba(h: string, a: number): string { const [r, g, b] = hexToRgb(h); return `rgba(${r},${g},${b},${a})`; }
export function mix(a: string, b: string, t: number): string {
  const A = hexToRgb(a), B = hexToRgb(b);
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('');
}
