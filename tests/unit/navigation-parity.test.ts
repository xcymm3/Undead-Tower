import { expect, it } from 'vitest';
import { Scene } from 'three';
import { Navigation, NAV_RADIUS, type Obstacle } from '../../src/game/navigation';
import { createWorld } from '../../src/game/world';
import { seededRandom } from '../../src/game/geometry';

it('最近导航格的快速路径与原顺序穷举一致，包含出生、障碍附近与格点等距边界', () => {
  const { obstacles } = createWorld(new Scene()), random = seededRandom(1729);
  type Point = { x: number; z: number };
  type Internals = { point(index: number): Point; index(point: Point): number; distance: Float64Array; nearest(point: Point, clear: boolean, radius?: number): number };
  for (const radius of [NAV_RADIUS, NAV_RADIUS * 2.5]) {
    const nav = new Navigation(obstacles, radius), internal = nav as unknown as Internals;
    const brute = (p: Point, requireClear: boolean, search: number) => {
      const center = internal.index(p); if (center < 0) return -1;
      let best = -1, distance = Infinity;
      const cx = center % 297, cz = Math.floor(center / 297);
      for (let z = Math.max(0, cz - search); z <= Math.min(260, cz + search); z++) for (let x = Math.max(0, cx - search); x <= Math.min(296, cx + search); x++) {
        const index = z * 297 + x; if (!Number.isFinite(internal.distance[index])) continue;
        const point = internal.point(index), d = Math.hypot(p.x - point.x, p.z - point.z);
        if (d < distance && (!requireClear || nav.clear(p, point))) { best = index; distance = d; }
      }
      return best;
    };
    const points = Array.from({ length: 2000 }, () => ({ x: random() * 190 - 95, z: random() * 165 - 155 }));
    for (let i = 0; i < 300; i++) {
      const p = internal.point(Math.floor(random() * 297 * 261));
      points.push(p, { x: p.x + .325, z: p.z }, { x: p.x - .325, z: p.z + .325 });
    }
    for (const point of points) for (const [clear, search] of [[true, 3], [false, 12]] as const)
      expect(internal.nearest(point, clear, search)).toBe(brute(point, clear, search));
  }
});

it('导航层次包围盒与逐障碍闭线段检查一致，包含长线、零长线与边缘接触', () => {
  const { obstacles } = createWorld(new Scene()), random = seededRandom(9211);
  const brute = (a: { x: number; z: number }, b: typeof a, boxes: Obstacle[], radius: number) => !boxes.some(o => {
    let near = 0, far = 1;
    for (const [start, delta, min, max] of [[a.x, b.x - a.x, o.minX - radius, o.maxX + radius], [a.z, b.z - a.z, o.minZ - radius, o.maxZ + radius]]) {
      if (Math.abs(delta) < 1e-12) { if (start < min || start > max) return false; }
      else { const t1 = (min - start) / delta, t2 = (max - start) / delta; near = Math.max(near, Math.min(t1, t2)); far = Math.min(far, Math.max(t1, t2)); }
    }
    return near <= far;
  });
  for (const radius of [NAV_RADIUS, NAV_RADIUS * 2.5]) {
    const nav = new Navigation(obstacles, radius);
    for (let i = 0; i < 10000; i++) {
      const a = { x: random() * 180 - 90, z: random() * 160 - 150 };
      const b = i % 3 === 0 ? a : i % 3 === 1 ? { x: a.x + (random() - .5) * .1, z: a.z + (random() - .5) * .1 } : { x: random() * 180 - 90, z: random() * 160 - 150 };
      expect(nav.clear(a, b)).toBe(brute(a, b, obstacles, radius));
    }
    for (const o of obstacles) {
      const a = { x: o.minX - radius, z: o.minZ - radius };
      expect(nav.clear(a, a)).toBe(false);
      expect(nav.clear({ x: a.x, z: a.z - 2 }, a)).toBe(false);
    }
  }
  expect(new Navigation([]).clear({ x: 0, z: 0 }, { x: 0, z: 0 })).toBe(true);
});
