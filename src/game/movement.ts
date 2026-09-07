import { CROWD, ENEMY_RULES, SURVIVAL, zombieSpeed, zombieScale } from './config';
import type { Position, Zombie } from './encounter';
import type { Navigation } from './navigation';

const player = { x: SURVIVAL.playerX, z: SURVIVAL.playerZ };
interface Leg { start: Position; vx: number; vz: number; duration: number; }
interface Motion { zombie: Zombie; legs: Leg[]; avoidance: number; breachAt: number; blocked: boolean; }

/** 连续检测每条实际移动线段首次进入失败圆的时间，而非依赖剩余路径估算。 */
function breachTime(leg: Leg) {
  const x = leg.start.x - player.x, z = leg.start.z - player.z;
  const c = x * x + z * z - SURVIVAL.breachRadius ** 2;
  if (c <= 1e-8) return 0;
  const speed = Math.hypot(leg.vx, leg.vz);
  if (speed === 0 || Math.hypot(x, z) - SURVIVAL.breachRadius > speed * leg.duration + 1e-8) return Infinity;
  const b = x * leg.vx + z * leg.vz;
  const discriminant = b * b - speed * speed * c;
  if (b >= 0 || discriminant < -1e-8) return Infinity;
  const time = c / (-b + Math.sqrt(Math.max(0, discriminant)));
  return time <= leg.duration + 1e-8 ? Math.max(0, Math.min(leg.duration, time)) : Infinity;
}

/** 先从同一帧位置计算所有方向，再统一移动，避免更新顺序造成单向推挤。 */
export class CrowdMovement {
  private grid = new Map<number, Map<number, Zombie[]>>();
  constructor(private navigation?: Navigation, private giantNavigation?: Navigation) {}

  private rebuild(zombies: Zombie[]) {
    this.grid.clear();
    for (const zombie of zombies) if (zombie.health > 0) {
      const x = Math.floor(zombie.x / CROWD.separationRadius), z = Math.floor(zombie.z / CROWD.separationRadius);
      let column = this.grid.get(x);
      if (!column) { column = new Map(); this.grid.set(x, column); }
      const cell = column.get(z);
      if (cell) cell.push(zombie); else column.set(z, [zombie]);
    }
  }

  private separation(zombie: Zombie, tx: number, tz: number) {
    const cx = Math.floor(zombie.x / CROWD.separationRadius), cz = Math.floor(zombie.z / CROWD.separationRadius);
    let force = 0;
    for (let ix = cx - 3; ix <= cx + 3; ix++) {
      const column = this.grid.get(ix);
      if (!column) continue;
      for (let iz = cz - 3; iz <= cz + 3; iz++) {
      for (const other of column.get(iz) ?? []) {
        if (other.id === zombie.id) continue;
        const dx = zombie.x - other.x, dz = zombie.z - other.z;
        const distance = Math.hypot(dx, dz);
        const separation = CROWD.separationRadius * (zombieScale(zombie.kind) + zombieScale(other.kind)) / 2;
        if (distance >= separation) continue;
        const lateral = distance > 1e-8 ? (dx * tx + dz * tz) / distance : 0;
        // 完全重叠或首尾排队时也能分开；按 ID 固定选择方向，不用逐帧随机摇摆。
        const side = Math.abs(lateral) < 0.1 ? (zombie.id < other.id ? -1 : 1) : lateral;
        force += side * (1 - distance / separation);
      }
      }
    }
    return Math.max(-1, Math.min(1, force));
  }

