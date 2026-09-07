import { describe, expect, it } from 'vitest';
import { BoxGeometry, InstancedMesh, Matrix4, MeshBasicMaterial, Raycaster, Scene, Vector3 } from 'three';
import { fairApproach } from '../../src/game/sceneRules';
import { createWorld } from '../../src/game/world';
import { Navigation, NAV_RADIUS } from '../../src/game/navigation';
import { ENEMY_EVENT_TYPES, Encounter } from '../../src/game/encounter';
import { ZOMBIE_KINDS, ZOMBIE_TYPES, zombieScale } from '../../src/game/config';
import { ZombieField } from '../../src/game/zombies';
import { seededRandom } from '../../src/game/geometry';
import { RogueAgent, chooseAgentUpgrade, strategyFor, type AgentObservation } from '../../scripts/rogue-agent';
import { balanceFailures, summarize, wilson } from '../../scripts/rogue-statistics';
import { StaticCollision } from '../../scripts/static-collision';
import { simulateRogueRun, type RogueRun } from '../../scripts/rogue-model';

const observation = (time: number, overrides: Partial<AgentObservation> = {}): AgentObservation => ({ time, targets: [{ id: 5, eta: 5, distance: 10 }], ammo: 12, reloading: false, blocked: false,
  automatic: false, canFire: true, skillActive: false, skillCooldown: 0, infiniteAmmo: false, ...overrides });

