import type { RogueResult, RogueSnapshot } from './rogue';
export const CONFIG = {
  camera: { fov: 61, height: 4.8, yawLimit: 4 * Math.PI / 180, pitchLimit: 2.5 * Math.PI / 180, damping: 5 },
  weapon: { capacity: 30, interval: 0.15, reloadDuration: 1.55, range: 180 },
  target: { respawn: 3, bodyDamage: 50, headDamage: 100 },
} as const;

export type GameMode = 'practice' | 'survival';
export type Difficulty = 'easy' | 'normal' | 'hard';
export const FIXED_DIFFICULTY = 'hard' satisfies Difficulty;
export type ZombieKind = 'normal' | 'cone' | 'bucket' | 'football' | 'giant' | 'wizard' | 'skitter' | 'charger' | 'howler' | 'berserker';
export type GamePhase = 'ready' | 'playing' | 'paused' | 'breaching' | 'failed' | 'countdown' | 'upgrade';
export const PRESSURE = { spawnRate: 0.65, spawnGrowth: 0.035, speed: 1.4 } as const;
export const ZOMBIE_TYPES = {
  normal: { label: '普通僵尸', health: 100, armor: 0 },
  cone: { label: '路障僵尸', health: 200, armor: 100 },
  bucket: { label: '铁桶僵尸', health: 400, armor: 300 },
  football: { label: '橄榄球僵尸', health: 400, armor: 300 },
  giant: { label: '巨人僵尸', health: 2000, armor: 600 },
  wizard: { label: '巫师僵尸', health: 800, armor: 0 },
  skitter: { label: '游走者', health: 900, armor: 0 },
  charger: { label: '突进者', health: 1800, armor: 0 },
  howler: { label: '号令者', health: 1600, armor: 0 },
  berserker: { label: '狂暴者', health: (2000 + 600) * 2, armor: 0 },
} as const;
export const ZOMBIE_KINDS = Object.keys(ZOMBIE_TYPES) as ZombieKind[];
export const emptyZombieCounts = () => Object.fromEntries(ZOMBIE_KINDS.map(kind => [kind, 0])) as Record<ZombieKind, number>;
export const ENEMY_RULES = {
  skitter: { lateralSpeed: .85, frequency: 2.4 },
  charger: { minimumRange: 10, maximumRange: 24, windup: .8, speedMultiplier: 2.2, chargeDuration: 1.25, staggerDuration: .7, cooldown: 5 },
  howler: { radius: 7, requiredAllies: 2, windup: .9, speedMultiplier: 1.35, duration: 3, cooldown: 7, interruptedCooldown: 3 },
  berserker: { threshold: .4, speedMultiplier: 1.8 },
} as const;
export const ARMOR_SPAWNS = { normalPerCone: 3, conesPerBucket: 2 } as const;
export const DIFFICULTIES = {
  easy: { label: '简单', description: '仅普通僵尸，爆头 1 枪击倒' },
  normal: { label: '普通', description: '开局即按比例混入路障僵尸，爆头需 2 枪' },
  hard: { label: '困难', description: '开局即按比例加入路障与铁桶，铁桶爆头需 4 枪' },
} as const;
export const SURVIVAL = { maxSpawnRate: 10, maxZombies: 256, breachRadius: 8, playerX: 0, playerZ: 9 } as const;
export const CROWD = { separationRadius: 1.35, maxLateralSpeed: 0.32, lateralFraction: 0.2, steeringDamping: 5, arrivalFade: 2 } as const;
export const zombieSpeed = (kind: ZombieKind) => kind === 'football' ? 2 : kind === 'giant' ? .5 : 1;
export const zombieScale = (kind: ZombieKind) => kind === 'giant' ? 2.5 : 1;
export interface RunResult {
  rogue?: RogueResult;
  id: string;
  difficulty: Difficulty;
  duration: number;
  kills: number;
  shots: number;
  hits: number;
  endedAt: string;
}
export interface GameSnapshot {
  rogue?: RogueSnapshot;
  weaponsReady: boolean; weaponIndex: number; requestedWeapon: number; switching: boolean; reloadQueued: boolean; inventory: number[];
  phase: GamePhase;
  mode: GameMode;
  difficulty: Difficulty;
  survived: number;
  alive: number;
  zombieCounts: Record<ZombieKind, number>;
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
  volume: number;
  breach: { id: number; kind: ZombieKind; x: number; y: number; side: string } | null;
  pixelated: boolean;
}
