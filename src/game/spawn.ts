import { PerspectiveCamera, Plane, Raycaster, Vector2, Vector3 } from 'three';
import { SURVIVAL } from './config';
import type { Position, SpawnPosition } from './encounter';

interface SpawnZone { id: string; label: string; center?: Position; spread?: Position; side?: -1 | 1; }

// 八个出生区域轮换；这里只选入口，实际移动由障碍导航决定，不指定随机终点。
export const SPAWN_ZONES: readonly SpawnZone[] = [
  { id: 'north-road', label: '远端公路', center: { x: 1.4, z: -58 }, spread: { x: 0.25, z: 3 } },
  { id: 'west-road', label: '公路左侧', center: { x: -5.9, z: -47 }, spread: { x: 0.3, z: 2 } },
  { id: 'east-road', label: '公路右侧', center: { x: 7.25, z: -34 }, spread: { x: 0.15, z: 1.5 } },
  { id: 'checkpoint-passage', label: '检查站通道', center: { x: -7.2, z: -34 }, spread: { x: 0.3, z: 1.5 } },
  { id: 'checkpoint-yard', label: '检查站前空地', center: { x: -11, z: -19.5 }, spread: { x: 0.5, z: 0.7 } },
  { id: 'fence-path', label: '围栏通路', center: { x: 13.6, z: -28 }, spread: { x: 0.2, z: 2 } },
  { id: 'west-woods', label: '左侧林地', side: -1 },
  { id: 'east-woods', label: '右侧林地', side: 1 },
];

export function spawnAtScreenEdge(camera: PerspectiveCamera, random: () => number = Math.random, side?: -1 | 1) {
  const depth = 22 + random() * 8;
  const center = new Vector3(0, 1, SURVIVAL.playerZ - depth).project(camera);
  const ray = new Raycaster();
  // 固定视角下保留绕树和镜头阻尼的余量，避免边缘出生后整条路径离屏。
  ray.setFromCamera(new Vector2((side ?? (random() < 0.5 ? -1 : 1)) * 0.55, center.y), camera);
  const point = ray.ray.intersectPlane(new Plane(new Vector3(0, 1, 0), -1), new Vector3())!;
  return { x: point.x, z: point.z };
}

/** 每轮洗牌后轮流使用各区域，防止纯随机连续遗漏正面刷新点。 */
export class SpawnDirector {
  private remaining: SpawnZone[] = [];
  private projection = new Vector3();

  constructor(private random: () => number = Math.random) {}

  reset() { this.remaining = []; }

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
      if (zone.side) return { ...spawnAtScreenEdge(camera, this.random, zone.side), spawnZone: zone.id };
      const position = {
        x: zone.center!.x + (this.random() * 2 - 1) * zone.spread!.x,
        z: zone.center!.z + (this.random() * 2 - 1) * zone.spread!.z,
      };
      // 窄窗口跳过视野外的固定区域，保留可看见的正面入口和适配屏幕的林地入口。
      if (this.inView(position, camera)) {
        return { ...position, spawnZone: zone.id };
      }
    }
    const road = SPAWN_ZONES[0];
    return { ...road.center!, spawnZone: road.id };
  }
}
