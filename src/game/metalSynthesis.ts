/** Original dry bucket percussion; one cached PCM buffer is one polyphony group. */
export const METAL_VOICES = 6;
export const METAL_VARIANTS = [
  { pitch: .975, decay: .94, gain: .94 },
  { pitch: 1.018, decay: 1.06, gain: 1.07 },
  { pitch: .993, decay: 1.025, gain: 1.02 },
  { pitch: 1.03, decay: .92, gain: .9 },
] as const;
export function metalRecipe(broken: boolean, variant: number) {
  const index = ((Math.trunc(variant) % METAL_VARIANTS.length) + METAL_VARIANTS.length) % METAL_VARIANTS.length;
  const variation = METAL_VARIANTS[index];
  const modes = broken ? [827, 1433, 2381, 3319] : [1481, 2377, 3541, 4621];
  return { broken, variant: index, variation,
    transientSeconds: broken ? .042 : .028,
    duration: (broken ? .38 : .28) * variation.decay,
    resonances: modes.map((frequency, n) => ({ frequency: frequency * variation.pitch, decay: (broken ? .085 : .055) * variation.decay / (1 + n * .22), gain: [.21, .15, .1, .06][n] })),
    cavity: { frequency: (broken ? 173 : 263) * variation.pitch, decay: (broken ? .11 : .072) * variation.decay, gain: .19 },
    // Peak at master=1 lies between body cue (.025) and gunshot noise (.21).
    peak: .105 * variation.gain,
  };
}
export function synthesizeMetal(sampleRate: number, broken: boolean, variant: number) {
  const recipe = metalRecipe(broken, variant), samples = new Float32Array(Math.ceil(sampleRate * recipe.duration));
  let seed = 0x4a31 + recipe.variant * 733 + (broken ? 991 : 0), lastNoise = 0, peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const time = i / sampleRate;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = seed / 0xffffffff * 2 - 1;
    const transient = time < recipe.transientSeconds ? (noise - lastNoise) * .16 * (1 - time / recipe.transientSeconds) ** 2 : 0;
    lastNoise = noise;
    const resonances = recipe.resonances.reduce((sum, mode) => sum + Math.sin(2 * Math.PI * mode.frequency * time) * mode.gain * Math.exp(-time / mode.decay), 0);
    const cavity = Math.sin(2 * Math.PI * recipe.cavity.frequency * time) * recipe.cavity.gain * Math.exp(-time / recipe.cavity.decay);
    const attack = Math.min(1, time / .0015), release = Math.min(1, (recipe.duration - time) / .018);
    samples[i] = (transient + resonances + cavity) * attack * release;
    peak = Math.max(peak, Math.abs(samples[i]));
  }
  if (peak) for (let i = 0; i < samples.length; i++) samples[i] *= recipe.peak / peak;
  return samples;
}
