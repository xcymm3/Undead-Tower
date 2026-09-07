import { startReplay } from './rogue-replay-browser';

/** Bounded resource checks through normal input and the dedicated fixed test clock. */
export function replayResourceChecks() {
  const control = window.__undeadReplay!, canvas = document.querySelector('canvas')!;
  // Frozen matrix seed 45394 naturally reaches the required dense P90 window;
  // this keeps the stress sample reproducible without a state editor or wave skip.
  const runner = startReplay({ weapon: 'p90', profile: 'regular', seed: 45394, seedIndex: 19, fps: 60 });
  type Observation = ReturnType<typeof control.observe>;
  type Sample = Pick<Observation, 'time' | 'phase' | 'skillTime' | 'skillActivations' | 'enemyEventCounts' | 'teleportCount'> & Observation['resources'] & { slots: number; alive: number };
  const samples: Sample[] = [];
  while (true) {
    const state = runner.batch(180), o = control.observe();
    samples.push({ time: o.time, phase: o.phase, slots: o.allTargets.length, alive: o.allTargets.filter(z => z.health > 0).length,
      skillTime: o.skillTime, skillActivations: o.skillActivations, enemyEventCounts: o.enemyEventCounts, teleportCount: o.teleportCount, ...o.resources });
    if (state.done) break;
  }
  const final = runner.result(), gaps: string[] = [];
  const check = (valid: boolean, message: string) => { if (!valid) gaps.push(message); };
  let stress: typeof samples = [];
  for (let i = 0; i < samples.length; i++) {
    const window = samples.slice(i).filter(s => s.time <= samples[i].time + 63);
    if (window.length < 2 || window.at(-1)!.time - window[0].time < 60) continue;
    if (Math.max(...window.map(s => s.alive)) >= 20 && window.reduce((sum, s) => sum + s.alive, 0) / window.length >= 8
      && window.at(-1)!.skillTime > window[0].skillTime) { stress = window; break; }
  }
  check(stress.length > 0, 'No 60-second active-time stress window with peak >=20, average >=8 enemies and active skill');
  check(samples.every(s => s.slots <= 256 && s.effects <= 160), 'Enemy/effect cap exceeded');
  check(samples.every(s => s.sceneChildren <= final.resources.sceneChildren + 160), 'Scene node count exceeded bounded effect allowance');
  check(Object.values(final.enemyEventCounts).some(count => count > 0), 'No special-enemy feedback event reached the production renderer');
  check(final.failed, 'Resource playthrough did not finish naturally');
  check(samples.at(-1)!.effects === 0, 'Effects remain after natural failure');
  const pointer = (type: string, button: number) => (type === 'pointerup' ? window : canvas).dispatchEvent(new PointerEvent(type, { button, bubbles: true, clientX: 720, clientY: 20 }));
  const step = (count: number) => { for (let n = 0; n < count; n++) control.step(1 / 60, n % 60 === 0); };
  const restarts = [];
  for (let run = 0; run < 12; run++) {
    control.begin('pistol', 42031); step(181);
    pointer('pointerdown', 2); pointer('pointerup', 2);
    pointer('pointerdown', 0); pointer('pointerup', 0); step(600);
    const o = control.observe();
    restarts.push({ run, time: o.time, skillActive: o.skillActive, skillActivations: o.skillActivations, ...o.resources });
    check(o.skillActivations === 1 && !o.skillActive, `Restart ${run}: active skill lifecycle failed`);
    check(o.resources.effects === 0, `Restart ${run}: expired effects remain`);
  }
  const warm = restarts[1];
  check(restarts.slice(2).every(r => r.sceneChildren === warm.sceneChildren && r.geometries === warm.geometries && r.textures === warm.textures), 'Live resources changed across 10 restarts after warm-up');
  control.begin('pistol', 42031);
  check(control.observe().resources.effects === 0, 'Restart did not clear effects');
  return { status: gaps.length ? 'FAIL' : 'PASS', gaps, stress, restarts, sampleCount: samples.length,
    maxAlive: Math.max(...samples.map(s => s.alive)), maxEffects: Math.max(...samples.map(s => s.effects)),
    maxSceneChildren: Math.max(...samples.map(s => s.sceneChildren)), final,
    limitations: ['Fixed-step real input playthrough, sampled drawing every 180 updates; not a real-time FPS benchmark.', 'Hidden/title/pause draw behavior is checked separately in rogue-idle.spec.ts.'] };
}
