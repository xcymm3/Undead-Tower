import { PerspectiveCamera, Plane, Raycaster, Vector2, Vector3 } from 'three';
import { CONFIG, CROWD, SURVIVAL } from './config';
import type { Position, SpawnPosition } from './encounter';

interface SpawnZone { id: string; label: string; center?: Position; spread?: Position; waypoint?: Position; side?: -1 | 1; }

// 路线分别经过路障外侧、检查站前方及巡逻车两侧，再向哨塔接近。
export const SPAWN_ZONES: readonly SpawnZone[] = [
  { id: 'north-road', label: '远端公路', center: { x: 1.4, z: -58 }, spread: { x: 0.25, z: 3 }, waypoint: { x: 1.2, z: -6 } },
  { id: 'west-road', label: '公路左侧', center: { x: -5.9, z: -47 }, spread: { x: 0.3, z: 2 }, waypoint: { x: -6.3, z: -7 } },
  { id: 'east-road', label: '公路右侧', center: { x: 7.25, z: -34 }, spread: { x: 0.15, z: 1.5 }, waypoint: { x: 7.3, z: -13 } },
  { id: 'checkpoint-passage', label: '检查站通道', center: { x: -7.2, z: -34 }, spread: { x: 0.3, z: 1.5 }, waypoint: { x: -6.4, z: -7 } },
  { id: 'checkpoint-yard', label: '检查站前空地', center: { x: -11, z: -19.5 }, spread: { x: 0.5, z: 0.7 }, waypoint: { x: -6.4, z: -7 } },
  { id: 'fence-path', label: '围栏通路', center: { x: 13.6, z: -28 }, spread: { x: 0.2, z: 2 }, waypoint: { x: 13.6, z: -11 } },
  { id: 'west-woods', label: '左侧林地', side: -1 },
  { id: 'east-woods', label: '右侧林地', side: 1 },
];

export function spawnAtScreenEdge(camera: PerspectiveCamera, random: () => number = Math.random, side?: -1 | 1) {
  const depth = 22 + random() * 8;
  const center = new Vector3(0, 1, SURVIVAL.playerZ - depth).project(camera);
  const ray = new Raycaster();
  ray.setFromCamera(new Vector2((side ?? (random() < 0.5 ? -1 : 1)) * 1.025, center.y), camera);
  const point = ray.ray.intersectPlane(new Plane(new Vector3(0, 1, 0), -1), new Vector3())!;
  return { x: point.x, z: point.z, waypoint: { x: Math.sign(point.x) * Math.min(4.5, Math.abs(point.x) * 0.25), z: -6 } };
}

/** 在固定朝向的前方圆弧选定终点；为镜头的小幅转动和僵尸身体留出边缘余量。 */
export function sampleBreachTarget(camera: PerspectiveCamera, random: () => number = Math.random): Position {
  const viewAngle = Math.atan(Math.tan(camera.fov * Math.PI / 360) * camera.aspect * CROWD.viewMargin);
  const halfAngle = Math.max(0, Math.min(CROWD.arcHalfAngle, viewAngle - CONFIG.camera.yawLimit));
  const angle = (random() * 2 - 1) * halfAngle;
  return { x: SURVIVAL.playerX + Math.sin(angle) * SURVIVAL.breachRadius, z: SURVIVAL.playerZ - Math.cos(angle) * SURVIVAL.breachRadius };
}

/** 每轮洗牌后轮流使用各区域，防止纯随机连续遗漏正面刷新点。 */
export class SpawnDirector {
  private remaining: SpawnZone[] = [];
  private projection = new Vector3();

  constructor(private random: () => number = Math.random, private targetRandom: () => number = random) {}

  reset() { this.remaining = []; }

  private withBreach(position: SpawnPosition, camera: PerspectiveCamera): SpawnPosition {
    return { ...position, breachTarget: sampleBreachTarget(camera, this.targetRandom) };
  }

  private inView(position: Position, camera: PerspectiveCamera) {
    this.projection.set(position.x, 1, position.z).project(camera);
    return Math.abs(this.projection.x) < 0.92 && Math.abs(this.projection.y) < 0.9 && this.projection.z < 1;
  }

  next(camera: PerspectiveCamera): SpawnPosition {
    for (let attempt = 0; attempt < SPAWN_ZONES.length; attempt++) {
      if (!this.remaining.length) {
        this.remaining = [...SPAWN_ZONES];
        for (let i = this.remaining.length - 1; i > 0; i--) {
          const j = Math.floor(this.random() * (i + 1));
          [this.remaining[i], this.remaining[j]] = [this.remaining[j], this.remaining[i]];
        }
      }
      const zone = this.remaining.pop()!;
      if (zone.side) return this.withBreach({ ...spawnAtScreenEdge(camera, this.random, zone.side), spawnZone: zone.id }, camera);
      const position = {
        x: zone.center!.x + (this.random() * 2 - 1) * zone.spread!.x,
        z: zone.center!.z + (this.random() * 2 - 1) * zone.spread!.z,
      };
      // 窄窗口跳过视野外的固定区域，保留可看见的正面入口和适配屏幕的林地入口。
      if (this.inView(position, camera) && this.inView(zone.waypoint!, camera)) {
        return this.withBreach({ ...position, waypoint: { ...zone.waypoint! }, spawnZone: zone.id }, camera);
      }
    }
    const road = SPAWN_ZONES[0];
    return this.withBreach({ ...road.center!, waypoint: { ...road.waypoint! }, spawnZone: road.id }, camera);
  }
}
