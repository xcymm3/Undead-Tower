import { describe, expect, it } from 'vitest';
import { DIFFICULTIES, SURVIVAL } from '../../src/game/config';
import type { Difficulty } from '../../src/game/config';
import { Encounter, pressureAt, spawnIntegral } from '../../src/game/encounter';
import { PerspectiveCamera, Vector3 } from 'three';
import { SPAWN_ZONES, SpawnDirector, spawnAtScreenEdge } from '../../src/game/spawn';
import { seededRandom } from '../../src/game/geometry';

const farSpawn = () => ({ x: 80, z: -100 });
describe('练习与正式模式', () => {
  it('练习僵尸保持静止，不刷新、不失败、不累计正式时长', () => {
    const encounter = new Encounter();
    const positions = encounter.zombies.map(z => [z.x, z.z]);
    encounter.update(120, farSpawn);
    expect(encounter.zombies.map(z => [z.x, z.z])).toEqual(positions);
    expect(encounter.failed).toBe(false);
    expect(encounter.elapsed).toBe(0);
    expect(encounter.totalSpawned).toBe(0);
    encounter.hit(1, true);
    expect(encounter.zombies[1].health).toBe(0);
    encounter.update(3.1, farSpawn);
    expect(encounter.zombies[1].health).toBe(100);
  });

  it('三档难度共享刷新曲线和固定移速', () => {
    for (const time of [0, 30, 60, 120, 1000]) {
      expect(pressureAt('easy', time)).toEqual(pressureAt('normal', time));
      expect(pressureAt('normal', time)).toEqual(pressureAt('hard', time));
    }
    expect(pressureAt('easy', 0)).toEqual({ spawnRate: 0.65, speed: 1.4 });
    expect(pressureAt('hard', 60)).toEqual({ spawnRate: 2.75, speed: 1.4 });
  });

  for (const difficulty of Object.keys(DIFFICULTIES) as Difficulty[]) {
    it(`${difficulty} 刷新逐渐增多并封顶每秒 10 只，移速始终为 1.4 米每秒`, () => {
      expect(pressureAt(difficulty, 60).spawnRate).toBeGreaterThan(pressureAt(difficulty, 0).spawnRate);
      expect(pressureAt(difficulty, 1000).spawnRate).toBe(10);
      for (const time of [0, 60, 180, 1000, 2000]) expect(pressureAt(difficulty, time).speed).toBe(1.4);
      for (const start of [0, 50, 100, 150, 260, 480, 1000]) expect(spawnIntegral(difficulty, start, start + 1)).toBeLessThanOrEqual(10 + 1e-9);
      const encounter = new Encounter();
      encounter.reset('survival', difficulty);
      encounter.elapsed = 1000;
      for (let i = 0; i < 60; i++) encounter.update(1 / 60, farSpawn);
      expect(encounter.totalSpawned).toBe(10);
      encounter.update(1, farSpawn);
      expect(encounter.totalSpawned).toBe(20);
    });
  }

  it('帧率变化不改变刷新总数', () => {
    const counts = [20, 60, 144].map(fps => {
      const encounter = new Encounter(); encounter.reset('survival', 'normal');
      for (let frame = 0; frame < fps * 30; frame++) encounter.update(1 / fps, farSpawn);
      return encounter.totalSpawned;
    });
    expect(new Set(counts).size).toBe(1);
    expect(counts[0]).toBe(Math.floor(spawnIntegral('normal', 0, 30)));
  });

  it('僵尸向玩家靠近，进入半径时立即冻结时长，不能跨过防线', () => {
    const encounter = new Encounter(); encounter.reset('survival', 'hard');
    encounter.zombies.push({ id: 99, x: 0, z: 0, kind: 'normal', health: 100, armorHealth: 0, maxHealth: 100, downTime: 0, bornAt: 0 });
    encounter.update(0.2, farSpawn);
    expect(encounter.zombies[0].z).toBeGreaterThan(0);
    encounter.update(5, farSpawn);
    expect(encounter.failed).toBe(true);
    expect(encounter.nearest).toBeCloseTo(SURVIVAL.breachRadius, 8);
    const end = encounter.elapsed;
    expect(end).toBeLessThan(1);
    encounter.update(20, farSpawn);
    expect(encounter.elapsed).toBe(end);
    expect(encounter.hit(99, true)).toBeNull();
  });

  it('击杀的僵尸不会造成失败，尸体被回收，重开清空全部状态', () => {
    const encounter = new Encounter(); encounter.reset('survival', 'hard');
    encounter.zombies.push({ id: 99, x: 0, z: 0, kind: 'normal', health: 100, armorHealth: 0, maxHealth: 100, downTime: 0, bornAt: 0 });
    expect(encounter.hit(99, false)?.killed).toBe(false);
    expect(encounter.hit(99, false)?.killed).toBe(true);
    expect(encounter.hit(99, true)).toBeNull();
    encounter.update(0.9, farSpawn);
    expect(encounter.zombies.some(z => z.id === 99)).toBe(false);
    expect(encounter.failed).toBe(false);
    expect(encounter.kills).toBe(1);
    encounter.reset('survival', 'easy');
    expect(encounter.zombies).toHaveLength(0);
    expect(encounter.elapsed).toBe(0);
    expect(encounter.kills).toBe(0);
    expect(encounter.totalSpawned).toBe(0);
  });

  it('侧边僵尸沿直线逼近并在最近防线处准确触发失败', () => {
    const encounter = new Encounter(); encounter.reset('survival', 'hard');
    encounter.zombies.push({ id: 99, x: 10, z: -12, kind: 'normal', health: 100, armorHealth: 0, maxHealth: 100, downTime: 0, bornAt: 0 });
    encounter.update(1, farSpawn);
    expect(encounter.zombies[0].x).toBeLessThan(10);
    expect(encounter.zombies[0].z).toBeGreaterThan(-12);
    encounter.update(8, farSpawn);
    expect(encounter.zombies[0].x).toBeLessThan(6);
    expect(encounter.failed).toBe(false);
    encounter.update(20, farSpawn);
    expect(encounter.failed).toBe(true);
    expect(encounter.nearest).toBeCloseTo(SURVIVAL.breachRadius, 8);
  });

  it('存活与倒地实例数量始终有内存边界', () => {
    const encounter = new Encounter(); encounter.reset('survival', 'hard'); encounter.elapsed = 1000;
    encounter.update(40, () => ({ x: 10000, z: -10000 }));
    expect(encounter.zombies.length).toBe(SURVIVAL.maxZombies);
  });
});

