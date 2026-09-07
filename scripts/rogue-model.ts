import { PerspectiveCamera, Raycaster, Scene, Vector2, Vector3, type Intersection } from 'three';
import { CONFIG, CROWD, ENEMY_RULES, PRESSURE, SURVIVAL, ZOMBIE_TYPES, emptyZombieCounts, zombieScale, zombieSpeed } from '../src/game/config';
import { Encounter, distanceToBreach, emptyEnemyEventCounts } from '../src/game/encounter';
import { Arsenal } from '../src/game/arsenal';
import { ActiveSkill } from '../src/game/skills';
import { createShot, hitWithShot, pelletDirection, projectileCount, projectileHits, criticalRandom } from '../src/game/combat';
import { seededRandom } from '../src/game/geometry';
import { Navigation, NAV_RADIUS } from '../src/game/navigation';
import { createWorld } from '../src/game/world';
import { spawnEnemy, visiblePoint } from '../src/game/sceneRules';
import { frameClocks, PREPARATION_SECONDS } from '../src/game/timing';
import { SpawnDirector } from '../src/game/spawn';
import { ZombieField } from '../src/game/zombies';
import { finishShotTeleports } from '../src/game/teleport';
import { WEAPONS, type WeaponId } from '../src/game/weapons';
import { applyUpgrade, freshLevels, skillStats, weaponStats, upgradeChoices, SKILLS, UPGRADES } from '../src/game/upgrades';
import { waveCounts, waveEnemies, waveRate } from '../src/game/rogue';
import { dampView } from '../src/game/aim';
import { RogueAgent, chooseAgentUpgrade, strategyFor, type ProfileId, type Strategy } from './rogue-agent';
import { StaticCollision } from './static-collision';

