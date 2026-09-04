/** 原创离线合成 PCM，不依赖网络或外部音频素材。 */
export function synthesizeDeath(sampleRate: number, variant: number) {
  const duration = 0.62 + variant * 0.055;
  const samples = new Float32Array(Math.ceil(sampleRate * duration));
  let phase = 0, seed = 1729 + variant * 733;
  for (let i = 0; i < samples.length; i++) {
    const t = i / sampleRate, progress = t / duration;
    const pitch = (135 + variant * 14) * (1 - 0.48 * progress) + Math.sin(t * 37) * 5;
    phase += pitch / sampleRate;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = seed / 0xffffffff * 2 - 1;
    // 声带谐波加轻微气声与颤动，音高随死亡叫声下降。
    const voice = Math.sin(phase * Math.PI * 2) * 0.48 + Math.sin(phase * Math.PI * 4) * 0.22 + Math.sin(phase * Math.PI * 8) * 0.12;
    const breath = noise * 0.09 * (0.5 + 0.5 * Math.sin(phase * Math.PI * 2));
    const envelope = Math.min(1, t / 0.035) * Math.pow(1 - progress, 1.2) * (0.85 + 0.15 * Math.sin(t * 64));
    samples[i] = (voice + breath) * envelope;
  }
  return samples;
}

export function synthesizeMusic(sampleRate: number) {
  const beat = 0.6, duration = beat * 16;
  const samples = new Float32Array(Math.round(sampleRate * duration));
  const chords = [[146.83, 174.61, 220], [116.54, 146.83, 174.61], [130.81, 164.81, 196], [110, 146.83, 164.81]];
  const melody = [293.66, 0, 349.23, 329.63, 293.66, 0, 261.63, 220];
  for (let i = 0; i < samples.length; i++) {
    const t = i / sampleRate;
    const chordTime = t % (beat * 4), chordIndex = Math.floor(t / (beat * 4));
    const chordEnvelope = Math.min(1, chordTime / 0.10, (beat * 4 - chordTime) / 0.14);
    const chord = chords[chordIndex];
    let value = chord.reduce((sum, note) => sum + Math.sin(t * note * Math.PI * 2) * 0.10, 0) * chordEnvelope;
    value += Math.sin(t * chord[0] * Math.PI) * 0.10 * chordEnvelope;
    const noteTime = t % (beat * 2), note = melody[Math.floor(t / (beat * 2))];
    if (note) value += Math.sin(noteTime * note * Math.PI * 2) * Math.min(1, noteTime / 0.015) * Math.exp(-noteTime * 4) * 0.16;
    samples[i] = value * Math.min(1, t / 0.025, (duration - t) / 0.025);
  }
  return samples;
}
