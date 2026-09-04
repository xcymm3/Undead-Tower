import type { ZombieKind } from './config';

export const AUDIO_SETTINGS_KEY = 'undead-tower.audio.v1';

export class GameAudio {
  private context?: AudioContext;
  private noise?: AudioBuffer;
  private master?: GainNode;
  private muted = false;
  private level = 1;
  private armorCues = 0;
  private lastArmorCue: { kind: ZombieKind; broken: boolean } | null = null;

  constructor() {
    try {
      const value = JSON.parse(localStorage.getItem(AUDIO_SETTINGS_KEY) ?? '{}');
      if (typeof value?.volume === 'number' && Number.isFinite(value.volume)) this.level = Math.max(0, Math.min(1, value.volume));
      this.muted = value?.enabled === false;
    } catch { /* 存储不可用或损坏时使用默认音量。 */ }
  }

  get enabled() { return !this.muted; }
  get volume() { return this.level; }
  set enabled(value: boolean) { this.muted = !value; this.applyVolume(); }
  set volume(value: number) { if (Number.isFinite(value)) { this.level = Math.max(0, Math.min(1, value)); this.applyVolume(); } }

  private applyVolume() {
    if (this.master && this.context) this.master.gain.setValueAtTime(this.muted ? 0 : this.level, this.context.currentTime);
    try { localStorage.setItem(AUDIO_SETTINGS_KEY, JSON.stringify({ enabled: this.enabled, volume: this.level })); }
    catch { /* 当前会话的音量调节仍然有效。 */ }
  }

  unlock() {
    try {
      this.context ??= new AudioContext();
      if (!this.master) {
        this.master = this.context.createGain();
        this.master.gain.value = this.muted ? 0 : this.level;
        this.master.connect(this.context.destination);
      }
      if (this.context.state === 'suspended') void this.context.resume().catch(() => {});
    } catch { /* 无音频设备时继续运行视觉原型。 */ }
  }

  shot() {
    const ctx = this.context;
    if (!ctx || !this.master || !this.enabled || this.level === 0 || ctx.state !== 'running') return;
    if (!this.noise) {
      this.noise = ctx.createBuffer(1, ctx.sampleRate * 0.3, ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(3400, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(280, ctx.currentTime + 0.18);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.21, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.24);
    noise.connect(filter).connect(gain).connect(this.master);
    noise.onended = () => { noise.disconnect(); filter.disconnect(); gain.disconnect(); };
    noise.start();
    noise.stop(ctx.currentTime + 0.26);
    this.tone(140, 44, 0.17, 0.12);
  }

  tone(from: number, to: number, duration: number, volume = 0.035) {
    const ctx = this.context;
    if (!ctx || !this.master || !this.enabled || this.level === 0 || ctx.state !== 'running') return;
    const oscillator = ctx.createOscillator();
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(from, ctx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(to, ctx.currentTime + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    oscillator.connect(gain).connect(this.master);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    oscillator.start();
    oscillator.stop(ctx.currentTime + duration);
  }

  armor(kind: ZombieKind, broken: boolean) {
    if (!this.context || !this.enabled || this.level === 0 || this.context.state !== 'running') return;
    this.armorCues++; this.lastArmorCue = { kind, broken };
    if (kind === 'bucket') {
      // 不同频率叠加产生金属敲击余音，脱落时更低、更长。
      this.tone(broken ? 620 : 1650, broken ? 230 : 1300, broken ? 0.32 : 0.15, 0.075);
      this.tone(broken ? 1010 : 2460, broken ? 430 : 1990, 0.20, 0.035);
    } else {
      this.tone(broken ? 290 : 510, 95, broken ? 0.20 : 0.09, 0.08);
      this.tone(880, 330, 0.045, 0.025);
    }
  }

  diagnostics() { return { enabled: this.enabled, volume: this.volume, gain: this.master?.gain.value ?? (this.muted ? 0 : this.level), armorCues: this.armorCues, lastArmorCue: this.lastArmorCue }; }
  dispose() { void this.context?.close().catch(() => {}); }
}