let shared: ReturnType<typeof createArena> | undefined;
function createArena() {
  const scene = new Scene(), world = createWorld(scene); scene.updateMatrixWorld(true);
  return { scene, collision: new StaticCollision(world.surfaces), navigation: new Navigation(world.obstacles), giant: new Navigation(world.obstacles, NAV_RADIUS * zombieScale('giant')) };
}
export interface RunOptions { weapon: WeaponId; profile: ProfileId; seed: number; fps: number; seedIndex?: number; maxSeconds?: number; maxWaves?: number; }
export function simulateRogueRun(options: RunOptions, trace?: (frame: { time: number; wave: number; shots: number; target: number | null; visible: number[]; zombies: { id: number; kind: string; health: number; x: number; z: number }[] }) => void) {
  const { weapon, profile, seed, fps } = options;
  if (![30, 60].includes(fps)) throw new Error('FPS must be 30 or 60');
  const arena = shared ??= createArena();
  const camera = new PerspectiveCamera(CONFIG.camera.fov, 1440 / 900, .025, 220);
  camera.position.set(0, CONFIG.camera.height, 9); camera.rotation.set(-.105, 0, 0, 'YXZ'); camera.updateMatrixWorld(true);
  const encounter = new Encounter(); encounter.reset('survival', 'hard'); encounter.setNavigation(arena.navigation, arena.giant);
  const field = new ZombieField(), arsenal = new Arsenal(), skill = new ActiveSkill();
  arsenal.active = arsenal.requested = WEAPONS.findIndex(w => w.id === weapon);
  const gun = arsenal.gun, agent = new RogueAgent(profile, seed);
  const strategy: Strategy = strategyFor(profile, options.seedIndex ?? Math.max(0, Math.round((seed - 42031) / 177)));
  const waves = seededRandom(seed), upgrades = seededRandom(seed ^ 0x12345678), teleports = seededRandom(seed ^ 0x5a5a5a5a);
  const critical = criticalRandom(seed);
  let criticalHits = 0, criticalHeadHits = 0;
  const enemyEventCounts = emptyEnemyEventCounts();
  let teleportCount = 0;
  const decisions = seededRandom(seed ^ 0x27182818), spawns = new SpawnDirector(seededRandom(seed ^ 0x87654321));
  let levels = freshLevels(), wave = 1, completed = 0, hits = 0, headHits = 0, skillTime = 0, maxAlive = 0, clearTime = 0;
  let observedSpawns = 0, lockedId: number | null = null, preparation = PREPARATION_SECONDS;
  const spawned = emptyZombieCounts(), killedKinds = emptyZombieCounts(), originalKinds = new Map<number, keyof typeof spawned>();
  const upgradeHistory: { wave: number; choices: string[]; selected: string | null }[] = [];
  const dt = 1 / fps, view = new Vector2(), aim = new Vector2();
  gun.definition = weaponStats(weapon, levels); gun.reset();
  encounter.startWave(waveEnemies(wave, waves), waveRate(wave));
  const maxSeconds = options.maxSeconds ?? 3600, maxWaves = options.maxWaves ?? 60;
  const sync = () => field.syncCollision(encounter);
  const contacts = (origin: Vector3, target: Vector3, maximum = 1) => {
    const ray = new Raycaster(origin, target.clone().sub(origin).normalize(), 0, CONFIG.weapon.range);
    const intersections: Intersection[] = arena.collision.intersections(ray);
    field.raycast(ray, intersections); intersections.sort((a, b) => a.distance - b.distance);
    return projectileHits(intersections, hit => field.decode(hit), maximum);
  };
  try {
    while (!encounter.failed && completed < maxWaves && encounter.elapsed < maxSeconds) {
      if (preparation > 0) {
        const clocks = frameClocks('countdown', preparation, dt);
        arsenal.update(clocks.player); skill.update(clocks.player); preparation = clocks.countdown;
        continue;
      }
      arsenal.update(dt); skillTime += Math.min(dt, skill.remaining); skill.update(dt);
      encounter.update(dt, kind => spawnEnemy(kind ?? 'normal', encounter, camera, spawns, arena.navigation, arena.giant));
      for (const event of encounter.drainEnemyEvents()) enemyEventCounts[event.type]++;
      if (observedSpawns !== encounter.totalSpawned) {
        for (const z of encounter.zombies) if (!originalKinds.has(z.id)) { originalKinds.set(z.id, z.kind); spawned[z.kind]++; }
        observedSpawns = encounter.totalSpawned;
      }
      maxAlive = Math.max(maxAlive, encounter.alive);
      if (encounter.failed) break;
      if (encounter.waveCleared) {
        completed = wave; clearTime = encounter.elapsed; skill.end(); lockedId = null; encounter.clearStatuses(); agent.break();
        if (completed >= maxWaves) break;
        const choices = upgradeChoices(levels, upgrades, weapon), selected = chooseAgentUpgrade(choices, strategy, decisions);
        upgradeHistory.push({ wave, choices, selected });
        if (selected) levels = applyUpgrade(weapon, levels, choices, selected)!;
        const shots = gun.shots; gun.definition = weaponStats(weapon, levels); gun.reset(); gun.shots = shots; arsenal.reloadQueued = false;
        wave++; preparation = PREPARATION_SECONDS; encounter.startWave(waveEnemies(wave, waves), waveRate(wave)); continue;
      }
      // Game advances bounded view from the preceding pointer position before new input.
      view.copy(dampView(view, aim, dt)); camera.rotation.set(-.105 + view.y, view.x, 0, 'YXZ'); camera.updateMatrixWorld(true);
      const visible = encounter.zombies.filter(z => z.health > 0 && visiblePoint(camera, z, zombieScale(z.kind), arena.collision.blocked));
      const infinite = skill.active && weapon === 'rifle';
      const action = agent.decide({ time: encounter.elapsed, targets: visible.map(z => ({ id: z.id, distance: distanceToBreach(z), eta: distanceToBreach(z) / (PRESSURE.speed * zombieSpeed(z.kind) * (z.enraged ? ENEMY_RULES.berserker.speedMultiplier : 1) * (1 - (z.slowRemaining ? z.slowFraction ?? 0 : 0))) })),
        ammo: gun.ammo, reloading: gun.reloading, blocked: arsenal.blocked, automatic: gun.definition.automatic,
        canFire: !arsenal.blocked && !gun.reloading && gun.cooldown <= 1e-8 && (infinite || gun.ammo > 0), skillActive: skill.active, skillCooldown: skill.cooldownRemaining, infiniteAmmo: infinite });
      trace?.({ time: encounter.elapsed, wave, shots: gun.shots, target: action.targetId, visible: visible.map(z => z.id), zombies: encounter.zombies.filter(z => z.health > 0).map(({ id, kind, health, x, z }) => ({ id, kind, health, x, z })) });
      if (action.skill) { skill.press(skillStats(weapon, levels), !gun.reloading && !arsenal.blocked); skill.release(); }
      if (action.reload && !(skill.active && weapon === 'rifle')) arsenal.reload();
      const target = encounter.zombies.find(z => z.id === action.targetId && z.health > 0);
      if (!target) { lockedId = null; continue; }
      const requestedPoint = new Vector3(target.x, (action.shoot && !action.head ? 1.25 : 1.83) * zombieScale(target.kind), target.z);
      if (action.shoot && !action.hit) requestedPoint.y = 35;
      const projected = requestedPoint.clone().project(camera);
      aim.set(Math.max(-1, Math.min(1, projected.x)), Math.max(-1, Math.min(1, projected.y)));
      if (action.shoot || skill.active && weapon === 'revolver') sync();
      // The camera ray chooses its first surface; the separate muzzle ray may be blocked.
      const cameraRay = new Raycaster(); cameraRay.setFromCamera(aim, camera); cameraRay.far = CONFIG.weapon.range;
      let aimPoint = cameraRay.ray.at(CONFIG.weapon.range, new Vector3());
      if (action.shoot) {
        const cameraHits = arena.collision.intersections(cameraRay); field.raycast(cameraRay, cameraHits); cameraHits.sort((a, b) => a.distance - b.distance);
        if (cameraHits[0]) aimPoint = cameraHits[0].point.clone();
      }
      const muzzleFor = (hand: number, point: Vector3) => {
        const root = new Vector3(hand ? -.38 : .38, gun.definition.length < .6 ? -.32 : -.40, -1.16).applyMatrix4(camera.matrixWorld);
        return root.addScaledVector(point.clone().sub(root).normalize(), gun.definition.length * .72);
      };
      if (skill.active && weapon === 'revolver') {
        const candidates = [...visible].sort((a, b) => a.id === lockedId ? -1 : b.id === lockedId ? 1 : Math.hypot(a.x, a.z - 9) - Math.hypot(b.x, b.z - 9) || a.id - b.id);
        const locked = candidates.find(z => { const point = new Vector3(z.x, 1.83 * zombieScale(z.kind), z.z); return field.decode(contacts(muzzleFor(0, point), point)[0])?.id === z.id; });
        lockedId = locked?.id ?? null;
        if (locked) aimPoint.set(locked.x, 1.83 * zombieScale(locked.kind), locked.z);
      } else lockedId = null;
      if (!action.shoot || !arsenal.fire(skill.active && weapon === 'rifle')) continue;
      const shot = createShot(gun.definition, levels, skill.active, critical);
      let landed = false, headed = false;
      for (let hand = 0; hand < projectileCount(weapon, skill.active); hand++) {
        const muzzle = muzzleFor(hand, aimPoint), center = aimPoint.clone().sub(muzzle).normalize();
        for (let pellet = 0; pellet < gun.definition.pellets; pellet++) {
          const direction = pelletDirection(center, camera.up, gun.definition, pellet);
          const selected = contacts(muzzle, muzzle.clone().add(direction), skill.active && weapon === 'sniper' ? shot.skill.pierceTargets : 1);
          for (let depth = 0; depth < selected.length; depth++) {
            const hit = field.decode(selected[depth]); if (!hit) break;
            const damage = hitWithShot(encounter, shot, hit.id, hit.head, hand, depth, pellet); if (!damage) continue;
            if (damage.critical) { criticalHits++; if (hit.head) criticalHeadHits++; }
            landed = true; headed ||= hit.head;
            const zombie = encounter.zombies.find(z => z.id === hit.id)!;
            if (damage.killed) killedKinds[originalKinds.get(zombie.id) ?? zombie.kind]++;
            sync();
          }
        }
      }
      teleportCount += finishShotTeleports(shot, encounter.zombies, arena.navigation, p => visiblePoint(camera, p, 1, arena.collision.blocked), teleports).length;
      if (landed) hits++; if (headed) headHits++;
    }
    return { ...options, strategy, completed, failedWave: encounter.failed ? wave : null, seconds: encounter.elapsed, clearTime,
      failed: encounter.failed, censored: !encounter.failed, censorReason: encounter.failed ? null : completed >= maxWaves ? 'wave-limit' : 'time-limit',
      shots: gun.shots, hits, headHits, criticalHits, criticalHeadHits, requestedShots: agent.requests, requestedHits: agent.requestedHits, requestedHeads: agent.requestedHeads,
      kills: encounter.kills, waveKills: encounter.waveKills, skillActivations: skill.activations, skillTime, maxAlive, spawned, killedKinds,
      enemyEventCounts, teleportCount, levels, upgradeHistory };
  } finally { field.dispose(); (field.material as import('three').Material).dispose(); }
}
export type RogueRun = ReturnType<typeof simulateRogueRun>;
export const balanceConfiguration = () => ({ weapons: WEAPONS, skills: SKILLS, upgrades: UPGRADES, enemies: ZOMBIE_TYPES, enemyRules: ENEMY_RULES, crowd: CROWD, survival: SURVIVAL, pressure: PRESSURE,
  waves: Array.from({ length: 60 }, (_, i) => ({ wave: i + 1, counts: waveCounts(i + 1), rate: waveRate(i + 1) })) });
