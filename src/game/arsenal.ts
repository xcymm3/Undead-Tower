import { Firearm } from './firearm';
import { SWITCH_DURATION, WEAPONS } from './weapons';

/** 武器的弹量独立保存，换枪只在旧枪动作结束后进行，所有计时均由游戏有效时间驱动。 */
export class Arsenal {
  readonly guns = WEAPONS.map(definition => new Firearm(definition));
  active = 0;
  requested = 0;
  switchElapsed: number | null = null;
  private swapped = false;
  reloadQueued = false;
  get gun() { return this.guns[this.active]; }
  get switching() { return this.switchElapsed !== null; }
  get pending() { return this.requested !== this.active; }
  get blocked() { return this.switching || this.pending || this.reloadQueued; }
  get shots() { return this.guns.reduce((sum, gun) => sum + gun.shots, 0); }
  get switchProgress() { return this.switchElapsed === null ? 0 : Math.min(1, this.switchElapsed / SWITCH_DURATION); }
  request(index: number) {
    if (!Number.isInteger(index) || index < 0 || index >= this.guns.length) return;
    this.requested = index; this.reloadQueued = false;
    if (index !== this.active) this.gun.interruptShellReload();
    this.update(0);
  }
  reload() {
    if (this.switching || this.pending || this.gun.reloading || this.gun.ammo === this.gun.definition.capacity) return false;
    this.reloadQueued = true; this.update(0); return true;
  }
  fire(infiniteAmmo = false) { return !this.blocked && this.gun.fire(infiniteAmmo); }
  update(delta: number) {
    this.guns.forEach(gun => gun.update(delta));
    if (this.switchElapsed !== null) {
      this.switchElapsed += delta;
      if (!this.swapped && this.switchElapsed >= SWITCH_DURATION / 2) { this.active = this.requested; this.swapped = true; }
      if (this.switchElapsed >= SWITCH_DURATION) this.switchElapsed = null;
    }
    if (this.switchElapsed === null && this.gun.fireRemaining === 0 && !this.gun.reloading) {
      if (this.pending) { this.switchElapsed = 0; this.swapped = false; }
      else if (this.reloadQueued) { this.reloadQueued = false; this.gun.reload(); }
    }
  }
  reset() {
    this.guns.forEach((gun, index) => { gun.definition = { ...WEAPONS[index] }; gun.reset(); }); this.active = 0; this.requested = 0;
    this.switchElapsed = null; this.swapped = false; this.reloadQueued = false;
  }
}
