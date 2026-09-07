import { RogueAgent, chooseAgentUpgrade, strategyFor } from './rogue-agent';
import type { RunOptions } from './rogue-model';
import { seededRandom } from '../src/game/geometry';
import { emptyZombieCounts } from '../src/game/config';

/** Browser-side input policy. No direct access to Game, Encounter or enemy state. */
export function startReplay(options: RunOptions, presentation?: { pauseOnUpgrade: boolean; renderEvery: number }) {
  const control = window.__undeadReplay;
  if (!control) throw new Error('Dedicated replay server required');
  const agent = new RogueAgent(options.profile, options.seed);
  const strategy = strategyFor(options.profile, options.seedIndex ?? Math.max(0, Math.round((options.seed - 42031) / 177)));
  const decisions = seededRandom(options.seed ^ 0x27182818);
  const spawned = emptyZombieCounts(), killedKinds = emptyZombieCounts(), seen = new Map<number, keyof typeof spawned>(), dead = new Set<number>();
  const history: { wave: number; choices: string[]; selected: string | null }[] = [];
  const canvas = document.querySelector('canvas')!;
  const pointer = (type: string, button: number, point?: { x: number; y: number }) => {
    const event = new PointerEvent(type, { bubbles: true, button, clientX: point?.x ?? 720, clientY: point?.y ?? 450 });
    (type === 'pointerup' ? window : canvas).dispatchEvent(event);
  };
  control.begin(options.weapon, options.seed);
  let maxAlive = 0, ticks = 0, done = false, held = false;
  const input = () => {
    const o = control.observe(), action = agent.decide(o), target = o.targets.find(z => z.id === action.targetId);
    if (action.skill) { pointer('pointerdown', 2); pointer('pointerup', 2); }
    if (action.reload) window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyR', key: 'r', bubbles: true }));
    if (!target || action.reload || o.canFire && !action.shoot) { pointer('pointerup', 0); held = false; }
    if (target) {
      const point = action.shoot ? action.hit ? action.head ? target.head : target.chest : target.miss : target.head;
      pointer('pointermove', 0, point);
      if (action.shoot) {
        if (!o.automatic || !held) pointer('pointerdown', 0, point);
        if (o.automatic) held = true; else pointer('pointerup', 0, point);
      }
    }
  };
  return {
    batch(count = 120) {
      for (let n = 0; n < count && !done; n++) {
        control.step(1 / options.fps, ticks++ % (presentation?.renderEvery ?? 180) === 0, input);
        const o = control.observe();
        if (o.phase !== 'playing') { pointer('pointerup', 0); held = false; }
        for (const z of o.allTargets) {
          if (!seen.has(z.id)) { seen.set(z.id, z.kind); spawned[z.kind]++; }
          if (z.health <= 0 && !dead.has(z.id)) { dead.add(z.id); killedKinds[seen.get(z.id)!]++; }
        }
        maxAlive = Math.max(maxAlive, o.allTargets.filter(z => z.health > 0).length);
        if (o.phase === 'failed' || o.completed >= (options.maxWaves ?? 60) || o.time >= (options.maxSeconds ?? 3600)) { done = true; break; }
        if (o.phase === 'upgrade') {
          if (presentation?.pauseOnUpgrade) break;
          const selected = chooseAgentUpgrade(o.choices, strategy, decisions);
          history.push({ wave: o.wave, choices: o.choices, selected }); agent.break(); control.choose(selected); continue;
        }

      }
      const o = control.observe();
      return { done, phase: o.phase, completed: o.completed, seconds: o.time };
    },
    result() {
      const o = control.observe();
      return { ...options, strategy, completed: o.completed, failedWave: o.phase === 'failed' ? o.wave : null,
        seconds: o.time, clearTime: o.clearTime, failed: o.phase === 'failed', censored: o.phase !== 'failed',
        shots: o.shots, hits: o.hits, headHits: o.headHits, criticalHits: o.criticalHits, criticalHeadHits: o.criticalHeadHits, requestedShots: agent.requests, requestedHits: agent.requestedHits, requestedHeads: agent.requestedHeads,
        kills: o.kills, skillActivations: o.skillActivations, skillTime: o.skillTime, maxAlive, spawned, killedKinds,
        enemyEventCounts: o.enemyEventCounts, teleportCount: o.teleportCount, levels: o.levels, upgradeHistory: history, resources: o.resources };
    },
  };
}
