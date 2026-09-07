import { SURVIVAL } from './config';
import type { Position, SpawnPosition } from './encounter';

export interface Obstacle { id: string; minX: number; maxX: number; minZ: number; maxZ: number; }
// 包含伸出的手臂；只把实体的地面占地计入导航，树冠、草和高架横杆不封路。
export const NAV_RADIUS = 0.95;
const CELL = 0.65, MIN_X = -96, MIN_Z = -158, WIDTH = 297, HEIGHT = 261;
const goal = { x: SURVIVAL.playerX, z: SURVIVAL.playerZ };
interface ObstacleNode { minX: number; maxX: number; minZ: number; maxZ: number; children?: ObstacleNode[]; }
function obstacleTree(items: ObstacleNode[]): ObstacleNode {
  const node: ObstacleNode = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (const item of items) {
    node.minX = Math.min(node.minX, item.minX); node.maxX = Math.max(node.maxX, item.maxX);
    node.minZ = Math.min(node.minZ, item.minZ); node.maxZ = Math.max(node.maxZ, item.maxZ);
  }
  if (items.length <= 4) node.children = items;
  else {
    const axis = node.maxX - node.minX >= node.maxZ - node.minZ;
    items.sort((a, b) => axis ? a.minX + a.maxX - b.minX - b.maxX : a.minZ + a.maxZ - b.minZ - b.maxZ);
    const half = Math.floor(items.length / 2);
    node.children = [obstacleTree(items.slice(0, half)), obstacleTree(items.slice(half))];
  }
  return node;
}
// Exact closed segment/slab test, including touching edges and zero-length segments.
function crosses(node: ObstacleNode, x: number, z: number, dx: number, dz: number): boolean {
  let near = 0, far = 1;
  if (Math.abs(dx) < 1e-12) { if (x < node.minX || x > node.maxX) return false; }
  else { const a = (node.minX - x) / dx, b = (node.maxX - x) / dx; near = Math.max(near, Math.min(a, b)); far = Math.min(far, Math.max(a, b)); }
  if (Math.abs(dz) < 1e-12) { if (z < node.minZ || z > node.maxZ) return false; }
  else { const a = (node.minZ - z) / dz, b = (node.maxZ - z) / dz; near = Math.max(near, Math.min(a, b)); far = Math.min(far, Math.max(a, b)); }
  if (near > far) return false;
  if (!node.children) return true;
  for (const child of node.children) if (crosses(child, x, z, dx, dz)) return true;
  return false;
}

