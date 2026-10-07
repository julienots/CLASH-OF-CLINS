// Gestion tactile unifiée : tap, glisser, pincer-zoomer, molette, appui long répété.
import type { Camera } from '../render/iso';

export interface InputHandlers {
  tap?(x: number, y: number): void;
  /** retourne true si le glisser est capturé (sinon : déplacement de caméra) */
  dragStart?(x: number, y: number): boolean;
  drag?(x: number, y: number): void;
  dragEnd?(x: number, y: number): void;
  hold?(x: number, y: number): void;    // répété tant que le doigt reste appuyé
  holdInterval?: number;
}

export class Input {
  private pts = new Map<number, { x: number; y: number; sx: number; sy: number; t: number }>();
  private mode: 'none' | 'pan' | 'drag' | 'pinch' = 'none';
  private pinchD = 0;
  private holdTimer: number | null = null;
  private lastMove = { x: 0, y: 0, t: 0 };
  private disposers: (() => void)[] = [];
  enabled = true;

  constructor(private el: HTMLElement, private cam: Camera, private hnd: InputHandlers) {
    const on = (ev: string, f: any, o?: any) => { el.addEventListener(ev, f, o); this.disposers.push(() => el.removeEventListener(ev, f, o)); };
    on('pointerdown', (e: PointerEvent) => this.down(e));
    on('pointermove', (e: PointerEvent) => this.move(e));
    on('pointerup', (e: PointerEvent) => this.up(e));
    on('pointercancel', (e: PointerEvent) => this.up(e, true));
    on('wheel', (e: WheelEvent) => { e.preventDefault(); this.cam.zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.offsetX, e.offsetY); }, { passive: false });
    on('contextmenu', (e: Event) => e.preventDefault());
  }
  dispose() { for (const d of this.disposers) d(); this.stopHold(); }

  private down(e: PointerEvent) {
    if (!this.enabled) return;
    this.el.setPointerCapture?.(e.pointerId);
    this.pts.set(e.pointerId, { x: e.offsetX, y: e.offsetY, sx: e.offsetX, sy: e.offsetY, t: performance.now() });
    this.cam.vx = this.cam.vy = 0;
    if (this.pts.size === 2) {
      this.stopHold();
      if (this.mode === 'drag') this.hnd.dragEnd?.(e.offsetX, e.offsetY);
      this.mode = 'pinch';
      const [a, b] = [...this.pts.values()];
      this.pinchD = Math.hypot(a.x - b.x, a.y - b.y);
    } else if (this.pts.size === 1) {
      this.mode = 'none';
      if (this.hnd.hold) {
        this.hnd.hold(e.offsetX, e.offsetY);
        this.holdTimer = window.setInterval(() => { const p = this.pts.get(e.pointerId); if (p && this.mode === 'none') this.hnd.hold!(p.x, p.y); }, this.hnd.holdInterval ?? 140);
      }
    }
  }
  private move(e: PointerEvent) {
    const p = this.pts.get(e.pointerId);
    if (!p) return;
    const dx = e.offsetX - p.x, dy = e.offsetY - p.y;
    p.x = e.offsetX; p.y = e.offsetY;
    if (this.mode === 'pinch' && this.pts.size >= 2) {
      const [a, b] = [...this.pts.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (this.pinchD > 0) this.cam.zoomAt(d / this.pinchD, (a.x + b.x) / 2, (a.y + b.y) / 2);
      this.pinchD = d;
      this.cam.pan(dx / 2, dy / 2);
      return;
    }
    if (this.mode === 'none' && Math.hypot(p.x - p.sx, p.y - p.sy) > 9) {
      this.stopHold();
      this.mode = this.hnd.dragStart?.(p.sx, p.sy) ? 'drag' : 'pan';
    }
    if (this.mode === 'drag') this.hnd.drag?.(p.x, p.y);
    else if (this.mode === 'pan') {
      this.cam.pan(dx, dy);
      const now = performance.now();
      const dt = Math.max(1, now - this.lastMove.t) / 1000;
      this.cam.vx = dx / dt * 0.9; this.cam.vy = dy / dt * 0.9;
      this.lastMove = { x: p.x, y: p.y, t: now };
    }
  }
  private up(e: PointerEvent, cancel = false) {
    const p = this.pts.get(e.pointerId);
    this.pts.delete(e.pointerId);
    this.stopHold();
    if (!p) return;
    if (this.mode === 'drag') this.hnd.dragEnd?.(p.x, p.y);
    else if (this.mode === 'none' && !cancel && performance.now() - p.t < 600 && !this.hnd.hold) this.hnd.tap?.(p.x, p.y);
    if (this.mode === 'pan' && performance.now() - this.lastMove.t > 80) { this.cam.vx = this.cam.vy = 0; }
    if (this.mode !== 'pan') { this.cam.vx = this.cam.vy = 0; }
    if (this.pts.size === 0) this.mode = 'none';
    else if (this.mode === 'pinch') this.mode = 'pan';
  }
  private stopHold() { if (this.holdTimer !== null) { clearInterval(this.holdTimer); this.holdTimer = null; } }
}
