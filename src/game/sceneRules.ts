import { PerspectiveCamera, Vector3 } from 'three';
import { SURVIVAL, zombieScale, type ZombieKind } from './config';
import type { Encounter, Position } from './encounter';
import type { Navigation } from './navigation';
import type { SpawnDirector } from './spawn';

export type Occluded = (origin: Vector3, target: Vector3) => boolean;
/** Reject entrances whose navigation route wraps outside the fixed firing cone. */
export function fairApproach(point: Position, navigation: Navigation, camera?: PerspectiveCamera, scale = 1) {
  let p = { ...point };
  for (let i = 0; i < 1024; i++) {
    const depth = SURVIVAL.playerZ - p.z;
    if (depth <= 0 || Math.abs(p.x - SURVIVAL.playerX) > depth * .65) return false;
    if (!navigation.clear(p, p) || (camera && !visiblePoint(camera, p, scale))) return false;
    if (Math.hypot(p.x - SURVIVAL.playerX, depth) <= SURVIVAL.breachRadius + 1e-6) return true;
    // 普通体积的直达线仍可用凸锥体快捷判断；巨人完整审查绝不跳过采样。
    if (scale === 1 && !camera && navigation.clear(p, { x: SURVIVAL.playerX, z: SURVIVAL.playerZ })) return true;
    const next = navigation.waypoint(p);
    if (!next) return false;
    const distance = Math.hypot(next.x - p.x, next.z - p.z);
    if (distance < 1e-6) return false;
    const step = Math.min(.5, distance);
    const target = { x: p.x + (next.x - p.x) / distance * step, z: p.z + (next.z - p.z) / distance * step };
    if (!navigation.clear(p, target)) return false;
    p = target;
  }
  return false;
}
export function visiblePoint(camera: PerspectiveCamera, point: Position, scale = 1, blocked?: Occluded) {
  for (const height of [1.25, 1.83]) {
    const target = new Vector3(point.x, height * scale, point.z), projected = target.clone().project(camera);
    if (Math.abs(projected.x) > .88 || Math.abs(projected.y) > .85 || projected.z >= 1 || projected.z <= -1) return false;
    if (blocked?.(camera.position, target)) return false;
  }
  return true;
}
export function spawnEnemy(kind: ZombieKind, encounter: Encounter, camera: PerspectiveCamera, spawns: SpawnDirector, navigation: Navigation, giantNavigation: Navigation) {
  const nav = kind === 'giant' ? giantNavigation : navigation;
  for (let attempt = 0; attempt < 24; attempt++) {
    const candidate = spawns.next(camera);
    if (kind === 'giant' && (candidate.spawnZone === 'west-woods' || candidate.spawnZone === 'east-woods')) continue;
    // 巨人只能接受原始入口；不能将障碍内的点挪到最近导航格掩盖出生错误。
    const point = kind === 'giant' ? candidate : nav.spawn(candidate);
    if (!point || !visiblePoint(camera, point, zombieScale(kind))) continue;
    if (kind === 'football' && Math.hypot(point.x, point.z - SURVIVAL.playerZ) < 30.4) continue;
    if (encounter.zombies.some(z => z.health > 0 && Math.hypot(point.x - z.x, point.z - z.z) < .95 * (zombieScale(kind) + zombieScale(z.kind)))) continue;
    if (!fairApproach(point, nav, kind === 'giant' ? camera : undefined, zombieScale(kind))) continue;
    return point;
  }
  return null;
}
