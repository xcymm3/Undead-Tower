import { expect, it } from 'vitest';
import { BoxGeometry, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { Encounter } from '../../src/game/encounter';
import { ZombieField } from '../../src/game/zombies';
import { Navigation } from '../../src/game/navigation';
import { Arsenal } from '../../src/game/arsenal';
import { WEAPON_IDS, type WeaponId } from '../../src/game/weapons';
import { freshLevels, weaponStats } from '../../src/game/upgrades';
import { createShot, hitWithShot, pelletDirection, projectileCount, projectileHits } from '../../src/game/combat';

function shoot(weapon: WeaponId, active: boolean, barrier?: 'all' | 'left') {
  const encounter = new Encounter(); encounter.reset('survival', 'hard'); encounter.setNavigation(new Navigation([]));
  encounter.zombies = [-15, -21].map((z, id) => ({ id, kind: 'normal' as const, health: 50000, maxHealth: 50000, armorHealth: 0, x: 0, z, bornAt: 0, downTime: 0 }));
  const levels = { ...freshLevels(), revolver_deadeye: 1 }, stats = weaponStats(weapon, levels), arsenal = new Arsenal();
  arsenal.active = arsenal.requested = WEAPON_IDS.indexOf(weapon); arsenal.gun.definition = stats; arsenal.gun.reset();
  if (weapon === 'rifle') arsenal.gun.ammo = 0;
  const field = new ZombieField(); field.sync(encounter);
  const wall = new Mesh(new BoxGeometry(barrier === 'left' ? .2 : 20, 10, .1), new MeshBasicMaterial());
  wall.position.set(barrier === 'left' ? -.38 : 0, 1.25, barrier === 'left' ? 8.7 : 5); wall.updateMatrixWorld(true);
  const impacts: { hand: number; target: number }[] = [];
  try {
    if (arsenal.fire(active && weapon === 'rifle')) {
      const shot = createShot(stats, levels, active, () => .1), aim = new Vector3(0, weapon === 'revolver' ? 1.83 : 1.25, -15);
      for (let hand = 0; hand < projectileCount(weapon, active); hand++) {
        const origin = new Vector3(hand ? -.38 : .38, aim.y, 9), center = aim.clone().sub(origin).normalize();
        for (let pellet = 0; pellet < stats.pellets; pellet++) {
          const ray = new Raycaster(origin, pelletDirection(center, new Vector3(0, 1, 0), stats, pellet), 0, 180);
          const intersections = ray.intersectObjects(barrier ? [field, wall] : [field], false);
          const contacts = projectileHits(intersections, hit => field.decode(hit), active && weapon === 'sniper' ? shot.skill.pierceTargets : 1);
          for (const [depth, contact] of contacts.entries()) {
            const hit = field.decode(contact); if (!hit) break;
            if (hitWithShot(encounter, shot, hit.id, hit.head, hand, depth, pellet)) impacts.push({ hand, target: hit.id });
          }
          field.sync(encounter);
        }
      }
    }
    return { zombies: encounter.zombies, impacts, shots: arsenal.shots, ammo: arsenal.gun.ammo, capacity: stats.capacity };
  } finally { field.dispose(); (field.material as MeshBasicMaterial).dispose(); wall.geometry.dispose(); wall.material.dispose(); }
}

it.each(WEAPON_IDS)('%s 技能开关通过真实枪口/实例碰撞产生对应行为且不穿世界障碍', weapon => {
  const normal = shoot(weapon, false), active = shoot(weapon, true), blocked = shoot(weapon, true, 'all');
  expect(blocked.impacts).toHaveLength(0); expect(blocked.zombies.every(z => z.health === 50000)).toBe(true);
  expect(active.impacts.length).toBeGreaterThan(0); expect(active.shots).toBe(1);
  if (weapon === 'rifle') { expect(normal.shots).toBe(0); expect(active.ammo).toBe(0); }
  if (weapon === 'p90') { expect(normal.zombies[0].slowRemaining).toBeUndefined(); expect(active.zombies[0].slowRemaining).toBe(2); }
  if (weapon === 'pistol') {
    expect(active.impacts.map(hit => hit.hand)).toEqual([0, 1]); expect(active.ammo).toBe(active.capacity - 1);
    expect(active.zombies[0].health).toBeLessThan(normal.zombies[0].health);
    expect(shoot(weapon, true, 'left').impacts.map(hit => hit.hand)).toEqual([0]);
  }
  if (weapon === 'revolver') expect(active.zombies[0].health).toBeLessThan(normal.zombies[0].health);
  if (weapon === 'shotgun') { expect(normal.zombies[0].z).toBe(-15); expect(active.zombies[0].z).toBeCloseTo(-17); }
  if (weapon === 'sniper') { expect(normal.zombies[1].health).toBe(50000); expect(active.impacts.map(hit => hit.target)).toEqual([0, 1]); }
});
