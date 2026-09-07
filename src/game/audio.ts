import type { ZombieKind } from './config';
import { synthesizeDeath, synthesizeMusic } from './soundSynthesis';
import { METAL_VARIANTS, METAL_VOICES, metalRecipe, synthesizeMetal } from './metalSynthesis';

export const AUDIO_SETTINGS_KEY = 'undead-tower.audio.v1';
const MUSIC_LEVEL = 0.028;
const DUCKED_MUSIC_LEVEL = 0.007;

export class GameAudio {
  private context?: AudioContext;
  private noise?: AudioBuffer;
  private master?: GainNode;
  private musicGain?: GainNode;
  private musicBuffer?: AudioBuffer;
  private musicSource?: AudioBufferSourceNode;
  private musicOffset = 0;
  private musicStartedAt = 0;
  private duckUntil = 0;
  private playing = false;
  private disposed = false;
  private deaths = new Map<number, AudioBuffer>();
  private deathSources = new Set<AudioBufferSourceNode>();
  private deathCues = 0;
  private failureCues = 0;
  private muted = false;
  private level = 1;
  private armorCues = 0;
  private metalCues = 0;
  private metalBuffers = new Map<string, AudioBuffer>();
  private metalGain?: GainNode;
  private metalSources = new Set<AudioBufferSourceNode>();
  private lastMetal: ReturnType<typeof metalRecipe> | null = null;
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
    if (this.master) {
      // Settings are immediate, including when the audio render clock is suspended.
      this.master.gain.cancelScheduledValues(0);
      this.master.gain.value = this.muted ? 0 : this.level;
    }
    if (this.muted || this.level === 0) this.clearMetal();
    try { localStorage.setItem(AUDIO_SETTINGS_KEY, JSON.stringify({ enabled: this.enabled, volume: this.level })); }
    catch { /* 当前会话的音量调节仍然有效。 */ }
    this.syncMusic();
  }

  unlock() {
    if (this.disposed) return;
    try {
      this.context ??= new AudioContext();
      if (!this.master) {
        this.master = this.context.createGain();
        this.master.gain.value = this.muted ? 0 : this.level;
        this.master.connect(this.context.destination);
      }
      if (this.context.state === 'suspended') void this.context.resume().then(() => this.syncMusic()).catch(() => {});
      else this.syncMusic();
    } catch { /* 无音频设备时继续运行视觉原型。 */ }
  }

  setPlaying(playing: boolean) { this.playing = playing; if (!playing) this.clearMetal(); this.syncMusic(); }
  resetMusic() { this.setPlaying(false); this.musicOffset = 0; this.duckUntil = 0; this.clearMetal(); }

  private clearMetal() {
    for (const source of this.metalSources) { source.onended = null; source.stop(); source.disconnect(); }
    this.metalSources.clear();
    this.updateMetalGain();
  }
  private updateMetalGain() {
    if (this.metalGain) {
      this.metalGain.gain.cancelScheduledValues(0);
      this.metalGain.gain.value = 1 / Math.max(1, this.metalSources.size);
    }
  }

  private buffer(samples: Float32Array) {
    const buffer = this.context!.createBuffer(1, samples.length, this.context!.sampleRate);
    buffer.getChannelData(0).set(samples);
    return buffer;
  }

  private syncMusic() {
    const ctx = this.context;
    if (!ctx || !this.master) return;
    if (this.disposed || !this.playing || !this.enabled || this.level === 0 || ctx.state !== 'running') {
      if (this.musicSource) {
        this.musicOffset = (this.musicOffset + ctx.currentTime - this.musicStartedAt) % this.musicBuffer!.duration;
        this.musicSource.stop(); this.musicSource.disconnect(); this.musicSource = undefined;
      }
      return;
    }
    if (this.musicSource) return;
    this.musicBuffer ??= this.buffer(synthesizeMusic(ctx.sampleRate));
    if (!this.musicGain) { this.musicGain = ctx.createGain(); this.musicGain.connect(this.master); }
    this.musicGain.gain.cancelScheduledValues(ctx.currentTime);
    this.musicGain.gain.setValueAtTime(0, ctx.currentTime);
    this.musicGain.gain.linearRampToValueAtTime(MUSIC_LEVEL, ctx.currentTime + 0.3);
    const source = ctx.createBufferSource();
    source.buffer = this.musicBuffer; source.loop = true;
    source.connect(this.musicGain);
    this.musicStartedAt = ctx.currentTime;
    source.start(0, this.musicOffset);
    this.musicSource = source;
  }

  private duckMusic(duration = 0.3) {
    const ctx = this.context;
    if (!ctx || !this.musicGain || !this.musicSource) return;
    this.duckUntil = Math.max(this.duckUntil, ctx.currentTime + duration);
    const gain = this.musicGain.gain;
    gain.cancelScheduledValues(ctx.currentTime);
    gain.setValueAtTime(DUCKED_MUSIC_LEVEL, ctx.currentTime);
    gain.setValueAtTime(DUCKED_MUSIC_LEVEL, this.duckUntil);
    gain.linearRampToValueAtTime(MUSIC_LEVEL, this.duckUntil + 0.35);
  }

  shot() {
    const ctx = this.context;
    if (!ctx || !this.master || !this.enabled || this.level === 0) return;
    // 首次可信输入会异步唤醒 WebAudio；保留这次枪声，而不是在 resume 完成前静默丢弃。
    if (ctx.state === 'suspended') { void ctx.resume().then(() => this.shot()).catch(() => {}); return; }
    if (ctx.state !== 'running') return;
    this.duckMusic();
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

  failure() {
    this.failureCues++;
    this.clearMetal();
    this.setPlaying(false);
    this.tone(140, 35, 1.2, 0.12, 'sine');
    this.tone(480, 75, 0.45, 0.055, 'triangle');
    this.tone(72, 38, 1.8, 0.025, 'sawtooth');
  }

  tone(from: number, to: number, duration: number, volume = 0.035, type: OscillatorType = 'triangle', delay = 0) {
    const ctx = this.context;
    if (!ctx || !this.master || !this.enabled || this.level === 0 || ctx.state !== 'running') return;
    this.duckMusic(duration + delay);
    const start = ctx.currentTime + delay;
    const oscillator = ctx.createOscillator();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, start);
    oscillator.frequency.exponentialRampToValueAtTime(to, start + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    oscillator.connect(gain).connect(this.master);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    oscillator.start(start);
    oscillator.stop(start + duration);
  }

  armor(kind: ZombieKind, broken: boolean) {
    if (!this.context || !this.enabled || this.level === 0 || this.context.state !== 'running') return;
    this.armorCues++; this.lastArmorCue = { kind, broken };
    if (kind === 'bucket') {
      this.metal(broken);
    } else {
      // 塑料路锥以低沉的空腔撞击搭配短促的敲击起音。
      this.tone(broken ? 260 : 430, 95, broken ? 0.22 : 0.13, 0.11, 'triangle', 0.035);
      this.tone(1050, 390, 0.055, 0.045, 'square', 0.035);
    }
  }

  private metal(broken: boolean) {
    const ctx = this.context;
    if (!ctx || !this.master || this.disposed) return;
    const variant = this.metalCues++ % METAL_VARIANTS.length, key = `${broken}:${variant}`;
    this.lastMetal = metalRecipe(broken, variant);
    if (!this.metalBuffers.has(key)) this.metalBuffers.set(key, this.buffer(synthesizeMetal(ctx.sampleRate, broken, variant)));
    if (this.metalSources.size >= METAL_VOICES) {
      const oldest = this.metalSources.values().next().value!;
      oldest.onended = null; oldest.stop(); oldest.disconnect(); this.metalSources.delete(oldest);
    }
    this.metalGain ??= ctx.createGain();
    if (!this.metalSources.size) { this.metalGain.disconnect(); this.metalGain.connect(this.master); }
    const source = ctx.createBufferSource(); source.buffer = this.metalBuffers.get(key)!;
    source.connect(this.metalGain);
    source.onended = () => { source.disconnect(); this.metalSources.delete(source); this.updateMetalGain(); };
    this.metalSources.add(source); this.updateMetalGain(); source.start(ctx.currentTime + .018);
    this.duckMusic(source.buffer.duration);
  }

  death() {
    const ctx = this.context;
    if (!ctx || !this.master || !this.enabled || this.level === 0 || ctx.state !== 'running') return;
    const variant = this.deathCues++ % 3;
    if (!this.deaths.has(variant)) this.deaths.set(variant, this.buffer(synthesizeDeath(ctx.sampleRate, variant)));
    // 连续击杀时保留最新三声，避免低吼叠加盖住射击声。
    if (this.deathSources.size >= 3) {
      const oldest = this.deathSources.values().next().value!;
      oldest.stop(); this.deathSources.delete(oldest);
    }
    const source = ctx.createBufferSource(); source.buffer = this.deaths.get(variant)!;
    const gain = ctx.createGain(); gain.gain.value = 0.12;
    source.connect(gain).connect(this.master);
    source.onended = () => { source.disconnect(); gain.disconnect(); this.deathSources.delete(source); };
    this.deathSources.add(source); source.start();
    this.duckMusic(source.buffer.duration);
  }

  diagnostics() { return { enabled: this.enabled, volume: this.volume, gain: this.master?.gain.value ?? (this.muted ? 0 : this.level), armorCues: this.armorCues, lastArmorCue: this.lastArmorCue, metalCues: this.metalCues, activeMetal: this.metalSources.size, cachedMetal: this.metalBuffers.size, lastMetal: this.lastMetal, deathCues: this.deathCues, failureCues: this.failureCues, activeDeaths: this.deathSources.size, musicPlaying: Boolean(this.musicSource), musicLevel: MUSIC_LEVEL, musicDucked: Boolean(this.musicSource && this.context && this.context.currentTime < this.duckUntil), duckedMusicLevel: DUCKED_MUSIC_LEVEL }; }
  dispose() { this.disposed = true; this.setPlaying(false); this.clearMetal(); this.metalGain?.disconnect(); this.metalBuffers.clear(); this.deathSources.clear(); void this.context?.close().catch(() => {}); }
}
