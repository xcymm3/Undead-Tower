import { WEAPON_IDS } from '../src/game/weapons';

/** Integration checks use only input events and the restricted fixed clock. */
export function replayLifecycleChecks() {
  const c = window.__undeadReplay!;
  const canvas = document.querySelector('canvas')!;
  const pointer = (type: string, button: number) => (type === 'pointerup' ? window : canvas).dispatchEvent(new PointerEvent(type, { button, bubbles: true, clientX: 720, clientY: 50 }));
  const key = (code: string) => window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
  const step = (count: number) => { for (let n = 0; n < count; n++) c.step(1 / 60); };
  const assert = (value: boolean, message: string) => { if (!value) throw new Error(message); };
  const checks: string[] = [];
  for (const weapon of WEAPON_IDS) {
    c.begin(weapon, 42031); step(181);
    assert(c.observe().phase === 'playing', `${weapon} countdown`);
    pointer('pointerdown', 0); pointer('pointerup', 0); key('KeyR');
    // Reject during the pending mechanical cycle as well as actual reload.
    pointer('pointerdown', 2); pointer('pointerup', 2);
    assert(c.observe().skillActivations === 0, `${weapon} queued reload rejected`);
    for (let n = 0; !c.observe().reloading && n < 180; n++) step(1);
    assert(c.observe().reloading, `${weapon} starts reload`);
    pointer('pointerdown', 2); pointer('pointerup', 2);
    assert(c.observe().skillActivations === 0, `${weapon} reload rejected`);
    for (let n = 0; c.observe().reloading && n < 1800; n++) step(1);
    assert(!c.observe().reloading, `${weapon} completes reload`);
    pointer('pointerdown', 2);
    assert(c.observe().skillActive, `${weapon} activation`);
    pointer('pointerdown', 2);
    assert(c.observe().skillActivations === 1, `${weapon} duplicate press`);
    key('Escape'); const before = c.observe(); step(600); const after = c.observe();
    assert(after.phase === 'paused' && before.time === after.time && before.skillCooldown === after.skillCooldown && before.skillTime === after.skillTime, `${weapon} paused clock`);
    key('Escape'); step(1);
    assert(c.observe().phase === 'playing', `${weapon} resumed`);
    window.dispatchEvent(new Event('blur')); const blurred = c.observe(); step(60);
    assert(c.observe().phase === 'paused' && c.observe().time === blurred.time, `${weapon} blur freezes`);
    key('Escape');
    c.begin(weapon, 42031);
    assert(c.observe().skillCooldown === 0 && c.observe().skillActivations === 0 && Object.values(c.observe().levels).every(n => n === 0), `${weapon} restart resets`);
    step(181); pointer('pointerdown', 2);
    const cooldown = c.observe().skillCooldown;
    assert(cooldown > 0, `${weapon} hold starts cooldown`);
    // Defend only against imminent breaches, leaving distant enemies alive so
    // the hold spans one uninterrupted combat phase (not a wave transition).
    for (let n = 0; n < Math.ceil(cooldown * 60) + 2; n++) c.step(1 / 60, false, () => {
      const o = c.observe(), target = o.targets.filter(z => z.distance < 8).sort((a, b) => a.eta - b.eta)[0];
      if (o.ammo === 0 && !o.reloading && !o.blocked && !o.infiniteAmmo) key('KeyR');
      if (!target || !o.canFire) return;
      const input = { button: 0, bubbles: true, clientX: target.head.x, clientY: target.head.y };
      canvas.dispatchEvent(new PointerEvent('pointermove', input));
      canvas.dispatchEvent(new PointerEvent('pointerdown', input));
      window.dispatchEvent(new PointerEvent('pointerup', input));
    });
    assert(c.observe().phase === 'playing', `${weapon} hold remains in active combat`);
    assert(!c.observe().skillActive && c.observe().skillCooldown === 0 && c.observe().skillActivations === 1, `${weapon} hold across full cooldown does not reactivate`);
    pointer('pointerdown', 2);
    assert(c.observe().skillActivations === 1, `${weapon} repeated down after cooldown is not a new edge`);
    pointer('pointerup', 2);
    // Defensive fire can leave a long-reload weapon in its mechanical cycle at
    // the exact cooldown boundary. Wait for the same public readiness predicate
    // used by real input before testing the new press edge.
    for (let n = 0; (c.observe().reloading || c.observe().blocked) && n < 1800; n++) step(1);
    assert(!c.observe().reloading && !c.observe().blocked, `${weapon} ready after defensive fire`);
    pointer('pointerdown', 2); pointer('pointerup', 2);
    assert(c.observe().skillActive && c.observe().skillActivations === 2, `${weapon} release and new press reactivates`);
    checks.push(`${weapon}: countdown, queued/reloading reject, press edge, pause/resume, blur, restart, full-cooldown hold and release/repress`);
  }
  return checks;
}
