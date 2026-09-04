type Triple = [number, number, number];
const seat: Triple = [0, -0.255, -0.40];
const support: Triple = [-0.12, -0.13, -0.76];
function smooth(value: number) { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); }
function track(progress: number, keys: [number, Triple][]): Triple {
  for (let i = 1; i < keys.length; i++) if (progress <= keys[i][0]) {
    const [a, from] = keys[i - 1], [b, to] = keys[i];
    const t = smooth((progress - a) / (b - a));
    return from.map((value, axis) => value + (to[axis] - value) * t) as Triple;
  }
  return [...keys[keys.length - 1][1]];
}

/** 唯一输入为武器的有效换弹进度，暂停不会推进手部、弹匣或枪机。 */
export function reloadPose(progress: number | null, empty = false) {
  const p = progress === null ? 1 : Math.max(0, Math.min(1, progress));
  const motion = smooth(p / 0.15) * (1 - smooth((p - 0.83) / 0.17));
  const magazine = track(p, [[0, seat], [0.14, seat], [0.36, [-0.09, -0.69, -0.30]], [0.43, [-0.26, -0.78, -0.18]], [0.71, seat], [0.76, [0, -0.24, -0.40]], [0.80, seat], [1, seat]]);
  const bolt: Triple = empty ? [-0.17, 0.015, -0.16] : support;
  const hand = track(p, [[0, support], [0.14, [-0.12, -0.31, -0.35]], [0.36, [-0.21, -0.75, -0.25]], [0.43, [-0.38, -0.84, -0.13]], [0.71, [-0.12, -0.31, -0.35]], [0.77, [-0.08, -0.47, -0.37]], [0.85, bolt], [0.9, bolt], [1, support]]);
  const oldFall = Math.max(0, p - 0.36) / 0.22;
  return {
    stage: progress === null || p >= 1 ? 'idle' : p < 0.14 ? 'reach' : p < 0.36 ? 'remove' : p < 0.71 ? 'insert' : p < 0.80 ? 'seat' : p < 0.91 && empty ? 'bolt' : 'settle',
    roll: -0.7 * motion, tilt: -0.09 * motion, lift: 0.18 * motion, shift: -0.09 * motion,
    magazine, magazineVisible: !(p >= 0.36 && p < 0.43),
    magazineTilt: -0.15 + Math.sin(smooth((p - 0.43) / 0.28) * Math.PI) * 0.20,
    oldMagazineVisible: p >= 0.36 && p < 0.58,
    oldMagazine: [-0.09 - oldFall * 0.12, -0.69 - oldFall * oldFall * 0.7, -0.30 + oldFall * 0.1] as Triple,
    oldRotation: [-0.15 + oldFall * 1.2, oldFall * 0.4, oldFall * -0.7] as Triple,
    hand, bolt: empty ? smooth((p - 0.83) / 0.04) * (1 - smooth((p - 0.9) / 0.035)) : 0,
  };
}
