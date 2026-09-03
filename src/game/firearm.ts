import { CONFIG } from './config';

export class Firearm {
  ammo: number = CONFIG.weapon.capacity;
  shots = 0;
  cooldown = 0;
  reloadRemaining = 0;

  get reloading() { return this.reloadRemaining > 0; }

  fire(): boolean {
    if (this.reloading || this.cooldown > 0 || this.ammo === 0) return false;
    this.ammo--;
    this.shots++;
    this.cooldown = CONFIG.weapon.interval;
    return true;
  }

  reload(): boolean {
    if (this.reloading || this.ammo === CONFIG.weapon.capacity) return false;
    this.reloadRemaining = CONFIG.weapon.reloadDuration;
    return true;
  }

  update(delta: number) {
    this.cooldown = Math.max(0, this.cooldown - delta);
    if (this.reloadRemaining > 0) {
      this.reloadRemaining = Math.max(0, this.reloadRemaining - delta);
      if (this.reloadRemaining === 0) this.ammo = CONFIG.weapon.capacity;
    }
  }

  reset() {
    this.ammo = CONFIG.weapon.capacity;
    this.shots = 0;
    this.cooldown = 0;
    this.reloadRemaining = 0;
  }
}
