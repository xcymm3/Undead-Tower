import { ARMOR_SPAWNS, CONFIG, PRESSURE, SURVIVAL, ZOMBIE_TYPES } from './config';
import type { Difficulty, GameMode, ZombieKind } from './config';

export interface Position { x: number; z: number; }
export interface SpawnPosition extends Position { waypoint?: Position; spawnZone?: string; }
export interface Zombie extends SpawnPosition { id: number; kind: ZombieKind; health: number; maxHealth: number; downTime: number; bornAt: number; }
export const PRACTICE_POSITIONS: Position[] = [{ x: -5.8, z: -9.5 }, { x: 0.15, z: -17 }, { x: 5.4, z: -21 }, { x: -1, z: -31 }];

export function pressureAt(_difficulty: Difficulty, elapsed: number) {
  const profile = PRESSURE;
  const time = Math.max(0, elapsed);
  return { spawnRate: Math.min(SURVIVAL.maxSpawnRate, profile.spawnRate + profile.spawnGrowth * time), speed: profile.speed + profile.speedGrowth * time };
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

export function distanceToBreach(zombie: SpawnPosition) {
  const goal = zombie.waypoint;
  const distance = goal
    ? Math.hypot(zombie.x - goal.x, zombie.z - goal.z) + Math.hypot(goal.x - SURVIVAL.playerX, goal.z - SURVIVAL.playerZ)
    : Math.hypot(zombie.x - SURVIVAL.playerX, zombie.z - SURVIVAL.playerZ);
  return Math.max(0, distance - SURVIVAL.breachRadius);
}

export class Encounter {
  mode: GameMode = 'practice';
  difficulty: Difficulty = 'normal';
  elapsed = 0;
  failed = false;
  kills = 0;
  zombies: Zombie[] = [];
  totalSpawned = 0;
  private spawnCredit = 0;
  private nextId = 0;
  private normalsSinceCone = 0;
  private conesSinceBucket = 0;

  constructor() { this.reset('practice', 'normal'); }

  reset(mode: GameMode, difficulty: Difficulty) {
    this.mode = mode; this.difficulty = difficulty;
    this.elapsed = 0; this.failed = false; this.kills = 0; this.spawnCredit = 0; this.nextId = 0; this.totalSpawned = 0;
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
    return { ...position, id: this.nextId++, kind, health, maxHealth: health, downTime: 0, bornAt: this.elapsed };
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

  hit(id: number, head: boolean) {
    const zombie = this.zombies.find(z => z.id === id && z.health > 0);
    if (!zombie || this.failed) return null;
    zombie.health = Math.max(0, zombie.health - (head ? CONFIG.target.headDamage : CONFIG.target.bodyDamage));
    const killed = zombie.health === 0;
    if (killed) { this.kills++; zombie.downTime = this.mode === 'practice' ? CONFIG.target.respawn : 0.85; }
    return { killed };
  }

  update(delta: number, spawnPosition: () => SpawnPosition) {
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
      let allowedStep = step;
      for (const zombie of this.zombies) if (zombie.health > 0) {
        allowedStep = Math.min(allowedStep, distanceToBreach(zombie) / speed);
      }
      for (const zombie of this.zombies) if (zombie.health > 0) {
        let budget = speed * allowedStep;
        // 先收拢到哨塔前方，避免透视投影让侧边出生的僵尸一直贴着屏幕边缘。
        if (zombie.waypoint) {
          const dx = zombie.waypoint.x - zombie.x, dz = zombie.waypoint.z - zombie.z;
          const distance = Math.hypot(dx, dz);
          const movement = Math.min(distance, budget);
          if (distance > 0) { zombie.x += dx / distance * movement; zombie.z += dz / distance * movement; }
          budget -= movement;
          if (distance <= movement + 1e-8) zombie.waypoint = undefined;
        }
        const dx = SURVIVAL.playerX - zombie.x, dz = SURVIVAL.playerZ - zombie.z;
        const distance = Math.hypot(dx, dz);
        const movement = Math.min(distance, budget);
        if (distance > 0) { zombie.x += dx / distance * movement; zombie.z += dz / distance * movement; }
      }
      const previous = this.elapsed;
      this.elapsed += allowedStep;
      if (allowedStep < step - 1e-8 || (this.nearest !== null && this.nearest <= SURVIVAL.breachRadius + 1e-8)) {
        this.failed = true;
        return;
      }
      this.spawnCredit += spawnIntegral(this.difficulty, previous, this.elapsed);
      while (this.spawnCredit >= 1 - 1e-9) {
        this.spawnCredit = Math.max(0, this.spawnCredit - 1);
        if (this.zombies.length < SURVIVAL.maxZombies) {
          this.zombies.push(this.makeZombie(spawnPosition()));
          this.totalSpawned++;
        }
      }
    }
  }
}
