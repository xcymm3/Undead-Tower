import type { SkillStats } from './upgrades';

export interface SkillSnapshot { remaining: number; cooldownRemaining: number; endedRemaining: number; active: boolean; activations: number; }
/** The caller advances only effective playing time; wave breaks end effects but retain CD. */
export class ActiveSkill {
  remaining = 0;
  cooldownRemaining = 0;
  endedRemaining = 0;
  activations = 0;
  private held = false;
  get active() { return this.remaining > 0; }
  press(stats: SkillStats, allowed: boolean) {
    if (this.held) return false;
    this.held = true;
    if (!allowed || this.active || this.cooldownRemaining > 1e-8) return false;
    this.remaining = stats.duration; this.cooldownRemaining = stats.cooldown; this.endedRemaining = 0; this.activations++;
    return true;
  }
  release() { this.held = false; }
  update(delta: number) {
    if (!Number.isFinite(delta) || delta <= 0) return;
    const before = this.remaining;
    this.endedRemaining = Math.max(0, this.endedRemaining - delta);
    this.remaining = Math.max(0, this.remaining - delta);
    this.cooldownRemaining = Math.max(0, this.cooldownRemaining - delta);
    if (before > 0 && this.remaining === 0) this.endedRemaining = Math.max(0, 1.6 - (delta - before));
  }
  end() { this.remaining = 0; this.endedRemaining = 0; this.release(); }
  reset() { this.end(); this.cooldownRemaining = 0; this.activations = 0; }
  snapshot(): SkillSnapshot { return { remaining: this.remaining, cooldownRemaining: this.cooldownRemaining, endedRemaining: this.endedRemaining, active: this.active, activations: this.activations }; }
}
