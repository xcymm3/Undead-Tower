export const CONFIG = {
  camera: { fov: 61, height: 4.8, yawLimit: 4 * Math.PI / 180, pitchLimit: 2.5 * Math.PI / 180, damping: 2.4 },
  weapon: { capacity: 30, interval: 0.115, reloadDuration: 1.55, range: 180 },
  target: { respawn: 3, bodyDamage: 50, headDamage: 100 },
} as const;

export type GameMode = 'practice' | 'survival';
export type Difficulty = 'easy' | 'normal' | 'hard';
export type GamePhase = 'ready' | 'playing' | 'paused' | 'failed';
export const DIFFICULTIES = {
  easy: { label: '简单', description: '更慢的脚步，更长的准备时间', spawnRate: 0.38, spawnGrowth: 0.02, speed: 0.85, speedGrowth: 0.007 },
  normal: { label: '普通', description: '保持射击节奏，兼顾多路来敌', spawnRate: 0.65, spawnGrowth: 0.035, speed: 1.25, speedGrowth: 0.011 },
  hard: { label: '困难', description: '更密集的尸群，更快的逼近', spawnRate: 1.1, spawnGrowth: 0.06, speed: 1.75, speedGrowth: 0.016 },
} as const;
export const SURVIVAL = { maxSpawnRate: 10, maxZombies: 256, breachRadius: 8, playerX: 0, playerZ: 9 } as const;
export interface RunResult {
  id: string;
  difficulty: Difficulty;
  duration: number;
  kills: number;
  shots: number;
  hits: number;
  endedAt: string;
}
export interface GameSnapshot {
  phase: GamePhase;
  mode: GameMode;
  difficulty: Difficulty;
  survived: number;
  alive: number;
  nearest: number | null;
  spawnRate: number;
  speed: number;
  result: RunResult | null;
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
