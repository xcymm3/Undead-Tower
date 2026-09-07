import { ENEMY_RULES } from './config';
import type { Zombie } from './encounter';

/** Shared by live encounters and the balance agent. Armour never regenerates. */
export function enemyDamage(zombie: Zombie, _head: boolean, damage: number) {
  const armorDamage = Math.min(zombie.armorHealth, damage);
  return { armorDamage, healthDamage: damage };
}

export function triggerRage(zombie: Zombie) {
  if (zombie.kind !== 'berserker' || zombie.enraged || zombie.health <= 0 || zombie.health > zombie.maxHealth * ENEMY_RULES.berserker.threshold) return false;
  zombie.enraged = true;
  return true;
}

export function interruptSpecial(zombie: Zombie) {
  if (zombie.health <= 0) return null;
  if (zombie.kind === 'charger' && zombie.specialState === 'windup') {
    zombie.specialState = 'staggered'; zombie.specialRemaining = ENEMY_RULES.charger.staggerDuration; zombie.specialCooldown = ENEMY_RULES.charger.cooldown + ENEMY_RULES.charger.staggerDuration;
    return 'charger-interrupted' as const;
  }
  if (zombie.kind === 'howler' && zombie.specialState === 'windup') {
    zombie.specialState = 'ready'; zombie.specialRemaining = 0; zombie.specialCooldown = ENEMY_RULES.howler.interruptedCooldown;
    return 'howler-interrupted' as const;
  }
  return null;
}
