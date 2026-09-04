import { ARMOR_SPAWNS, CONFIG, FIXED_DIFFICULTY, PRESSURE, SURVIVAL, ZOMBIE_TYPES } from './config';
import type { Difficulty, GameMode, ZombieKind } from './config';
import { CrowdMovement } from './movement';
import type { Navigation } from './navigation';

export interface Position { x: number; z: number; }
export interface SpawnPosition extends Position { spawnZone?: string; }
export interface Zombie extends SpawnPosition { id: number; kind: ZombieKind; health: number; maxHealth: number; armorHealth: number; downTime: number; bornAt: number; avoidance?: number; heading?: number; }
export const PRACTICE_POSITIONS: Position[] = [{ x: -5.8, z: -9.5 }, { x: 0.15, z: -17 }, { x: 5.4, z: -21 }, { x: -1, z: -31 }];

export function pressureAt(_difficulty: Difficulty, elapsed: number) {
  const profile = PRESSURE;
  const time = Math.max(0, elapsed);
  return { spawnRate: Math.min(SURVIVAL.maxSpawnRate, profile.spawnRate + profile.spawnGrowth * time), speed: profile.speed };
}

/** 积分而非每帧概率，保证不同帧率下的刷新量一致，封顶后稳定每秒 10 只。 */
export function spawnIntegral(_difficulty: Difficulty, from: number, to: number) {
  const profile = PRESSURE;
  const capAt = (SURVIVAL.maxSpawnRate - profile.spawnRate) / profile.spawnGrowth;
  const primitive = (t: number) => {
    const ramp = Math.min(Math.max(0, t), capAt);
    return profile.spawnRate * ramp + profile.spawnGrowth * ramp * ramp / 2 + Math.max(0, t - capAt) * SURVIVAL.maxSpawnRate;
  };
  return Math.max(0, primitive(to) - primitive(from));
}

/** 到失败半径的直线距离下界，不包含绕障路程或拥挤避让。 */
export function distanceToBreach(zombie: SpawnPosition) {
  return Math.max(0, Math.hypot(zombie.x - SURVIVAL.playerX, zombie.z - SURVIVAL.playerZ) - SURVIVAL.breachRadius);
}

export class Encounter {
  mode: GameMode = 'practice';
  difficulty: Difficulty = FIXED_DIFFICULTY;
  elapsed = 0;
  failed = false;
  breachedId: number | null = null;
  kills = 0;
  zombies: Zombie[] = [];
  totalSpawned = 0;
  private spawnCredit = 0;
  private nextId = 0;
  private normalsSinceCone = 0;
  private conesSinceBucket = 0;
  private movement = new CrowdMovement();

  constructor() { this.reset('practice', FIXED_DIFFICULTY); }
  setNavigation(navigation: Navigation) { this.movement = new CrowdMovement(navigation); }

  reset(mode: GameMode, difficulty: Difficulty) {
    this.mode = mode; this.difficulty = difficulty;
    this.elapsed = 0; this.failed = false; this.kills = 0; this.spawnCredit = 0; this.nextId = 0; this.totalSpawned = 0;
    this.breachedId = null;
    this.normalsSinceCone = 0; this.conesSinceBucket = 0;
    this.zombies = mode === 'practice' ? PRACTICE_POSITIONS.map(p => this.makeZombie(p)) : [];
  }

  private nextKind(): ZombieKind {
    if (this.mode === 'practice' || this.difficulty === 'easy') return 'normal';
    if (this.difficulty === 'hard' && this.conesSinceBucket === ARMOR_SPAWNS.conesPerBucket) {
      this.conesSinceBucket = 0;
      return 'bucket';
    }
    if (this.normalsSinceCone === ARMOR_SPAWNS.normalPerCone) {
      this.normalsSinceCone = 0;
      this.conesSinceBucket++;
      return 'cone';
    }
    this.normalsSinceCone++;
    return 'normal';
  }

  private makeZombie(position: SpawnPosition): Zombie {
    const kind = this.nextKind();
    const health = ZOMBIE_TYPES[kind].health;
    return { ...position, id: this.nextId++, kind, health, armorHealth: ZOMBIE_TYPES[kind].armor, maxHealth: health, downTime: 0, bornAt: this.elapsed };
  }
  get pressure() { return pressureAt(this.difficulty, this.elapsed); }
  get alive() { return this.zombies.filter(z => z.health > 0).length; }
  get zombieCounts(): Record<ZombieKind, number> {
    const counts = { normal: 0, cone: 0, bucket: 0 };
    for (const zombie of this.zombies) if (zombie.health > 0) counts[zombie.kind]++;
    return counts;
  }
  get nearest(): number | null {
    let nearest = Infinity;
    for (const z of this.zombies) if (z.health > 0) nearest = Math.min(nearest, Math.hypot(z.x - SURVIVAL.playerX, z.z - SURVIVAL.playerZ));
    return Number.isFinite(nearest) ? nearest : null;
  }

  hit(id: number, head: boolean, hitDamage?: number) {
    const zombie = this.zombies.find(z => z.id === id && z.health > 0);
    if (!zombie || this.failed) return null;
    const damage = hitDamage ?? (head ? CONFIG.target.headDamage : CONFIG.target.bodyDamage);
    const armorHit = zombie.armorHealth > 0 ? zombie.kind : null;
    zombie.armorHealth = Math.max(0, zombie.armorHealth - damage);
    zombie.health = Math.max(0, zombie.health - damage);
    const armorBroken = armorHit !== null && zombie.armorHealth === 0;
    if (armorBroken) zombie.kind = 'normal';
    const killed = zombie.health === 0;
    if (killed) { this.kills++; zombie.downTime = this.mode === 'practice' ? CONFIG.target.respawn : 0.85; }
    return { killed, armorHit, armorBroken };
  }

  update(delta: number, spawnPosition: () => SpawnPosition | null) {
    if (this.failed || !Number.isFinite(delta) || delta <= 0) return;
    // 小步推进可防止快移速跨过失败半径，也确保新生僵尸只移动其出生后的时间。
    let remaining = delta;
    while (remaining > 1e-8 && !this.failed) {
      const step = Math.min(remaining, 0.05);
      remaining -= step;
      for (const zombie of this.zombies) if (zombie.health === 0) {
        zombie.downTime = Math.max(0, zombie.downTime - step);
        if (zombie.downTime === 0 && this.mode === 'practice') zombie.health = zombie.maxHealth;
      }
      if (this.mode === 'practice') continue;
      this.zombies = this.zombies.filter(z => z.health > 0 || z.downTime > 0);
      const speed = pressureAt(this.difficulty, this.elapsed + step / 2).speed;
      const movement = this.movement.advance(this.zombies, step, speed);
      const previous = this.elapsed;
      this.elapsed += movement.duration;
      if (movement.failed) {
        this.failed = true;
        this.breachedId = movement.breachedId;
        return;
      }
      this.spawnCredit += spawnIntegral(this.difficulty, previous, this.elapsed);
      while (this.spawnCredit >= 1 - 1e-9) {
        this.spawnCredit = Math.max(0, this.spawnCredit - 1);
        if (this.zombies.length < SURVIVAL.maxZombies) {
          const position = spawnPosition();
          if (!position) continue;
          this.zombies.push(this.makeZombie(position));
          this.totalSpawned++;
        }
      }
    }
  }
}
