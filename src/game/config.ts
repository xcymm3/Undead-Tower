export const CONFIG = {
  camera: { fov: 61, height: 4.8, yawLimit: 4 * Math.PI / 180, pitchLimit: 2.5 * Math.PI / 180, damping: 2.4 },
  weapon: { capacity: 30, interval: 0.115, reloadDuration: 1.55, range: 180 },
  target: { respawn: 3, bodyDamage: 50, headDamage: 100 },
} as const;

export type GamePhase = 'ready' | 'playing' | 'paused';
export interface GameSnapshot {
  phase: GamePhase;
  ammo: number;
  reloading: boolean;
  shots: number;
  hits: number;
  kills: number;
  fps: number;
  yaw: number;
  pitch: number;
  sound: boolean;
  pixelated: boolean;
}