/** 静态障碍只建一次反向最短路场，全体僵尸共享；运行时做视线捷径与连续碰撞。 */
export class Navigation {
  private obstaclesRoot: ObstacleNode;
  private blocked = new Uint8Array(WIDTH * HEIGHT);
  private distance = new Float64Array(WIDTH * HEIGHT).fill(Infinity);
  private next = new Int32Array(WIDTH * HEIGHT).fill(-1);
  constructor(readonly obstacles: readonly Obstacle[], readonly radius: number = NAV_RADIUS) {
    this.obstaclesRoot = obstacleTree(obstacles.map(o => ({ minX: o.minX - radius, maxX: o.maxX + radius, minZ: o.minZ - radius, maxZ: o.maxZ + radius })));
    this.build();
  }
  private point(index: number): Position { return { x: MIN_X + index % WIDTH * CELL, z: MIN_Z + Math.floor(index / WIDTH) * CELL }; }
  private index(p: Position) {
    const x = Math.round((p.x - MIN_X) / CELL), z = Math.round((p.z - MIN_Z) / CELL);
    return x < 0 || z < 0 || x >= WIDTH || z >= HEIGHT ? -1 : z * WIDTH + x;
  }
  clear(a: Position, b: Position) {
    return !crosses(this.obstaclesRoot, a.x, a.z, b.x - a.x, b.z - a.z);
  }
  private build() {
    for (let i = 0; i < this.blocked.length; i++) this.blocked[i] = this.clear(this.point(i), this.point(i)) ? 0 : 1;
    const heap: { index: number; cost: number }[] = [];
    const push = (entry: typeof heap[number]) => {
      heap.push(entry); let i = heap.length - 1;
      while (i > 0) { const parent = (i - 1) >> 1; if (heap[parent].cost <= entry.cost) break; heap[i] = heap[parent]; i = parent; } heap[i] = entry;
    };
    const root = this.index(goal);
    if (root < 0 || this.blocked[root]) return;
    this.distance[root] = 0; push({ index: root, cost: 0 });
    while (heap.length) {
      const entry = heap[0], last = heap.pop()!;
      if (heap.length) {
        let i = 0;
        while (i * 2 + 1 < heap.length) {
          let child = i * 2 + 1; if (child + 1 < heap.length && heap[child + 1].cost < heap[child].cost) child++;
          if (heap[child].cost >= last.cost) break; heap[i] = heap[child]; i = child;
        } heap[i] = last;
      }
      if (entry.cost !== this.distance[entry.index]) continue;
      const x = entry.index % WIDTH, z = Math.floor(entry.index / WIDTH), a = this.point(entry.index);
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if ((!dx && !dz) || x + dx < 0 || x + dx >= WIDTH || z + dz < 0 || z + dz >= HEIGHT) continue;
        const index = (z + dz) * WIDTH + x + dx, cost = entry.cost + Math.hypot(dx, dz) * CELL;
        if (this.blocked[index] || cost >= this.distance[index] || !this.clear(a, this.point(index))) continue;
        this.distance[index] = cost; this.next[index] = entry.index; push({ index, cost });
      }
    }
  }
  private nearest(p: Position, requireClear: boolean, radius = 3) {
    const center = this.index(p); if (center < 0) return -1;
    const rounded = this.point(center);
    // Inside the open Voronoi cell this reachable grid point is uniquely nearest.
    // Keep the original ordered search at half-cell ties and beside obstacles.
    if (Math.abs(p.x - rounded.x) < CELL / 2 - 1e-9 && Math.abs(p.z - rounded.z) < CELL / 2 - 1e-9
      && Number.isFinite(this.distance[center]) && (!requireClear || this.clear(p, rounded))) return center;
    let best = -1, distance = Infinity;
    const cx = center % WIDTH, cz = Math.floor(center / WIDTH);
    for (let z = Math.max(0, cz - radius); z <= Math.min(HEIGHT - 1, cz + radius); z++) for (let x = Math.max(0, cx - radius); x <= Math.min(WIDTH - 1, cx + radius); x++) {
      const index = z * WIDTH + x; if (!Number.isFinite(this.distance[index])) continue;
      const point = this.point(index);
      if (Math.abs(p.x - point.x) >= distance || Math.abs(p.z - point.z) >= distance) continue;
      const d = Math.hypot(p.x - point.x, p.z - point.z);
      if (d < distance && (!requireClear || this.clear(p, point))) { best = index; distance = d; }
    }
    return best;
  }
  spawn(position: SpawnPosition): SpawnPosition | null {
    const index = this.nearest(position, false, 12); if (index < 0) return null;
    const point = this.clear(position, position) && this.clear(position, this.point(index)) ? position : this.point(index);
    if (Math.hypot(point.x - goal.x, point.z - goal.z) < SURVIVAL.breachRadius + 4) return null;
    return { ...position, ...point };
  }
  waypoint(position: Position): Position | null {
    if (this.clear(position, goal)) return goal;
    let index = this.nearest(position, true); if (index < 0) return null;
    let target = this.point(index);
    for (let i = 0; i < 18 && this.next[index] >= 0; i++) {
      index = this.next[index]; const next = this.point(index);
      if (!this.clear(position, next)) break;
      target = next;
    }
    return target;
  }
}
