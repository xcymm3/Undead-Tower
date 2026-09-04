import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { CONFIG, CROWD } from '../../src/game/config';
import { Encounter, distanceToBreach } from '../../src/game/encounter';
import type { Position, Zombie } from '../../src/game/encounter';
import { seededRandom } from '../../src/game/geometry';
import { CrowdMovement } from '../../src/game/movement';
import { sampleBreachTarget, SpawnDirector } from '../../src/game/spawn';

const zombie = (id: number, x: number, z: number, breachTarget: Position = { x: 0, z: 1 }): Zombie => ({ id, x, z, breachTarget, kind: 'normal', health: 100, maxHealth: 100, downTime: 0, bornAt: 0 });
const radius = (p: Position) => Math.hypot(p.x, p.z - 9);

describe('随机圆弧突破与轻微避让', () => {
  it('突破点位于 8 米圆弧，窄屏和镜头极限角度下头部仍可见', () => {
    for (const aspect of [320 / 844, 1440 / 900, 1920 / 900]) {
      const camera = new PerspectiveCamera(CONFIG.camera.fov, aspect, 0.025, 220);
      camera.position.set(0, 4.8, 9);
      for (const random of [0, 0.25, 0.5, 0.75, 1]) {
        const target = sampleBreachTarget(camera, () => random);
        expect(radius(target)).toBeCloseTo(8, 10);
        expect(target.z).toBeLessThan(9);
        for (const yaw of [-CONFIG.camera.yawLimit, CONFIG.camera.yawLimit]) for (const pitch of [-CONFIG.camera.pitchLimit, CONFIG.camera.pitchLimit]) {
          camera.rotation.set(-0.105 + pitch, yaw, 0, 'YXZ'); camera.updateMatrixWorld();
          const head = new Vector3(target.x, 1.83, target.z).project(camera);
          expect(Math.abs(head.x)).toBeLessThan(0.94);
          expect(Math.abs(head.y)).toBeLessThan(0.94);
        }
      }
    }
  });

  it('同一出生区也得到不同终点，分配终点不改变原出生区域和安全通路', () => {
    const camera = new PerspectiveCamera(61, 1.6, 0.025, 220);
    camera.position.set(0, 4.8, 9); camera.rotation.x = -0.105; camera.updateMatrixWorld();
    const a = new SpawnDirector(seededRandom(42), seededRandom(3));
    const b = new SpawnDirector(seededRandom(42), seededRandom(4));
    const targets: number[] = [];
    for (let i = 0; i < 64; i++) {
      const first = a.next(camera), second = b.next(camera);
      expect({ ...first, breachTarget: undefined }).toEqual({ ...second, breachTarget: undefined });
      if (first.spawnZone === 'north-road') targets.push(first.breachTarget!.x);
    }
    expect(new Set(targets).size).toBe(8);
    expect(Math.max(...targets) - Math.min(...targets)).toBeGreaterThan(3);
  });

  it('同一出发位置的僵尸分别到达不同突破点，剩余路径以各自目标计算', () => {
    const points = [-0.5, 0, 0.5].map(angle => ({ x: 8 * Math.sin(angle), z: 9 - 8 * Math.cos(angle) }));
    for (const target of points) {
      const z = zombie(0, 0, -6, target);
      expect(distanceToBreach(z)).toBeCloseTo(Math.hypot(target.x, target.z + 6), 8);
      const movement = new CrowdMovement();
      let failed = false;
      for (let i = 0; i < 500 && !failed; i++) failed = movement.advance([z], 1 / 30, 1.5).failed;
      expect(failed).toBe(true);
      expect(z.x).toBeCloseTo(target.x, 7);
      expect(z.z).toBeCloseTo(target.z, 7);
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
        const gx = -p.x, gz = 1 - p.z, length = Math.hypot(gx, gz);
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

  it('通过路径点前保持原安全路线，不被邻居推入建筑通道外', () => {
    const crowd = [zombie(0, -6, -20), zombie(1, -6, -20)];
    crowd.forEach(z => { z.waypoint = { x: -6, z: -7 }; });
    const movement = new CrowdMovement();
    for (let i = 0; i < 120; i++) movement.advance(crowd, 1 / 60, 1.5);
    expect(crowd.map(z => z.x)).toEqual([-6, -6]);
    expect(crowd.every(z => z.waypoint && !z.avoidance)).toBe(true);
  });

  it('经过路径点和切入圆弧能在同一帧完成，高速时仍在第一次越线处冻结全队', () => {
    const a = zombie(0, 0, -5); a.waypoint = { x: 0, z: -1 };
    const b = zombie(1, 5, -20);
    const movement = new CrowdMovement();
    const result = movement.advance([a, b], 1, 100);
    expect(result.failed).toBe(true);
    expect(result.duration).toBeCloseTo(0.06, 8);
    expect(radius(a)).toBeCloseTo(8, 8);
    expect(a.waypoint).toBeUndefined();
    expect(Math.hypot(b.x - 5, b.z + 20)).toBeCloseTo(6, 8);
  });

  it('实际转向线段穿过防线就失败，即使随机目标还在另一侧', () => {
    const z = zombie(0, 7, 0, { x: -4, z: 9 - Math.sqrt(48) });
    const motion = new CrowdMovement().advance([z], 10, 30);
    expect(motion.failed).toBe(true);
    expect(radius(z)).toBeCloseTo(8, 8);
    expect(z.x).toBeGreaterThan(z.breachTarget!.x + 1);
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