  private plan(zombie: Zombie, step: number, speed: number): Motion {
    const navigation = zombie.kind === 'giant' ? this.giantNavigation ?? this.navigation : this.navigation;
    speed *= zombieSpeed(zombie.kind);
    if (zombie.kind === 'berserker' && zombie.enraged) speed *= ENEMY_RULES.berserker.speedMultiplier;
    if ((zombie.commandRemaining ?? 0) > 0) speed *= ENEMY_RULES.howler.speedMultiplier;
    if (zombie.kind === 'charger' && zombie.specialState === 'charging') speed *= ENEMY_RULES.charger.speedMultiplier;
    if (zombie.specialState === 'windup' || zombie.specialState === 'staggered') speed = 0;
    if ((zombie.slowRemaining ?? 0) > 0) speed *= 1 - (zombie.slowFraction ?? 0);
    const motion: Motion = { zombie, legs: [], avoidance: 0, breachAt: Infinity, blocked: false };
    const position = { x: zombie.x, z: zombie.z };
    if (step > 0) {
      const target = navigation ? navigation.waypoint(position) : player;
      if (!target) return motion;
      const dx = target.x - position.x, dz = target.z - position.z;
      const distance = Math.hypot(dx, dz);
      const ux = distance > 0 ? dx / distance : 0, uz = distance > 0 ? dz / distance : 0;
      const force = this.separation(zombie, uz, -ux);
      // 没有拥挤就立刻回到最短路线，不能因旧避让状态继续横向漂移。
      motion.avoidance = force === 0 ? 0 : (zombie.avoidance ?? 0) + (force - (zombie.avoidance ?? 0)) * (1 - Math.exp(-CROWD.steeringDamping * step));
      const remaining = Math.hypot(position.x - player.x, position.z - player.z) - SURVIVAL.breachRadius;
      const weave = zombie.kind === 'skitter' ? Math.sin(((zombie.motionAge ?? 0) + step / 2) * ENEMY_RULES.skitter.frequency + zombie.id * 2) * ENEMY_RULES.skitter.lateralSpeed : 0;
      const sideSpeed = motion.avoidance * Math.min(CROWD.maxLateralSpeed, speed * CROWD.lateralFraction) + weave;
      const lateral = Math.max(-speed * .8, Math.min(speed * .8, sideSpeed)) * Math.max(0, Math.min(1, remaining / CROWD.arrivalFade));
      const forward = Math.sqrt(Math.max(0, speed * speed - lateral * lateral));
      const leg = { start: position, vx: ux * forward + uz * lateral, vz: uz * forward - ux * lateral, duration: speed > 0 ? Math.min(step, distance / speed) : step };
      if (navigation && !navigation.clear(position, { x: position.x + leg.vx * leg.duration, z: position.z + leg.vz * leg.duration })) {
        // 静态碰撞优先于拥挤避让：取消横向力，沿已验证可通行的寻路线段前进。
        motion.avoidance = 0; leg.vx = ux * speed; leg.vz = uz * speed;
        if (!navigation.clear(position, { x: position.x + leg.vx * leg.duration, z: position.z + leg.vz * leg.duration })) { motion.blocked = true; return motion; }
      }
      motion.legs.push(leg);
    }
    let elapsed = 0;
    for (const leg of motion.legs) { motion.breachAt = Math.min(motion.breachAt, elapsed + breachTime(leg)); elapsed += leg.duration; }
    return motion;
  }

  advance(zombies: Zombie[], step: number, speed: number) {
    this.rebuild(zombies);
    const motions = zombies.filter(zombie => zombie.health > 0).map(zombie => this.plan(zombie, step, speed));
    let duration = step, failed = false, breachedId: number | null = null;
    for (const motion of motions) if (motion.breachAt < duration || (motion.breachAt === duration && (breachedId === null || motion.zombie.id < breachedId))) {
      duration = motion.breachAt; failed = true; breachedId = motion.zombie.id;
    }
    for (const motion of motions) {
      const zombie = motion.zombie;
      let remaining = duration;
      for (const leg of motion.legs) {
        const time = Math.min(remaining, leg.duration);
        if (time > 0) {
          zombie.x = leg.start.x + leg.vx * time; zombie.z = leg.start.z + leg.vz * time;
          zombie.heading = Math.atan2(leg.vx, leg.vz);
        }
        remaining -= time;
        if (remaining <= 0) break;
      }
      zombie.avoidance = motion.avoidance;
      zombie.motionAge = (zombie.motionAge ?? 0) + duration;
    }
    return { duration, failed, breachedId, blockedIds: motions.filter(motion => motion.blocked).map(motion => motion.zombie.id) };
  }
}
