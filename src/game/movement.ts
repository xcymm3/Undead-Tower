import { CROWD, SURVIVAL } from './config';
import type { Position, Zombie } from './encounter';

const player = { x: SURVIVAL.playerX, z: SURVIVAL.playerZ };
interface Leg { start: Position; vx: number; vz: number; duration: number; }
interface Motion { zombie: Zombie; legs: Leg[]; clearWaypointAt: number; avoidance: number; breachAt: number; }

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
  private grid = new Map<string, Zombie[]>();

  private rebuild(zombies: Zombie[]) {
    this.grid.clear();
    for (const zombie of zombies) if (zombie.health > 0) {
      const key = `${Math.floor(zombie.x / CROWD.separationRadius)},${Math.floor(zombie.z / CROWD.separationRadius)}`;
      const cell = this.grid.get(key);
      if (cell) cell.push(zombie); else this.grid.set(key, [zombie]);
    }
  }

  private separation(zombie: Zombie, tx: number, tz: number) {
    const cx = Math.floor(zombie.x / CROWD.separationRadius), cz = Math.floor(zombie.z / CROWD.separationRadius);
    let force = 0;
    for (let ix = cx - 1; ix <= cx + 1; ix++) for (let iz = cz - 1; iz <= cz + 1; iz++) {
      for (const other of this.grid.get(`${ix},${iz}`) ?? []) {
        if (other.id === zombie.id) continue;
        const dx = zombie.x - other.x, dz = zombie.z - other.z;
        const distance = Math.hypot(dx, dz);
        if (distance >= CROWD.separationRadius) continue;
        const lateral = distance > 1e-8 ? (dx * tx + dz * tz) / distance : 0;
        // 完全重叠或首尾排队时也能分开；按 ID 固定选择方向，不用逐帧随机摇摆。
        const side = Math.abs(lateral) < 0.1 ? (zombie.id < other.id ? -1 : 1) : lateral;
        force += side * (1 - distance / CROWD.separationRadius);
      }
    }
    return Math.max(-1, Math.min(1, force));
  }

  private plan(zombie: Zombie, step: number, speed: number): Motion {
    const motion: Motion = { zombie, legs: [], clearWaypointAt: Infinity, avoidance: 0, breachAt: Infinity };
    let position = { x: zombie.x, z: zombie.z }, remaining = step;
    if (zombie.waypoint) {
      const dx = zombie.waypoint.x - position.x, dz = zombie.waypoint.z - position.z;
      const distance = Math.hypot(dx, dz);
      motion.clearWaypointAt = distance / speed;
      const duration = Math.min(remaining, motion.clearWaypointAt);
      if (distance > 0) motion.legs.push({ start: position, vx: dx / distance * speed, vz: dz / distance * speed, duration });
      remaining -= duration;
      position = zombie.waypoint;
    }
    if (remaining > 0) {
      const goal = zombie.breachTarget ?? player;
      const dx = goal.x - position.x, dz = goal.z - position.z;
      const distance = Math.hypot(dx, dz);
      const ux = distance > 0 ? dx / distance : 0, uz = distance > 0 ? dz / distance : 0;
      const force = zombie.waypoint ? 0 : this.separation(zombie, uz, -ux);
      motion.avoidance = (zombie.avoidance ?? 0) + (force - (zombie.avoidance ?? 0)) * (1 - Math.exp(-CROWD.steeringDamping * step));
      const lateral = motion.avoidance * Math.min(CROWD.maxLateralSpeed, speed * CROWD.lateralFraction) * Math.min(1, distance / CROWD.arrivalFade);
      const forward = Math.sqrt(Math.max(0, speed * speed - lateral * lateral));
      motion.legs.push({ start: position, vx: ux * forward + uz * lateral, vz: uz * forward - ux * lateral, duration: Math.min(remaining, distance / speed) });
    }
    let elapsed = 0;
    for (const leg of motion.legs) { motion.breachAt = Math.min(motion.breachAt, elapsed + breachTime(leg)); elapsed += leg.duration; }
    return motion;
  }

  advance(zombies: Zombie[], step: number, speed: number) {
    this.rebuild(zombies);
    const motions = zombies.filter(zombie => zombie.health > 0).map(zombie => this.plan(zombie, step, speed));
    let duration = step, failed = false;
    for (const motion of motions) if (motion.breachAt <= duration) { duration = motion.breachAt; failed = true; }
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
      if (duration + 1e-8 >= motion.clearWaypointAt) zombie.waypoint = undefined;
      zombie.avoidance = motion.avoidance;
    }
    return { duration, failed };
  }
}
