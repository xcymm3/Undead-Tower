import { seededRandom } from '../src/game/geometry';
import { RARITIES, UPGRADES, type UpgradeId } from '../src/game/upgrades';

export const PROFILES = {
  regular: { accuracy: .70, headshotShare: .45, interval: .20, acquireDelay: .22, reloadDelay: .25, skillDelay: .35 },
  skilled: { accuracy: .88, headshotShare: .75, interval: .14, acquireDelay: .12, reloadDelay: .12, skillDelay: .20 },
  expert: { accuracy: .96, headshotShare: .92, interval: .115, acquireDelay: .05, reloadDelay: .06, skillDelay: .10 },
} as const;
export type ProfileId = keyof typeof PROFILES;
export const BALANCE_SEEDS = Array.from({ length: 24 }, (_, i) => 42031 + i * 177);
export type Strategy = 'random' | 'priority' | 'rarity';
export function strategyFor(profile: ProfileId, index: number): Strategy { return profile !== 'regular' ? 'rarity' : index % 2 === 0 ? 'random' : 'priority'; }
const PRIORITY: Partial<Record<UpgradeId, number>> = {
  damage: 0,
  rate: 1,
  critical_chance: 2,
  critical_damage: 3,
  cooldown: 4,
  duration: 5,
  magazine: 7,
  reload: 8,
};
const priority = (id: UpgradeId) => PRIORITY[id] ?? ('weapon' in UPGRADES[id] ? 6 : 9);
export function chooseAgentUpgrade(choices: readonly UpgradeId[], strategy: Strategy, random: () => number): UpgradeId | null {
  if (!choices.length) return null;
  if (strategy === 'random') return choices[Math.min(choices.length - 1, Math.floor(random() * choices.length))];
  return [...choices].sort((a, b) => (strategy === 'rarity' ? RARITIES[UPGRADES[a].rarity].weight - RARITIES[UPGRADES[b].rarity].weight : 0) || priority(a) - priority(b) || a.localeCompare(b))[0];
}
export interface AgentTarget { id: number; eta: number; distance: number; }
export interface AgentObservation {
  time: number; targets: AgentTarget[]; ammo: number; reloading: boolean; blocked: boolean;
  automatic: boolean; canFire: boolean; skillActive: boolean; skillCooldown: number; infiniteAmmo: boolean;
}
/** Only observations are accepted: this policy cannot inspect future spawns or upgrades. */
export class RogueAgent {
  targetId: number | null = null;
  private acquireAt = 0;
  private shotAt = 0;
  private emptyAt: number | null = null;
  private threatAt: number | null = null;
  private random: () => number;
  readonly profile;
  requestedHits = 0;
  requestedHeads = 0;
  requests = 0;
  constructor(readonly profileId: ProfileId, seed: number) { this.profile = PROFILES[profileId]; this.random = seededRandom(seed ^ 0x31415926); }
  break() { this.targetId = null; this.emptyAt = null; this.threatAt = null; this.shotAt = 0; }
  decide(o: AgentObservation) {
    const p = this.profile;
    let target = o.targets.find(t => t.id === this.targetId);
    if (!target) {
      target = [...o.targets].sort((a, b) => a.eta - b.eta || a.id - b.id)[0];
      this.targetId = target?.id ?? null; this.acquireAt = o.time + p.acquireDelay;
    }
    if (o.ammo === 0 && !o.infiniteAmmo) this.emptyAt ??= o.time; else this.emptyAt = null;
    const reload = this.emptyAt !== null && o.time + 1e-8 >= this.emptyAt + p.reloadDelay && !o.reloading && !o.blocked;
    const threatened = o.targets.length >= 3 || o.targets.some(t => t.distance <= 12);
    if (threatened && !o.skillActive && o.skillCooldown <= 1e-8) this.threatAt ??= o.time; else this.threatAt = null;
    const skill = this.threatAt !== null && o.time + 1e-8 >= this.threatAt + p.skillDelay && !o.reloading && !o.blocked;
    const shoot = !!target && o.canFire && o.time + 1e-8 >= this.acquireAt && o.time + 1e-8 >= this.shotAt;
    let hit = false, head = false;
    if (shoot) {
      this.shotAt = o.time + (o.automatic ? 0 : p.interval);
      hit = this.random() < p.accuracy; head = hit && this.random() < p.headshotShare;
      this.requests++; if (hit) this.requestedHits++; if (head) this.requestedHeads++;
    }
    return { targetId: this.targetId, shoot, hit, head, reload, skill };
  }
}
