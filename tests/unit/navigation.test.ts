import { describe, expect, it, vi } from 'vitest';
import { Navigation, NAV_RADIUS } from '../../src/game/navigation';
import { CrowdMovement } from '../../src/game/movement';
import { Encounter, type Zombie } from '../../src/game/encounter';
import { ZombieField } from '../../src/game/zombies';
import { BreachSequence } from '../../src/game/breach';
import { Matrix4, PerspectiveCamera, Raycaster, Scene, Vector3 } from 'three';
import { createWorld } from '../../src/game/world';
import { SpawnDirector } from '../../src/game/spawn';
import { seededRandom } from '../../src/game/geometry';

const obstacles = [
  { id: 'barrier', minX: -2, maxX: 2, minZ: -16, maxZ: -12 },
  { id: 'building', minX: -13, maxX: -7, minZ: -32, maxZ: -23 },
  { id: 'fence', minX: 8, maxX: 8.1, minZ: -35, maxZ: -8 },
];
const navigation = new Navigation(obstacles);
const zombie = (id: number, x: number, z: number): Zombie => ({ id, x, z, kind: 'normal', health: 100, armorHealth: 0, maxHealth: 100, downTime: 0, bornAt: 0 });

describe('静态障碍寻路与连续碰撞', () => {
  it('身体半径参与判定，长线段也不能穿过薄围栏', () => {
    expect(navigation.clear({ x: -10, z: -10 }, { x: 15, z: -10 })).toBe(false);
    expect(navigation.clear({ x: 2 + NAV_RADIUS - 0.01, z: -14 }, { x: 2 + NAV_RADIUS - 0.01, z: -14 })).toBe(false);
    expect(navigation.clear({ x: 0, z: -10 }, { x: 0, z: 9 })).toBe(true);
  });
  it('出生在实体内会选附近可达位置，完全封闭区域不接受原点', () => {
    const spawn = navigation.spawn({ x: -10, z: -27, spawnZone: 'yard' });
    expect(spawn).not.toBeNull(); expect(spawn!.spawnZone).toBe('yard');
    expect(navigation.clear(spawn!, spawn!)).toBe(true);
    expect(navigation.spawn({ x: 0, z: 9 })).toBeNull();
  });
  it('遇到路障、建筑、围栏绕行，整个身体和拥挤避让均不穿模且最终可达', () => {
    for (const start of [{ x: 0, z: -25 }, { x: -10, z: -38 }, { x: 12, z: -30 }]) {
      const crowd = [zombie(0, start.x, start.z), zombie(1, start.x, start.z)];
      const movement = new CrowdMovement(navigation);
      let failed = false, deviated = false;
      for (let i = 0; i < 2500 && !failed; i++) {
        const before = crowd.map(z => ({ ...z }));
        const result = movement.advance(crowd, 0.05, 2); failed = result.failed;
        for (let j = 0; j < crowd.length; j++) {
          const z = crowd[j];
          expect(navigation.clear(before[j], z)).toBe(true);
          if (Math.hypot(z.x - before[j].x, z.z - before[j].z) > 1e-8) expect(z.heading).toBeCloseTo(Math.atan2(z.x - before[j].x, z.z - before[j].z), 8);
          if (Math.abs(z.x - start.x) > 2) deviated = true;
        }
      }
      expect(failed).toBe(true); expect(deviated).toBe(true);
      expect(Math.min(...crowd.map(z => Math.hypot(z.x, z.z - 9)))).toBeCloseTo(8, 7);
    }
  });
  it('无障碍时仍走玩家方向的直线，高速绕障不跨越实体', () => {
    const z = zombie(0, 0, -7), movement = new CrowdMovement(navigation);
    movement.advance([z], 0.1, 2); expect(z.x).toBe(0); expect(z.z).toBeCloseTo(-6.8);
    const fast = zombie(1, 0, -25), before = { ...fast };
    movement.advance([fast], 1, 100); expect(navigation.clear(before, fast)).toBe(true);
  });
});

