// Projection isométrique et caméra.
export const TW = 64; // largeur d'une case à l'écran (zoom 1)
export const TH = 32;

export function toScreen(x: number, y: number): { x: number; y: number } {
  return { x: (x - y) * (TW / 2), y: (x + y) * (TH / 2) };
}
export function toWorld(sx: number, sy: number): { x: number; y: number } {
  const a = sx / (TW / 2), b = sy / (TH / 2);
  return { x: (a + b) / 2, y: (b - a) / 2 };
}

export class Camera {
  x = 0; y = 0; zoom = 1;
  minZoom = 0.35; maxZoom = 2.2;
  vw = 1; vh = 1; dpr = 1;
  // inertie
  vx = 0; vy = 0;
  bounds = { minX: -1500, maxX: 1500, minY: -100, maxY: 1600 };

  worldToView(wx: number, wy: number) {
    const s = toScreen(wx, wy);
    return { x: (s.x - this.x) * this.zoom + this.vw / 2, y: (s.y - this.y) * this.zoom + this.vh / 2 };
  }
  viewToWorld(vx: number, vy: number) {
    const sx = (vx - this.vw / 2) / this.zoom + this.x;
    const sy = (vy - this.vh / 2) / this.zoom + this.y;
    return toWorld(sx, sy);
  }
  centerOn(wx: number, wy: number) { const s = toScreen(wx, wy); this.x = s.x; this.y = s.y; }
  pan(dx: number, dy: number) { this.x -= dx / this.zoom; this.y -= dy / this.zoom; this.clamp(); }
  zoomAt(f: number, vx: number, vy: number) {
    const before = this.viewToWorld(vx, vy);
    this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom * f));
    const after = this.viewToWorld(vx, vy);
    const a = toScreen(before.x, before.y), b = toScreen(after.x, after.y);
    this.x += a.x - b.x; this.y += a.y - b.y;
    this.clamp();
  }
  clamp() {
    this.x = Math.max(this.bounds.minX, Math.min(this.bounds.maxX, this.x));
    this.y = Math.max(this.bounds.minY, Math.min(this.bounds.maxY, this.y));
  }
  update(dt: number) {
    if (Math.abs(this.vx) + Math.abs(this.vy) < 0.5) { this.vx = this.vy = 0; return; }
    this.pan(this.vx * dt, this.vy * dt);
    const k = Math.pow(0.02, dt);
    this.vx *= k; this.vy *= k;
  }
}
