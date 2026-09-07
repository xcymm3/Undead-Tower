import type { GamePhase } from './config';

export const PREPARATION_SECONDS = 3;
/** 准备零点这一帧只推进玩家；敌人从下一帧开始，没有跨阶段刷新债务。 */
export function frameClocks(phase: GamePhase, countdown: number, delta: number) {
  const active = phase === 'playing' || phase === 'countdown';
  const player = active && Number.isFinite(delta) ? Math.max(0, Math.min(.1, delta)) : 0;
  const remaining = phase === 'countdown' ? Math.max(0, countdown - player) : countdown;
  return { player, enemy: phase === 'playing' ? player : 0, countdown: remaining < 1e-8 ? 0 : remaining };
}