it('实际场景障碍占地与八区域出生共用导航，所有入口均可无碰撞抵达', () => {
  vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => ({ fillRect() {}, strokeRect() {}, fillText() {} }) }) });
  try {
    const scene = new Scene(), world = createWorld(scene), nav = new Navigation(world.obstacles);
    scene.updateMatrixWorld(true);
    expect(world.obstacles.length).toBeGreaterThan(180);
    for (const id of ['station', 'pickup', 'fence', 'barrier-near', 'gate-west', 'tree-0', 'rock-0']) expect(world.obstacles.some(o => o.id === id)).toBe(true);
    const camera = new PerspectiveCamera(61, 1.6, 0.025, 220); camera.position.set(0, 4.8, 9); camera.rotation.x = -0.105; camera.updateMatrixWorld();
    const director = new SpawnDirector(seededRandom(42));
    const actor = new ZombieField(), encounter = new Encounter(); encounter.mode = 'survival';
    const verifyCinematic = (z: Zombie, label: string) => {
      const shotCamera = camera.clone(), sequence = new BreachSequence();
      sequence.begin(shotCamera, z, world.surfaces); sequence.update(shotCamera, 2);
      encounter.zombies = [z]; encounter.failed = true; encounter.breachedId = z.id;
      for (const progress of [0.4, 0.6, 0.8, 1]) {
        actor.sync(encounter, progress);
        for (const part of [0, 3]) {
          const matrix = new Matrix4(); actor.getMatrixAt(part, matrix);
          const direction = new Vector3().setFromMatrixPosition(matrix).sub(shotCamera.position);
          const ray = new Raycaster(shotCamera.position, direction.clone().normalize(), 0.025, direction.length());
          expect(ray.intersectObjects(world.surfaces, false), `${label} 的扑击头部/身体不能被哨塔挡住`).toHaveLength(0);
        }
      }
    };
    for (let i = 0; i < 16; i++) {
      const spawn = nav.spawn(director.next(camera)); expect(spawn).not.toBeNull();
      const z = zombie(i, spawn!.x, spawn!.z), movement = new CrowdMovement(nav);
      let failed = false;
      for (let j = 0; j < 1600 && !failed; j++) {
        const before = { ...z }; failed = movement.advance([z], 0.05, 4).failed;
        expect(nav.clear(before, z)).toBe(true);
      }
      expect(failed, `入口 ${spawn!.spawnZone} 应能到达`).toBe(true);
      verifyCinematic(z, `入口 ${spawn!.spawnZone}`);
    }
    for (let angle = -75; angle <= 75; angle += 5) {
      const radians = angle * Math.PI / 180;
      verifyCinematic(zombie(100 + angle, Math.sin(radians) * 8, 9 - Math.cos(radians) * 8), `方向 ${angle}°`);
    }
  } finally { vi.unstubAllGlobals(); }
}, 20000);

it('失败镜头在两秒结束、零时间不推进，镜头聚焦但不改变敌人状态', () => {
  const camera = new PerspectiveCamera(61, 1.6, 0.025, 220); camera.position.set(0, 4.8, 9);
  const z = zombie(7, 4, 9 - Math.sqrt(48)), before = { ...z }, sequence = new BreachSequence();
  sequence.begin(camera, z); expect(sequence.update(camera, 0.7)).toBe(false);
  expect(camera.position.z).toBeLessThan(9); expect(camera.fov).toBeLessThan(61);
  sequence.update(camera, 0); expect(sequence.elapsed).toBe(0.7);
  expect(sequence.update(camera, 1.29)).toBe(false); expect(sequence.update(camera, 0.01)).toBe(true);
  expect(sequence.elapsed).toBe(2); expect(z).toEqual(before);
  sequence.reset(); expect(sequence.progress).toBe(0); expect(sequence.light.intensity).toBe(0);
});
