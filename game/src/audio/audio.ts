// Audio 100 % procédural (WebAudio) : musiques village/combat et effets sonores.
// Aucun fichier audio externe : identité sonore originale et APK léger.

type Music = 'village' | 'battle' | 'none';

export class AudioEngine {
  ctx: AudioContext | null = null;
  master!: GainNode;
  musicGain!: GainNode;
  sfxGain!: GainNode;
  private current: Music = 'none';
  private nextNoteAt = 0;
  private step = 0;
  private timer: number | null = null;
  private lastPlay = new Map<string, number>();
  musicVol = 0.6;
  sfxVol = 0.8;

  /** Doit être appelé depuis un geste utilisateur (politique des navigateurs). */
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') void this.ctx.resume(); return; }
    const AC = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext | undefined;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain(); this.master.gain.value = 0.9; this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain(); this.musicGain.connect(this.master);
    this.sfxGain = this.ctx.createGain(); this.sfxGain.connect(this.master);
    this.setVolumes(this.musicVol, this.sfxVol);
    this.timer = window.setInterval(() => this.schedule(), 50);
  }
  setVolumes(music: number, sfx: number) {
    this.musicVol = music; this.sfxVol = sfx;
    if (!this.ctx) return;
    this.musicGain.gain.value = music * 0.22;
    this.sfxGain.gain.value = sfx * 0.5;
  }
  suspend() { void this.ctx?.suspend(); }
  resume() { void this.ctx?.resume(); }

  music(m: Music) {
    if (m === this.current) return;
    this.current = m; this.step = 0;
    if (this.ctx) this.nextNoteAt = this.ctx.currentTime + 0.1;
  }

  // ───── Séquenceur ─────
  private schedule() {
    const ctx = this.ctx; if (!ctx || this.current === 'none') return;
    const bpm = this.current === 'battle' ? 132 : 84;
    const spb = 60 / bpm / 2; // croches
    while (this.nextNoteAt < ctx.currentTime + 0.25) {
      if (this.current === 'village') this.villageStep(this.step, this.nextNoteAt, spb);
      else this.battleStep(this.step, this.nextNoteAt, spb);
      this.nextNoteAt += spb; this.step++;
    }
  }
  // Village : progression modale douce (ré dorien), pad + arpèges de harpe + flûte.
  private villageStep(i: number, t: number, spb: number) {
    const chords = [[50, 57, 62, 65], [48, 55, 60, 64], [46, 53, 58, 62], [48, 55, 60, 67]];
    const bar = Math.floor(i / 8) % chords.length;
    const ch = chords[bar];
    if (i % 8 === 0) for (const n of ch.slice(0, 3)) this.tone(mtof(n - 12), t, spb * 8, 'triangle', 0.08, 0.6, this.musicGain);
    const arp = [0, 1, 2, 3, 2, 1, 2, 3];
    this.tone(mtof(ch[arp[i % 8]] + 12), t, spb * 1.6, 'sine', 0.09, 0.005, this.musicGain, 0.4);
    const melody = [74, -1, 72, 69, -1, 67, 69, -1, 72, -1, 74, 77, -1, 76, 74, -1];
    const mi = i % 64;
    if (mi >= 32 && melody[mi % 16] > 0 && i % 2 === 0) this.tone(mtof(melody[mi % 16]), t, spb * 1.8, 'sine', 0.05, 0.05, this.musicGain, 0.6, 5);
  }
  // Combat : ostinato de basse, tambours, cuivres.
  private battleStep(i: number, t: number, spb: number) {
    const bass = [38, 38, 50, 38, 41, 38, 50, 43];
    const roots = [0, 0, -2, -4];
    const r = roots[Math.floor(i / 16) % 4];
    this.tone(mtof(bass[i % 8] + r), t, spb * 0.9, 'sawtooth', 0.07, 0.005, this.musicGain, 0.15);
    if (i % 4 === 0) this.drum(t, 70, 0.35);
    if (i % 8 === 4) this.noise(t, 0.12, 0.2, 2000);
    if (i % 2 === 1) this.noise(t, 0.03, 0.06, 8000);
    if (i % 16 === 0) for (const n of [62, 65, 69]) this.tone(mtof(n + r), t, spb * 6, 'square', 0.03, 0.05, this.musicGain, 0.5);
  }

  // ───── Primitives ─────
  private tone(freq: number, t: number, dur: number, type: OscillatorType, vol: number, attack = 0.01, out?: AudioNode, release = 0.2, vibrato = 0) {
    const ctx = this.ctx!; const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (vibrato) { const l = ctx.createOscillator(); const lg = ctx.createGain(); l.frequency.value = vibrato; lg.gain.value = freq * 0.01; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + dur + release); }
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + release);
    o.connect(g); g.connect(out ?? this.sfxGain);
    o.start(t); o.stop(t + dur + release + 0.05);
  }
  private noise(t: number, dur: number, vol: number, cutoff: number, out?: AudioNode) {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff;
    const g = ctx.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(out ?? this.musicGain);
    src.start(t);
  }
  private drum(t: number, f: number, vol: number, out?: AudioNode) {
    const ctx = this.ctx!; const o = ctx.createOscillator(); const g = ctx.createGain();
    o.frequency.setValueAtTime(f * 2, t); o.frequency.exponentialRampToValueAtTime(f * 0.5, t + 0.2);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(g); g.connect(out ?? this.musicGain); o.start(t); o.stop(t + 0.35);
  }

  /** Effets sonores nommés, limités en fréquence pour éviter la cacophonie. */
  sfx(name: string) {
    const ctx = this.ctx; if (!ctx || this.sfxVol <= 0) return;
    const now = ctx.currentTime;
    const last = this.lastPlay.get(name) ?? 0;
    const minGap = name === 'hit' || name === 'arrow' ? 0.06 : 0.04;
    if (now - last < minGap) return;
    this.lastPlay.set(name, now);
    const t = now + 0.005;
    const out = this.sfxGain;
    switch (name) {
      case 'click': this.tone(880, t, 0.03, 'square', 0.06, 0.002, out, 0.03); break;
      case 'open': this.tone(520, t, 0.05, 'triangle', 0.1, 0.005, out, 0.08); this.tone(780, t + 0.05, 0.05, 'triangle', 0.1, 0.005, out, 0.08); break;
      case 'build': for (let i = 0; i < 3; i++) this.drum(t + i * 0.11, 220, 0.3, out); break;
      case 'upgrade': [523, 659, 784, 1046].forEach((f, i) => this.tone(f, t + i * 0.07, 0.1, 'triangle', 0.12, 0.005, out, 0.15)); break;
      case 'coin': this.tone(1318, t, 0.05, 'square', 0.06, 0.002, out, 0.05); this.tone(1760, t + 0.06, 0.08, 'square', 0.06, 0.002, out, 0.1); break;
      case 'wood': this.drum(t, 300, 0.25, out); this.drum(t + 0.07, 380, 0.2, out); break;
      case 'train': this.tone(330, t, 0.06, 'sawtooth', 0.06, 0.005, out, 0.05); break;
      case 'deploy': this.tone(200, t, 0.05, 'triangle', 0.12, 0.002, out, 0.08); break;
      case 'cannon': this.drum(t, 60, 0.5, out); this.noise(t, 0.15, 0.25, 900, out); break;
      case 'arrow': this.noise(t, 0.05, 0.1, 5000, out); break;
      case 'hit': this.noise(t, 0.04, 0.12, 2500, out); break;
      case 'explosion': this.drum(t, 45, 0.7, out); this.noise(t, 0.45, 0.45, 1200, out); break;
      case 'magic': [880, 1175, 1568].forEach((f, i) => this.tone(f, t + i * 0.03, 0.15, 'sine', 0.07, 0.01, out, 0.2)); break;
      case 'zap': this.tone(1400, t, 0.12, 'sawtooth', 0.08, 0.002, out, 0.05); this.noise(t, 0.1, 0.15, 6000, out); break;
      case 'freeze': this.tone(2000, t, 0.3, 'sine', 0.06, 0.01, out, 0.3, 12); break;
      case 'heal': [523, 659, 784].forEach((f, i) => this.tone(f, t + i * 0.08, 0.2, 'sine', 0.08, 0.02, out, 0.3)); break;
      case 'death': this.tone(300, t, 0.12, 'square', 0.05, 0.002, out, 0.08); break;
      case 'destroy': this.drum(t, 80, 0.5, out); this.noise(t, 0.6, 0.35, 700, out); break;
      case 'star': [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, t + i * 0.06, 0.12, 'triangle', 0.12, 0.005, out, 0.2)); break;
      case 'victory': [523, 659, 784, 1046, 784, 1046].forEach((f, i) => this.tone(f, t + i * 0.13, 0.18, 'triangle', 0.13, 0.01, out, 0.3)); break;
      case 'defeat': [392, 349, 311, 262].forEach((f, i) => this.tone(f, t + i * 0.22, 0.3, 'triangle', 0.12, 0.01, out, 0.3)); break;
      case 'reward': [1046, 1318, 1568, 2093].forEach((f, i) => this.tone(f, t + i * 0.05, 0.1, 'sine', 0.1, 0.005, out, 0.3)); break;
      case 'error': this.tone(180, t, 0.12, 'square', 0.07, 0.005, out, 0.05); break;
      case 'ability': this.tone(220, t, 0.3, 'sawtooth', 0.08, 0.01, out, 0.2); this.tone(440, t + 0.1, 0.3, 'sawtooth', 0.08, 0.01, out, 0.3); break;
    }
  }
}

function mtof(m: number) { return 440 * Math.pow(2, (m - 69) / 12); }

export const audio = new AudioEngine();
