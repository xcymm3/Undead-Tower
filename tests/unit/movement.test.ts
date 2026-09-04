import { describe, expect, it } from 'vitest';
import { Matrix4, PerspectiveCamera, Vector3 } from 'three';
import { CROWD } from '../../src/game/config';
import { Encounter, distanceToBreach } from '../../src/game/encounter';
import type { Position, Zombie } from '../../src/game/encounter';
import { seededRandom } from '../../src/game/geometry';
import { CrowdMovement } from '../../src/game/movement';
import { SpawnDirector } from '../../src/game/spawn';
import { ZombieField } from '../../src/game/zombies';

const zombie = (id: number, x: number, z: number): Zombie => ({ id, x, z, kind: 'normal', health: 100, armorHealth: 0, maxHealth: 100, downTime: 0, bornAt: 0 });
const radius = (p: Position) => Math.hypot(p.x, p.z - 9);

describe('直线追击与拥挤避让', () => {
  it('记录首个实际越线者，同步越线时稳定选择最小 ID，重开清空', () => {
    for (const reversed of [false, true]) {
      const crowd = [zombie(9, 0, 0), zombie(2, 0, 0), zombie(1, 0, -10)];
      const result = new CrowdMovement().advance(reversed ? crowd.reverse() : crowd, 1, 2);
      expect(result.failed).toBe(true);
      expect(result.breachedId).toBe(2);
    }
    const encounter = new Encounter(); encounter.reset('survival', 'hard');
    encounter.zombies = [zombie(42, 0, 0.99)];
    encounter.update(1, () => ({ x: 0, z: -100 }));
    expect(encounter.breachedId).toBe(42);
    encounter.reset('survival', 'hard');
    expect(encounter.breachedId).toBeNull();
  });
  it('不同方向的孤立僵尸全程沿最短直线朝玩家前进，在最近防线交点停止', () => {
    for (const start of [{ x: -12, z: -20 }, { x: 0, z: -40 }, { x: 15, z: -18 }]) {
      const z = zombie(0, start.x, start.z), movement = new CrowdMovement();
      const initialDistance = radius(start), ux = -start.x / initialDistance, uz = (9 - start.z) / initialDistance;
      expect(distanceToBreach(z)).toBeCloseTo(initialDistance - 8, 10);
      let duration = 0, failed = false;
      for (let i = 0; i < 2000 && !failed; i++) {
        const result = movement.advance([z], 1 / 60, 1.5);
        duration += result.duration; failed = result.failed;
        expect((z.x - start.x) * uz - (z.z - start.z) * ux).toBeCloseTo(0, 9);
        expect(z.heading).toBeCloseTo(Math.atan2(ux, uz), 9);
        expect(z.avoidance).toBe(0);
      }
      expect(failed).toBe(true);
      expect(duration).toBeCloseTo((initialDistance - 8) / 1.5, 8);
      expect(z.x).toBeCloseTo(start.x * 8 / initialDistance, 8);
      expect(z.z).toBeCloseTo(9 + (start.z - 9) * 8 / initialDistance, 8);
    }
  });

  it('出生区域保留随机位置，不再携带随机突破点或中途路径点', () => {
    const camera = new PerspectiveCamera(61, 1.6, 0.025, 220);
    camera.position.set(0, 4.8, 9); camera.rotation.x = -0.105; camera.updateMatrixWorld();
    const director = new SpawnDirector(seededRandom(42));
    const spawns = Array.from({ length: 64 }, () => director.next(camera));
    expect(new Set(spawns.map(p => p.spawnZone)).size).toBe(8);
    expect(new Set(spawns.filter(p => p.spawnZone === 'north-road').map(p => p.x)).size).toBe(8);
    for (const spawn of spawns) {
      expect(spawn).not.toHaveProperty('waypoint');
      expect(spawn).not.toHaveProperty('breachTarget');
    }
  });

  it('密集队列缓慢分开，每步总速度及横向速度受限，始终向目标推进', () => {
    const crowd = [zombie(0, 0, -6), zombie(1, 0, -6)];
    const movement = new CrowdMovement();
    for (let i = 0; i < 120; i++) {
      const before = crowd.map(z => ({ x: z.x, z: z.z }));
      movement.advance(crowd, 1 / 60, 1.5);
      crowd.forEach((z, index) => {
        const p = before[index], dx = z.x - p.x, dz = z.z - p.z;
        const gx = -p.x, gz = 9 - p.z, length = Math.hypot(gx, gz);
        expect(Math.hypot(dx, dz)).toBeCloseTo(1.5 / 60, 10);
        expect(Math.abs(dx * gz / length - dz * gx / length)).toBeLessThanOrEqual(CROWD.maxLateralSpeed / 60 + 1e-9);
        expect(dx * gx + dz * gz).toBeGreaterThan(0);
        expect(Math.abs(z.avoidance!)).toBeLessThanOrEqual(1);
      });
    }
    expect(Math.abs(crowd[0].x - crowd[1].x)).toBeGreaterThan(0.35);
  });

  it('仅活僵尸产生避让，孤立僵尸不摇摆，更新顺序不决定推挤方向', () => {
    const first = [zombie(0, -0.1, -7), zombie(1, 0.1, -7), zombie(2, 0, -7.3)];
    const second = structuredClone(first).reverse();
    const a = new CrowdMovement(), b = new CrowdMovement();
    for (let i = 0; i < 30; i++) { a.advance(first, 1 / 60, 1.5); b.advance(second, 1 / 60, 1.5); }
    first.forEach(z => {
      const other = second.find(other => other.id === z.id)!;
      expect(z.x).toBeCloseTo(other.x, 10); expect(z.z).toBeCloseTo(other.z, 10);
    });
    const isolated = zombie(0, 0, -7), corpse = { ...zombie(1, 0, -7), health: 0 };
    a.advance([isolated, corpse], 1, 1.5);
    expect(isolated.x).toBe(0); expect(isolated.avoidance).toBe(0);
    expect(corpse.z).toBe(-7);
  });

  it('离开拥挤范围后立刻恢复直线，不保留横向漂移', () => {
    const a = zombie(0, -0.1, -10), b = zombie(1, 0.1, -10), movement = new CrowdMovement();
    movement.advance([a, b], 0.5, 1.5);
    expect(Math.abs(a.avoidance!)).toBeGreaterThan(0);
    const before = { x: a.x, z: a.z };
    b.health = 0;
    movement.advance([a, b], 0.1, 1.5);
    expect(a.avoidance).toBe(0);
    expect((a.x - before.x) * (9 - before.z) + (a.z - before.z) * before.x).toBeCloseTo(0, 10);
  });

  it('实例模型正面始终对齐实际移动方向，拥挤时也不横着滑行', () => {
    const encounter = new Encounter(); encounter.reset('survival', 'hard');
    encounter.zombies = [zombie(0, -5, -15), zombie(1, -5.1, -15)];
    const field = new ZombieField(), matrix = new Matrix4();
    const before = { ...encounter.zombies[0] };
    new CrowdMovement().advance(encounter.zombies, 0.1, 1.5);
    field.sync(encounter);
    field.getMatrixAt(0, matrix);
    const forward = new Vector3(0, 0, 1).transformDirection(matrix);
    const current = encounter.zombies[0];
    const displacement = new Vector3(current.x - before.x, 0, current.z - before.z).normalize();
    expect(forward.dot(displacement)).toBeCloseTo(1, 7);
    field.dispose();
  });

  it('高速时在第一次越线处冻结全队，朝向与实际位移一致', () => {
    const a = zombie(0, 0, -5), b = zombie(1, 5, -20);
    const result = new CrowdMovement().advance([a, b], 1, 100);
    expect(result.failed).toBe(true);
    expect(result.duration).toBeCloseTo(0.06, 8);
    expect(radius(a)).toBeCloseTo(8, 8);
    expect(Math.hypot(b.x - 5, b.z + 20)).toBeCloseTo(6, 8);
    expect(b.heading).toBeCloseTo(Math.atan2(b.x - 5, b.z + 20), 10);
  });

  it('常见帧率下密集僵尸均可到达防线，不在终点附近绕圈或僵持', () => {
    const results = [20, 60, 144].map(fps => {
      const encounter = new Encounter(); encounter.reset('survival', 'easy');
      encounter.zombies = [zombie(99, 0, -5), zombie(100, 0, -5)];
      for (let i = 0; i < 15 * fps && !encounter.failed; i++) encounter.update(1 / fps, () => ({ x: 1000, z: -1000 }));
      expect(encounter.failed).toBe(true);
      expect(encounter.nearest).toBeCloseTo(8, 8);
      return encounter.elapsed;
    });
    expect(Math.max(...results) - Math.min(...results)).toBeLessThan(0.025);
  });
});
