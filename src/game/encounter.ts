import { ARMOR_SPAWNS, CONFIG, ENEMY_RULES, FIXED_DIFFICULTY, PRESSURE, SURVIVAL, ZOMBIE_TYPES, emptyZombieCounts, zombieScale } from './config';
import { enemyDamage, interruptSpecial, triggerRage } from './enemyRules';
import type { Difficulty, GameMode, ZombieKind } from './config';
import { CrowdMovement } from './movement';
import type { Navigation } from './navigation';

export interface Position { x: number; z: number; }
export interface SpawnPosition extends Position { spawnZone?: string; }
export type EnemyEventType = 'skitter-turn' | 'charger-windup' | 'charger-charge' | 'charger-impact' | 'charger-interrupted' | 'howler-windup' | 'howler-command' | 'howler-interrupted' | 'command-ended' | 'berserker-rage';
export interface EnemyEvent { type: EnemyEventType; sourceId: number; targetIds: number[]; x: number; z: number; }
export const ENEMY_EVENT_TYPES: EnemyEventType[] = ['skitter-turn', 'charger-windup', 'charger-charge', 'charger-impact', 'charger-interrupted', 'howler-windup', 'howler-command', 'howler-interrupted', 'command-ended', 'berserker-rage'];
export const emptyEnemyEventCounts = () => Object.fromEntries(ENEMY_EVENT_TYPES.map(type => [type, 0])) as Record<EnemyEventType, number>;
export interface Zombie extends SpawnPosition { id: number; kind: ZombieKind; health: number; maxHealth: number; armorHealth: number; downTime: number; bornAt: number; avoidance?: number; heading?: number; slowRemaining?: number; slowFraction?: number; motionAge?: number; enraged?: boolean; specialState?: 'ready' | 'windup' | 'charging' | 'staggered'; specialRemaining?: number; specialCooldown?: number; commandRemaining?: number; weaveDirection?: number; }
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
  waveQueue: ZombieKind[] | null = null;
  waveTotal = 0;
  waveSpawned = 0;
  waveKills = 0;
  waveSpawnRate = 0;
  private spawnCredit = 0;
  private nextId = 0;
  private normalsSinceCone = 0;
  private conesSinceBucket = 0;
  private movement = new CrowdMovement();
  private navigation?: Navigation;
  private giantNavigation?: Navigation;
  private enemyEvents: EnemyEvent[] = [];

  constructor() { this.reset('practice', FIXED_DIFFICULTY); }
  setNavigation(navigation: Navigation, giant?: Navigation) { this.navigation = navigation; this.giantNavigation = giant; this.movement = new CrowdMovement(navigation, giant); }
  clearStatuses() { for (const z of this.zombies) { z.slowRemaining = 0; z.slowFraction = 0; z.commandRemaining = 0; } }
  drainEnemyEvents() { return this.enemyEvents.splice(0); }
  private emit(type: EnemyEventType, source: Zombie, targetIds: number[] = []) { this.enemyEvents.push({ type, sourceId: source.id, targetIds, x: source.x, z: source.z }); }
  slow(id: number, fraction: number, duration: number) {
    const z = this.zombies.find(zombie => zombie.id === id && zombie.health > 0);
    if (!z || this.failed) return false;
    z.slowFraction = Math.min(.8, Math.max(0, fraction)); z.slowRemaining = Math.max(0, duration); return true;
  }
  knockback(id: number, distance: number) {
    const z = this.zombies.find(zombie => zombie.id === id && zombie.health > 0);
    if (!z || this.failed || !Number.isFinite(distance) || distance <= 0) return 0;
    const nav = z.kind === 'giant' ? this.giantNavigation ?? this.navigation : this.navigation;
    const dx = z.x - SURVIVAL.playerX, dz = z.z - SURVIVAL.playerZ, length = Math.hypot(dx, dz);
    if (!length) return 0;
    let moved = 0;
    for (let remaining = Math.min(distance, 8); remaining > 1e-8;) {
      const step = Math.min(remaining, .1), point = { x: z.x + dx / length * step, z: z.z + dz / length * step };
      if (nav && !nav.clear(z, point)) break;
      if (this.zombies.some(other => other !== z && other.health > 0 && Math.hypot(point.x - other.x, point.z - other.z) < .95 * (zombieScale(z.kind) + zombieScale(other.kind)))) break;
      z.x = point.x; z.z = point.z; moved += step; remaining -= step;
    }
    z.avoidance = 0; return moved;
  }

  startWave(kinds: ZombieKind[], rate: number) {
    this.zombies = []; this.waveQueue = [...kinds]; this.waveTotal = kinds.length;
    this.waveSpawned = 0; this.waveKills = 0; this.waveSpawnRate = Math.min(SURVIVAL.maxSpawnRate, Math.max(0, Number.isFinite(rate) ? rate : 0)); this.spawnCredit = 1; this.enemyEvents = [];
  }
  get waveCleared() { return this.waveQueue !== null && this.waveQueue.length === 0 && this.alive === 0; }

  reset(mode: GameMode, difficulty: Difficulty) {
    this.mode = mode; this.difficulty = difficulty;
    this.elapsed = 0; this.failed = false; this.kills = 0; this.spawnCredit = 0; this.nextId = 0; this.totalSpawned = 0;
    this.breachedId = null; this.waveQueue = null; this.waveTotal = 0; this.waveSpawned = 0; this.waveKills = 0;
    this.normalsSinceCone = 0; this.conesSinceBucket = 0;
    this.enemyEvents = []; this.zombies = mode === 'practice' ? PRACTICE_POSITIONS.map(p => this.makeZombie(p)) : [];
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

  private makeZombie(position: SpawnPosition, kind = this.nextKind()): Zombie {
    const health = ZOMBIE_TYPES[kind].health;
    return { ...position, id: this.nextId++, kind, health, armorHealth: ZOMBIE_TYPES[kind].armor, maxHealth: health, downTime: 0, bornAt: this.elapsed, specialState: kind === 'charger' || kind === 'howler' ? 'ready' : undefined };
  }
  get pressure() { return this.waveQueue ? { speed: PRESSURE.speed, spawnRate: this.waveSpawnRate } : pressureAt(this.difficulty, this.elapsed); }
  get alive() { return this.zombies.filter(z => z.health > 0).length; }
  get zombieCounts(): Record<ZombieKind, number> {
    const counts = emptyZombieCounts();
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
    if (!Number.isFinite(damage) || damage <= 0) return null;
    const applied = enemyDamage(zombie, head, damage);
    const armorHit = applied.armorDamage > 0 ? zombie.kind : null;
    zombie.armorHealth = Math.max(0, zombie.armorHealth - applied.armorDamage);
    zombie.health = Math.max(0, zombie.health - applied.healthDamage);
    const enraged = triggerRage(zombie);
    const interrupted = interruptSpecial(zombie);
    if (interrupted) this.emit(interrupted, zombie);
    if (enraged) this.emit('berserker-rage', zombie);
    const armorBroken = armorHit !== null && zombie.armorHealth === 0;
    if (armorBroken && (zombie.kind === 'cone' || zombie.kind === 'bucket')) zombie.kind = 'normal';
    const killed = zombie.health === 0;
    if (killed) { this.kills++; this.waveKills++; zombie.downTime = this.mode === 'practice' ? CONFIG.target.respawn : 0.85; }
    return { killed, armorHit, armorBroken, enraged };
  }

  private howlerTargets(source: Zombie) {
    return this.zombies.filter(target => target.id !== source.id && target.health > 0 && Math.hypot(target.x - source.x, target.z - source.z) <= ENEMY_RULES.howler.radius && (!this.navigation || this.navigation.clear(source, target)));
  }

  private prepareSpecials() {
    for (const z of this.zombies) {
      if (z.health <= 0 || (z.specialCooldown ?? 0) > 1e-8 || z.specialState !== 'ready') continue;
      if (z.kind === 'charger') {
        const range = distanceToBreach(z), target = this.navigation?.waypoint(z);
        if (range >= ENEMY_RULES.charger.minimumRange && range <= ENEMY_RULES.charger.maximumRange && (!this.navigation || (target && this.navigation.clear(z, target)))) {
          z.specialState = 'windup'; z.specialRemaining = ENEMY_RULES.charger.windup; this.emit('charger-windup', z);
        }
      } else if (z.kind === 'howler' && this.howlerTargets(z).length >= ENEMY_RULES.howler.requiredAllies) {
        z.specialState = 'windup'; z.specialRemaining = ENEMY_RULES.howler.windup; this.emit('howler-windup', z);
      }
    }
  }

  private advanceSpecials(duration: number) {
    for (const z of this.zombies) {
      if ((z.specialCooldown ?? 0) > 0) z.specialCooldown = Math.max(0, z.specialCooldown! - duration);
      if ((z.commandRemaining ?? 0) > 0) {
        z.commandRemaining = Math.max(0, z.commandRemaining! - duration);
        if (z.commandRemaining === 0 && z.health > 0) this.emit('command-ended', z);
      }
      if (z.health <= 0 || z.specialState === 'ready' || !z.specialState) continue;
      z.specialRemaining = Math.max(0, (z.specialRemaining ?? 0) - duration);
      if (z.specialRemaining > 1e-8) continue;
      if (z.kind === 'charger' && z.specialState === 'windup') {
        z.specialState = 'charging'; z.specialRemaining = ENEMY_RULES.charger.chargeDuration; this.emit('charger-charge', z);
      } else if (z.kind === 'charger') {
        z.specialState = 'ready'; z.specialCooldown = Math.max(z.specialCooldown ?? 0, ENEMY_RULES.charger.cooldown);
      } else if (z.kind === 'howler' && z.specialState === 'windup') {
        const targets = this.howlerTargets(z);
        for (const target of targets) target.commandRemaining = Math.max(target.commandRemaining ?? 0, ENEMY_RULES.howler.duration);
        z.specialState = 'ready'; z.specialCooldown = ENEMY_RULES.howler.cooldown; this.emit('howler-command', z, targets.map(target => target.id));
      }
    }
  }

  update(delta: number, spawnPosition: (kind?: ZombieKind) => SpawnPosition | null) {
    if (this.failed || !Number.isFinite(delta) || delta <= 0) return;
    // 小步推进可防止快移速跨过失败半径，也确保新生僵尸只移动其出生后的时间。
    let remaining = delta;
    while (remaining > 1e-8 && !this.failed) {
      this.prepareSpecials();
      let step = Math.min(remaining, 0.05);
      for (const z of this.zombies) if ((z.slowRemaining ?? 0) > 1e-8) step = Math.min(step, z.slowRemaining!);
      for (const z of this.zombies) if ((z.specialRemaining ?? 0) > 1e-8) step = Math.min(step, z.specialRemaining!);
      for (const z of this.zombies) if ((z.commandRemaining ?? 0) > 1e-8) step = Math.min(step, z.commandRemaining!);
      remaining -= step;
      for (const zombie of this.zombies) if (zombie.health === 0) {
        zombie.downTime = Math.max(0, zombie.downTime - step);
        if (zombie.downTime === 0 && this.mode === 'practice') zombie.health = zombie.maxHealth;
      }
      if (this.mode === 'practice') continue;
      this.zombies = this.zombies.filter(z => z.health > 0 || z.downTime > 0);
      const speed = pressureAt(this.difficulty, this.elapsed + step / 2).speed;
      const movement = this.movement.advance(this.zombies, step, speed);
      for (const zombie of this.zombies) zombie.slowRemaining = Math.max(0, (zombie.slowRemaining ?? 0) - movement.duration);
      for (const id of movement.blockedIds) {
        const z = this.zombies.find(candidate => candidate.id === id && candidate.kind === 'charger' && candidate.specialState === 'charging');
        if (z) { z.specialState = 'ready'; z.specialRemaining = 0; z.specialCooldown = ENEMY_RULES.charger.cooldown; this.emit('charger-impact', z); }
      }
      this.advanceSpecials(movement.duration);
      for (const z of this.zombies) if (z.health > 0 && z.kind === 'skitter') {
        const direction = Math.sign(Math.cos((z.motionAge ?? 0) * ENEMY_RULES.skitter.frequency + z.id * 2));
        if (z.weaveDirection !== undefined && direction !== 0 && direction !== z.weaveDirection) this.emit('skitter-turn', z);
        z.weaveDirection = direction;
      }
      const previous = this.elapsed;
      this.elapsed += movement.duration;
      if (movement.failed) {
        this.failed = true;
        this.breachedId = movement.breachedId;
        return;
      }
      if (this.waveQueue !== null) {
        this.spawnCredit += movement.duration * this.waveSpawnRate;
        if (this.spawnCredit >= 1 - 1e-9 && this.waveQueue.length && this.zombies.length < SURVIVAL.maxZombies) {
          const position = spawnPosition(this.waveQueue[0]);
          if (position) { this.zombies.push(this.makeZombie(position, this.waveQueue.shift()!)); this.totalSpawned++; this.waveSpawned++; this.spawnCredit -= 1; }
        }
        // 保留成功投放后的分数余量，满槽或无合法入口时最多保留一次待投放。
        this.spawnCredit = Math.min(1, Math.max(0, this.spawnCredit));
        continue;
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
