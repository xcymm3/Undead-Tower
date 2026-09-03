import { describe, expect, it } from 'vitest';
import { Raycaster, Vector3 } from 'three';
import { ZOMBIE_TYPES } from '../../src/game/config';
import type { Difficulty, ZombieKind } from '../../src/game/config';
import { Encounter } from '../../src/game/encounter';
import { ZombieField } from '../../src/game/zombies';

const farSpawn = () => ({ x: 0, z: -10000 });
const ordinaryBlock: ZombieKind[] = ['normal', 'normal', 'normal', 'normal', 'cone'];

describe('护甲僵尸规则', () => {
  for (const difficulty of ['easy', 'normal', 'hard'] as Difficulty[]) {
    it(`${difficulty} 的 30 秒门槛和固定出怪比例`, () => {
      const encounter = new Encounter(); encounter.reset('survival', difficulty);
      encounter.update(70, farSpawn);
      expect(encounter.zombies.filter(z => z.bornAt < 30).every(z => z.kind === 'normal')).toBe(true);
      const cycle = difficulty === 'easy' ? ['normal'] : difficulty === 'normal' ? ordinaryBlock : [...ordinaryBlock, ...ordinaryBlock, ...ordinaryBlock, ...ordinaryBlock, 'bucket'];
      const later = encounter.zombies.filter(z => z.bornAt >= 30);
      expect(later.length).toBeGreaterThan(60);
      later.forEach((z, index) => {
        expect(z.kind).toBe(cycle[index % cycle.length]);
        expect(z.maxHealth).toBe(ZOMBIE_TYPES[z.kind].health);
      });
      encounter.reset('survival', difficulty);
      encounter.elapsed = 30;
      encounter.update(3, farSpawn);
      expect(encounter.zombies.map(z => z.kind)).toEqual(cycle.slice(0, 5).length === 1 ? Array(5).fill('normal') : cycle.slice(0, 5));
    });
  }

  for (const kind of ['normal', 'cone', 'bucket'] as ZombieKind[]) {
    it(`${kind} 的头部、护具和身体射线命中使用实际生命值`, () => {
      const encounter = new Encounter();
      const field = new ZombieField();
      try {
        for (const [height, damage] of [[1.83, 100], [1.18, 50], ...(kind === 'normal' ? [] : [[kind === 'cone' ? 2.54 : 2.21, 100]])]) {
          const health = ZOMBIE_TYPES[kind].health;
          encounter.zombies = [{ id: 0, kind, health, maxHealth: health, x: 0, z: 0, bornAt: 0, downTime: 0 }];
          field.sync(encounter);
          for (let shot = 1; shot <= health / damage; shot++) {
            const ray = new Raycaster(new Vector3(0, height, 10), new Vector3(0, 0, -1));
            const hit = field.decode(ray.intersectObject(field)[0]);
            expect(hit).toEqual({ id: 0, head: damage === 100 });
            const result = encounter.hit(hit!.id, hit!.head);
            expect(result!.killed).toBe(shot === health / damage);
            expect(encounter.zombies[0].health).toBe(health - shot * damage);
          }
        }
      } finally { field.dispose(); (field.material as { dispose(): void }).dispose(); }
    });
  }

  it('普通僵尸没有不可见的护具碰撞，练习始终只生成普通僵尸', () => {
    const encounter = new Encounter(); encounter.reset('practice', 'hard');
    encounter.update(120, farSpawn);
    expect(encounter.zombies.every(z => z.kind === 'normal' && z.maxHealth === 100)).toBe(true);
    const field = new ZombieField(); field.sync(encounter);
    const zombie = encounter.zombies[0];
    const ray = new Raycaster(new Vector3(zombie.x, 2.5, 10), new Vector3(0, 0, -1));
    expect(ray.intersectObject(field)).toHaveLength(0);
    field.dispose(); (field.material as { dispose(): void }).dispose();
  });
});