describe('固定六枪平衡代理', () => {
  it('静态树逐物体裁剪保留实际哨站的三角形遮挡与最近碰撞', () => {
    const scene = new Scene(), world = createWorld(scene); scene.updateMatrixWorld(true);
    const accelerated = new StaticCollision(world.surfaces), random = seededRandom(7612);
    for (let i = 0; i < 120; i++) {
      const origin = new Vector3(0, 4.8, 9), target = new Vector3((random() - .5) * 130, random() * 8, -random() * 150);
      const ray = new Raycaster(origin, target.clone().sub(origin).normalize(), .025, origin.distanceTo(target) - .1);
      const expected = ray.intersectObjects(world.surfaces, false), actual = accelerated.intersections(ray);
      expect(actual.map(hit => hit.distance)).toEqual(expected.map(hit => hit.distance));
      expect(accelerated.blocked(origin, target)).toBe(expected.length > 0);
    }
  });
  it('按需碰撞姿态与渲染姿态逐命中一致，含十类、碎甲、狂暴和多次射线', () => {
    const e = new Encounter(); e.reset('survival', 'hard');
    const full = new ZombieField(), lazy = new ZombieField();
    try {
      for (const broken of [false, true]) for (const time of [0, .25, 3.6]) {
        e.elapsed = time;
        e.zombies = ZOMBIE_KINDS.map((kind, id) => ({ id, kind, x: id * 3 - 13.5, z: -25 - id,
          health: ZOMBIE_TYPES[kind].health, maxHealth: ZOMBIE_TYPES[kind].health, armorHealth: broken ? 0 : ZOMBIE_TYPES[kind].armor,
          enraged: broken && kind === 'berserker', slowRemaining: 1, slowFraction: .35, bornAt: 0, downTime: 0 }));
        full.sync(e); lazy.syncCollision(e);
        for (const z of e.zombies) for (const height of [.5, 1.25, 1.83, 2.4, 4]) {
          const origin = new Vector3(0, 4.8, 9), target = new Vector3(z.x, height * zombieScale(z.kind), z.z);
          const ray = new Raycaster(origin, target.sub(origin).normalize(), .025, 180);
          const a = ray.intersectObject(full), b = ray.intersectObject(lazy);
          expect(b.map(hit => ({ distance: hit.distance, point: hit.point.toArray(), part: hit.instanceId })))
            .toEqual(a.map(hit => ({ distance: hit.distance, point: hit.point.toArray(), part: hit.instanceId })));
          expect(b.map(hit => lazy.decode(hit))).toEqual(a.map(hit => full.decode(hit)));
        }
      }
    } finally { full.dispose(); lazy.dispose(); (full.material as MeshBasicMaterial).dispose(); (lazy.material as MeshBasicMaterial).dispose(); }
  });
  it('固定视野入口拒绝会绕出火力扇面的巨人路径，保留实际宽通道', () => {
    const world = createWorld(new Scene()), giant = new Navigation(world.obstacles, NAV_RADIUS * 2.5);
    expect(fairApproach({ x: -15.45, z: -18.9 }, giant)).toBe(false);
    expect(fairApproach({ x: 1.4, z: -58 }, giant)).toBe(true);
    expect(fairApproach({ x: -7.2, z: -34 }, giant)).toBe(true);
    expect(fairApproach({ x: 20, z: -10 }, giant)).toBe(false);
    expect(fairApproach({ x: 0, z: 10 }, giant)).toBe(false);
  });
  it('目标按ETA/ID选择并维持，切换重新付延迟；装填与技能遵守反应和阻塞', () => {
    const agent = new RogueAgent('regular', 42031);
    expect(agent.decide(observation(0)).shoot).toBe(false);
    expect(agent.decide(observation(.21)).shoot).toBe(false);
    expect(agent.decide(observation(.22)).shoot).toBe(true);
    expect(agent.decide(observation(.35)).skill).toBe(true);
    expect(agent.decide(observation(.4, { reloading: true, canFire: false })).skill).toBe(false);
    expect(agent.decide(observation(.5, { targets: [{ id: 8, eta: 1, distance: 10 }, { id: 5, eta: 5, distance: 10 }] })).targetId).toBe(5);
    expect(agent.decide(observation(.6, { targets: [{ id: 8, eta: 1, distance: 10 }, { id: 7, eta: 1, distance: 10 }] }))).toMatchObject({ targetId: 7, shoot: false });
    const empty = new RogueAgent('regular', 42031);
    expect(empty.decide(observation(0, { ammo: 0, canFire: false })).reload).toBe(false);
    expect(empty.decide(observation(.24, { ammo: 0, canFire: false })).reload).toBe(false);
    expect(empty.decide(observation(.25, { ammo: 0, canFire: false })).reload).toBe(true);
    expect(empty.decide(observation(.3, { ammo: 0, infiniteAmmo: true })).reload).toBe(false);
    expect(empty.decide(observation(.4, { targets: [], canFire: false }))).toMatchObject({ skill: false, shoot: false, targetId: null });
  });
  it('概率流可重现且真正包含失误、条件爆头；自动与半自动延迟不同', () => {
    for (const profile of ['regular', 'skilled', 'expert'] as const) {
      const a = new RogueAgent(profile, 42031), b = new RogueAgent(profile, 42031);
      for (let i = 0; i < 20000; i++) expect(a.decide(observation(i))).toEqual(b.decide(observation(i)));
      expect(a.requestedHits / a.requests).toBeCloseTo(a.profile.accuracy, 1);
      expect(Math.abs(a.requestedHeads / a.requestedHits - a.profile.headshotShare)).toBeLessThan(.015);
      expect(a.requestedHits).toBeLessThan(a.requests);
    }
    const auto = new RogueAgent('regular', 1), semi = new RogueAgent('regular', 1);
    auto.decide(observation(0)); semi.decide(observation(0));
    auto.decide(observation(1, { automatic: true })); semi.decide(observation(1));
    expect(auto.decide(observation(1.1, { automatic: true })).shoot).toBe(true);
    expect(semi.decide(observation(1.1)).shoot).toBe(false);
    expect(auto.decide(observation(1.2, { automatic: true, canFire: false })).shoot).toBe(false);
  });
  it('普通种子一半随机/一半优先，高水平先稀有度；空池可继续', () => {
    expect(Array.from({ length: 24 }, (_, i) => strategyFor('regular', i)).filter(s => s === 'random')).toHaveLength(12);
    expect(chooseAgentUpgrade(['rifle_overload', 'damage', 'cooldown'], 'priority', () => 0)).toBe('damage');
    expect(chooseAgentUpgrade(['rifle_overload', 'damage', 'cooldown'], 'rarity', () => 0)).toBe('rifle_overload');
    expect(chooseAgentUpgrade(['cooldown', 'critical_damage', 'rifle_velocity'], 'rarity', () => 0)).toBe('critical_damage');
    expect(chooseAgentUpgrade(['magazine', 'critical_chance', 'reload'], 'priority', () => 0)).toBe('critical_chance');
    expect(chooseAgentUpgrade(['damage', 'rate', 'critical_chance'], 'random', () => .9)).toBe('critical_chance');
    expect(chooseAgentUpgrade([], 'rarity', () => 0)).toBeNull();
  });
  it('静态加速器保留实例矩阵及真实几何最近碰撞，不把包围盒当命中', () => {
    const mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial(), 2);
    mesh.setMatrixAt(0, new Matrix4().makeTranslation(0, 0, -3)); mesh.setMatrixAt(1, new Matrix4().makeTranslation(0, 0, -6)); mesh.updateMatrixWorld(true);
    const collision = new StaticCollision([mesh]), ray = new Raycaster(new Vector3(), new Vector3(0, 0, -1), 0, 20);
    expect(collision.intersections(ray)[0].distance).toBeCloseTo(ray.intersectObject(mesh)[0].distance);
    expect(collision.blocked(new Vector3(), new Vector3(0, 0, -10))).toBe(true);
    expect(collision.blocked(new Vector3(), new Vector3(0, 0, -2))).toBe(false);
    expect(collision.intersections(new Raycaster(new Vector3(2, 0, 0), new Vector3(0, 0, -1)))).toHaveLength(0);
    for (const origin of [new Vector3(), new Vector3(0, 0, -3), new Vector3(2, 1, 0)]) {
      for (const target of [new Vector3(0, 0, -3), new Vector3(0, 0, -6), new Vector3(4, 2, -5)]) {
        if (origin.equals(target)) continue;
        for (const far of [1, 2.5, 4, 20]) {
          const bounded = new Raycaster(origin, target.clone().sub(origin).normalize(), .025, far);
          expect(collision.intersections(bounded).map(hit => hit.distance)).toEqual(bounded.intersectObject(mesh).map(hit => hit.distance));
        }
        const segment = new Raycaster(origin, target.clone().sub(origin).normalize(), .025, origin.distanceTo(target) - .1);
        expect(collision.blocked(origin, target)).toBe(segment.intersectObject(mesh).length > 0);
      }
    }
    mesh.geometry.dispose(); (mesh.material as MeshBasicMaterial).dispose(); mesh.dispose();
  });
  it('统计区分到达/通过50波、保留删失，缺样本绝不通过', () => {
    const rows = [0, 10, 20, 49, 50].map(completed => ({ completed, failed: completed !== 50, censored: completed === 50 })) as RogueRun[];
    expect(summarize(rows)).toMatchObject({ n: 5, mean: 25.8, median: 20, p10: 0, p90: 49, entered50: 2, entered50Rate: .4, cleared50Rate: .2, censored: 1, earlyFailureRate: .2 });
    expect(wilson(0, 144)[1]).toBeGreaterThan(0);
    expect(balanceFailures([], false)).toContain('Expected 864 runs, received 0');
  });
  it('生产场景/导航的短局同seed可重现，到审查上限明确删失而非自然失败', () => {
    const options = { weapon: 'pistol', profile: 'regular', seed: 42031, fps: 60, maxSeconds: 3 } as const;
    const first = simulateRogueRun(options), second = simulateRogueRun(options);
    expect(first).toEqual(second);
    expect(first).toMatchObject({ censored: true, failed: false, failedWave: null, censorReason: 'time-limit' });
    expect(Object.values(first.spawned).reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
  }, 30000);
  it('生产模型输出十类组成、特殊行为事件、暴击与巫师瞬移诊断', () => {
    const run = simulateRogueRun({ weapon: 'rifle', profile: 'regular', seed: 42031, seedIndex: 0, fps: 60, maxSeconds: 600, maxWaves: 24 });
    expect(Object.keys(run.spawned)).toEqual(ZOMBIE_KINDS);
    expect(Object.keys(run.enemyEventCounts)).toEqual(ENEMY_EVENT_TYPES);
    expect(run.spawned.charger).toBeGreaterThan(0);
    expect(run.spawned.howler).toBeGreaterThan(0);
    expect(run.spawned.berserker).toBeGreaterThan(0);
    expect(run.enemyEventCounts['skitter-turn']).toBeGreaterThan(0);
    expect(run.enemyEventCounts['charger-windup']).toBeGreaterThan(0);
    expect(run.enemyEventCounts['howler-windup']).toBeGreaterThan(0);
    expect(run.enemyEventCounts['berserker-rage']).toBeGreaterThan(0);
    expect(run.teleportCount).toBeGreaterThan(0);
    expect(run.criticalHits).toBeGreaterThan(0);
  }, 30000);
});
