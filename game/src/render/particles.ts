// Système de particules à pool fixe (aucune allocation en jeu).
export interface Particle { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; max: number; size: number; color: string; kind: number; grav: number }

export const PK = { dot: 0, smoke: 1, spark: 2, text: 3, ring: 4, debris: 5, glow: 6 } as const;

export class Particles {
  pool: Particle[] = [];
  texts: { x: number; y: number; text: string; color: string; life: number; max: number; size: number }[] = [];
  private n = 0;
  constructor(public cap = 1500) {
    for (let i = 0; i < cap; i++) this.pool.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, size: 1, color: '#fff', kind: 0, grav: 0 });
  }
  setCap(cap: number) { this.cap = Math.min(this.pool.length, cap); if (this.n > this.cap) this.n = this.cap; }
  spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, color: string, kind: number, grav = 0) {
    if (this.n >= this.cap) return;
    const p = this.pool[this.n++];
    p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz; p.life = life; p.max = life; p.size = size; p.color = color; p.kind = kind; p.grav = grav;
  }
  burst(x: number, y: number, z: number, count: number, color: string, speed: number, life: number, size: number, kind: number = PK.dot, grav = 0) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2, s = speed * (0.4 + Math.random() * 0.6);
      this.spawn(x, y, z, Math.cos(a) * s, Math.sin(a) * s * 0.5, speed * (0.3 + Math.random()), life * (0.6 + Math.random() * 0.6), size * (0.6 + Math.random() * 0.8), color, kind, grav);
    }
  }
  text(x: number, y: number, text: string, color: string, size = 16) {
    if (this.texts.length > 40) this.texts.shift();
    this.texts.push({ x, y, text, color, life: 1.3, max: 1.3, size });
  }
  update(dt: number) {
    for (let i = 0; i < this.n; i++) {
      const p = this.pool[i];
      p.life -= dt;
      if (p.life <= 0) { const last = this.pool[--this.n]; this.pool[this.n] = p; this.pool[i] = last; i--; continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.vz -= p.grav * dt;
      if (p.z < 0 && p.grav) { p.z = 0; p.vz *= -0.3; p.vx *= 0.6; p.vy *= 0.6; }
      if (p.kind === PK.smoke) { p.size += dt * 8; p.vx *= 0.98; }
    }
    for (const t of this.texts) { t.life -= dt; t.y -= dt * 30; }
    this.texts = this.texts.filter(t => t.life > 0);
  }
  draw(c: CanvasRenderingContext2D) {
    for (let i = 0; i < this.n; i++) {
      const p = this.pool[i];
      const a = Math.max(0, p.life / p.max);
      const y = p.y - p.z;
      switch (p.kind) {
        case PK.smoke: c.globalAlpha = a * 0.5; c.fillStyle = p.color; c.beginPath(); c.arc(p.x, y, p.size, 0, Math.PI * 2); c.fill(); break;
        case PK.ring: c.globalAlpha = a; c.strokeStyle = p.color; c.lineWidth = 3; c.beginPath(); c.ellipse(p.x, p.y, p.size * (1.6 - a), p.size * (1.6 - a) * 0.5, 0, 0, Math.PI * 2); c.stroke(); break;
        case PK.glow: { c.globalAlpha = a; const g = c.createRadialGradient(p.x, y, 0, p.x, y, p.size); g.addColorStop(0, p.color); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.beginPath(); c.arc(p.x, y, p.size, 0, Math.PI * 2); c.fill(); break; }
        case PK.debris: c.globalAlpha = Math.min(1, a * 2); c.fillStyle = p.color; c.fillRect(p.x - p.size / 2, y - p.size / 2, p.size, p.size); break;
        default: c.globalAlpha = a; c.fillStyle = p.color; c.beginPath(); c.arc(p.x, y, p.size, 0, Math.PI * 2); c.fill();
      }
    }
    c.globalAlpha = 1;
    c.textAlign = 'center';
    for (const t of this.texts) {
      c.globalAlpha = Math.min(1, t.life / t.max * 2);
      c.font = `bold ${t.size}px system-ui, sans-serif`;
      c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,0.7)'; c.strokeText(t.text, t.x, t.y);
      c.fillStyle = t.color; c.fillText(t.text, t.x, t.y);
    }
    c.globalAlpha = 1;
  }
  clear() { this.n = 0; this.texts = []; }
  get count() { return this.n; }
}