// 防止实例化后的命中测试退化为只有旧靶子能命中。
import { ZombieField } from '../../src/game/zombies';
import { Raycaster } from 'three';
describe('僵尸批量模型', () => {
  it('桌面防区每轮覆盖八个入口，正面刷新不再被随机遗漏', () => {
    const camera = new PerspectiveCamera(61, 1440 / 900, 0.025, 220);
    camera.position.set(0, 4.8, 9);
    for (const yaw of [-0.069, 0, 0.069]) for (const seed of [5, 31, 420]) {
      camera.rotation.set(-0.105, yaw, 0, 'YXZ'); camera.updateMatrixWorld();
      const director = new SpawnDirector(seededRandom(seed));
      for (let round = 0; round < 3; round++) {
        const spawns = Array.from({ length: 8 }, () => director.next(camera));
        expect(new Set(spawns.map(s => s.spawnZone))).toEqual(new Set(SPAWN_ZONES.map(z => z.id)));
        expect(spawns.filter(s => Math.abs(s.x) < 8)).toHaveLength(4);
        expect(spawns.every(s => s.z < 0 && Math.hypot(s.x, s.z - 9) > 24)).toBe(true);
      }
    }
  });

  it('窄视野跳过不可见固定入口，保留可射击的正面与两侧路径', () => {
    for (const yaw of [-0.069, 0, 0.069]) {
      const camera = new PerspectiveCamera(61, 320 / 844, 0.025, 220);
      camera.position.set(0, 4.8, 9); camera.rotation.set(-0.105, yaw, 0, 'YXZ'); camera.updateMatrixWorld();
      const director = new SpawnDirector(seededRandom(44));
      const spawns = Array.from({ length: 24 }, () => director.next(camera));
      const zones = new Set(spawns.map(s => s.spawnZone));
      for (const required of ['north-road', 'west-woods', 'east-woods']) expect(zones.has(required)).toBe(true);
      for (const spawn of spawns) {
        expect(Math.abs(new Vector3(spawn.x, 1, spawn.z).project(camera).x)).toBeLessThanOrEqual(0.92);
        expect(spawn).not.toHaveProperty('waypoint');
      }
    }
  });

  it('不同窗口宽度和镜头角度下，两侧出生位置内收并保留瞄准余量', () => {
    for (const aspect of [320 / 844, 1440 / 900, 1920 / 900]) for (const yaw of [-0.069, 0, 0.069]) for (const side of [0.2, 0.8]) {
      const camera = new PerspectiveCamera(61, aspect, 0.025, 220);
      camera.position.set(0, 4.8, 9); camera.rotation.set(-0.105, yaw, 0, 'YXZ'); camera.updateMatrixWorld();
      const position = spawnAtScreenEdge(camera, () => side);
      const screen = new Vector3(position.x, 1, position.z).project(camera);
      expect(Math.abs(screen.x)).toBeCloseTo(0.55, 8);
      expect(position.z).toBeLessThan(0);
      expect(Math.hypot(position.x, position.z - 9)).toBeGreaterThan(SURVIVAL.breachRadius);
    }
  });
  it('一份实例模型渲染多只僵尸，并正确区分头部、身体和空白', () => {
    const field = new ZombieField();
    const encounter = new Encounter(); field.sync(encounter);
    const zombie = encounter.zombies[1];
    const ray = new Raycaster(new Vector3(zombie.x, 1.83, 10), new Vector3(0, 0, -1));
    expect(field.decode(ray.intersectObject(field)[0])).toEqual({ id: 1, head: true });
    ray.ray.origin.y = 1.15;
    expect(field.decode(ray.intersectObject(field)[0])).toEqual({ id: 1, head: false });
    ray.ray.origin.x = 40;
    expect(ray.intersectObject(field)).toHaveLength(0);
    encounter.hit(1, true); field.sync(encounter);
    ray.ray.origin.set(zombie.x, 1.83, 10);
    expect(field.decode(ray.intersectObject(field)[0])).toBeNull();
    field.dispose();
  });

  it('头部投影仍在原来的练习靶瞄准区域', () => {
    const camera = new PerspectiveCamera(61, 1440 / 900, 0.025, 220);
    camera.position.set(0, 4.8, 9); camera.rotation.x = -0.105; camera.updateMatrixWorld();
    const head = new Vector3(0.15, 1.83, -16.76).project(camera);
    expect(Math.abs(head.x)).toBeLessThan(0.1);
    expect(Math.abs(head.y)).toBeLessThan(0.1);
  });
});
