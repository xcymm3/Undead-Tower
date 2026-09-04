import { SURVIVAL, zombieScale } from './config';
import type { Position, Zombie } from './encounter';
import type { Navigation } from './navigation';

/** 落点保持水平半径，不能用导航投影修正后偷偷改变与玩家的距离。 */
export function teleportPoint(zombie: Zombie, others: Zombie[], navigation: Navigation, visible: (p: Position) => boolean, random: () => number): Position | null {
  const radius = Math.hypot(zombie.x - SURVIVAL.playerX, zombie.z - SURVIVAL.playerZ);
  const angle = Math.atan2(zombie.x - SURVIVAL.playerX, SURVIVAL.playerZ - zombie.z);
  for (let attempt = 0; attempt < 24; attempt++) {
    const nextAngle = (random() * 2 - 1) * 35 * Math.PI / 180;
    if (Math.abs(nextAngle - angle) < 8 * Math.PI / 180) continue;
    const point = { x: SURVIVAL.playerX + Math.sin(nextAngle) * radius, z: SURVIVAL.playerZ - Math.cos(nextAngle) * radius };
    if (!visible(point) || !navigation.clear(point, point) || !navigation.waypoint(point)) continue;
    if (others.some(other => other.id !== zombie.id && other.health > 0 && Math.hypot(other.x - point.x, other.z - point.z) < .95 * (1 + zombieScale(other.kind)))) continue;
    return point;
  }
  return null;
}
