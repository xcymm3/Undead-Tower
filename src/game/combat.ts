import type { Encounter } from './encounter';
import { Vector3 } from 'three';
import type { WeaponDefinition, WeaponId } from './weapons';
import { skillStats, criticalStats } from './upgrades';
import { seededRandom } from './geometry';
import type { UpgradeLevels, SkillStats } from './upgrades';

export interface ShotContext { weapon: WeaponDefinition; skill: SkillStats; active: boolean; impacted: Set<number>; criticalMultiplier: number; projectiles: readonly boolean[]; }
export const criticalRandom = (seed: number) => seededRandom(seed ^ 0x6c8e9cf5);
/** One roll per emitted ray, including misses; penetration never rolls again. */
export function createShot(weapon: WeaponDefinition, levels: UpgradeLevels, active: boolean, random: () => number): ShotContext {
  const critical = criticalStats(weapon.id, levels, active);
  return { weapon, skill: skillStats(weapon.id, levels), active, impacted: new Set(), criticalMultiplier: critical.multiplier,
    projectiles: Array.from({ length: projectileCount(weapon.id, active) * weapon.pellets }, () => random() < critical.chance) };
}
/** Intersections must be distance sorted. A world hit ends the ray even during penetration. */
export function projectileHits<T>(hits: readonly T[], decode: (hit: T) => { id: number } | null, maximum: number): T[] {
  const selected: T[] = [], seen = new Set<number>();
  for (const hit of hits) {
    const target = decode(hit);
    if (!target) { selected.push(hit); break; }
    if (seen.has(target.id)) continue;
    selected.push(hit); seen.add(target.id);
    if (seen.size >= maximum) break;
  }
  return selected;
}
export function projectileCount(weapon: WeaponId, active: boolean) { return active && weapon === 'pistol' ? 2 : 1; }
export function pelletDirection(center: Vector3, cameraUp: Vector3, weapon: WeaponDefinition, pellet: number) {
  const right = new Vector3().crossVectors(center, cameraUp).normalize();
  const up = new Vector3().crossVectors(right, center).normalize();
  const angle = pellet * 2.399963229728653;
  const radius = weapon.spread * Math.sqrt(pellet / Math.max(1, weapon.pellets - 1));
  return center.clone().addScaledVector(right, Math.cos(angle) * radius).addScaledVector(up, Math.sin(angle) * radius).normalize();
}
export function hitWithShot(encounter: Encounter, shot: ShotContext, id: number, head: boolean, hand = 0, depth = 0, pellet = 0) {
  const { weapon, skill, active } = shot;
  const firstImpact = !shot.impacted.has(id);
  const headMultiplier = weapon.headMultiplier ?? 2;
  const critical = shot.projectiles[hand * weapon.pellets + pellet] === true;
  const multiplier = active ? skill.damageMultiplier * (hand ? skill.offhandMultiplier : 1) * (depth ? skill.pierceRetention : 1) : 1;
  const bonus = active && weapon.id === 'shotgun' && firstImpact ? skill.impactDamage : 0;
  const damage = (weapon.damage * multiplier + bonus) * (head ? headMultiplier : 1) * (critical ? shot.criticalMultiplier : 1);
  const result = encounter.hit(id, head, damage);
  if (!result) return null;
  shot.impacted.add(id);
  if (active && !result.killed) {
    if (weapon.id === 'p90') encounter.slow(id, skill.slowFraction, skill.slowDuration);
    if (weapon.id === 'shotgun' && firstImpact) encounter.knockback(id, skill.knockback);
  }
  return { ...result, critical };
}
