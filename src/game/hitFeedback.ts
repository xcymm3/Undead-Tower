export interface HitFeedback { head: boolean; killed: boolean; armorBroken: boolean; critical: boolean; }
// Keep a real hit's head/critical pair: different pellets cannot invent a critical headshot.
export function strongestFeedback(previous: HitFeedback | null, next: HitFeedback): HitFeedback {
  const rank = (hit: HitFeedback) => (hit.critical ? 4 : 0) + (hit.head ? 2 : 0) + (hit.armorBroken ? 1 : 0);
  return !previous || rank(next) > rank(previous) ? next : previous;
}
export function hitFeedbackText(hit: HitFeedback) {
  if (hit.critical) return { label: hit.head ? '暴击爆头' : '暴击', detail: hit.armorBroken ? '护甲击落' : hit.killed ? '目标击倒' : '致命命中' };
  return { label: hit.armorBroken ? '护甲击落' : hit.head ? '精准命中' : hit.killed ? '目标击倒' : '命中目标',
    detail: hit.armorBroken ? 'ARMOR OFF · 继续射击' : hit.head ? 'HEADSHOT' : hit.killed ? 'TARGET DOWN' : 'TARGET HIT' };
}
