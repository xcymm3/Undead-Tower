export class GameAudio {
  private context?: AudioContext;
  private noise?: AudioBuffer;
  enabled = true;

  unlock() {
    try {
      this.context ??= new AudioContext();
      if (this.context.state === 'suspended') void this.context.resume().catch(() => {});
    } catch { /* 无音频设备时继续运行视觉原型。 */ }
  }

  shot() {
    const ctx = this.context;
    if (!ctx || !this.enabled || ctx.state !== 'running') return;
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
    noise.connect(filter).connect(gain).connect(ctx.destination);
    noise.start();
    noise.stop(ctx.currentTime + 0.26);
    this.tone(140, 44, 0.17, 0.12);
  }

  tone(from: number, to: number, duration: number, volume = 0.035) {
    const ctx = this.context;
    if (!ctx || !this.enabled || ctx.state !== 'running') return;
    const oscillator = ctx.createOscillator();
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(from, ctx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(to, ctx.currentTime + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + duration);
  }

  dispose() { void this.context?.close().catch(() => {}); }
}
