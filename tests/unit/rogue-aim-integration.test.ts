import { expect, it, vi } from 'vitest';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, PerspectiveCamera, Raycaster, Vector2, Vector3 } from 'three';
import { Game } from '../../src/game/Game';
import { Encounter } from '../../src/game/encounter';
import { ZombieField } from '../../src/game/zombies';
import { Arsenal } from '../../src/game/arsenal';
import { CONFIG } from '../../src/game/config';

it('实际 Game 瞄准方法保留死眼目标，死亡/离屏后重选，世界挡住全部目标时不锁定', () => {
  // No renderer or state editor: exercise the production method with real scene rays.
  const camera = new PerspectiveCamera(CONFIG.camera.fov, 1440 / 900, .025, 220);
  camera.position.set(0, CONFIG.camera.height, 9);
  const root = new Group(), muzzle = new Group(), offhand = new Group();
  muzzle.position.z = -.5; root.add(muzzle); camera.add(root, offhand);
  const encounter = new Encounter(); encounter.reset('survival', 'hard');
  encounter.zombies = [{ id: 7, x: 0, z: -20 }, { id: 3, x: 4, z: -25 }].map(z => ({ ...z, kind: 'normal' as const, health: 100, maxHealth: 100, armorHealth: 0, bornAt: 0, downTime: 0 }));
  const field = new ZombieField(), arsenal = new Arsenal(); arsenal.active = arsenal.requested = 3;
  const wall = new Mesh(new BoxGeometry(1.2, 6, .3), new MeshBasicMaterial());
  wall.position.set(0, 3, -15); wall.updateMatrixWorld(true);
  const fixture = { camera, encounter, zombieField: field, arsenal, selectedWeapon: 'revolver', skill: { active: true },
    world: { surfaces: [] as Mesh[] }, host: { style: { setProperty: vi.fn() }, dataset: {} as Record<string, string> },
    weapon: { root, muzzle, offhand, animate: vi.fn() }, width: 1440, height: 900, view: new Vector2(), aim: new Vector2(),
    aimPoint: new Vector3(), raycaster: new Raycaster(), phase: 'playing', lockedId: null as number | null, recoil: 0 };
  const game = Object.assign(Object.create(Game.prototype), fixture) as typeof fixture & { updateAim(delta: number): void };
  const update = () => { field.sync(encounter); camera.updateMatrixWorld(true); game.updateAim(0); };
  try {
    update(); expect(game.lockedId).toBe(7);
    expect(game.aimPoint.toArray()).toEqual([0, 1.83, -20]);
    const origin = muzzle.getWorldPosition(new Vector3());
    const barrel = new Vector3(0, 0, -1).transformDirection(root.matrixWorld);
    expect(barrel.dot(game.aimPoint.clone().sub(origin).normalize())).toBeCloseTo(1, 10);
    expect(field.decode(new Raycaster(origin, barrel).intersectObject(field)[0])?.id).toBe(7);
    encounter.zombies[1].z = -12; update(); expect(game.lockedId).toBe(7);
    encounter.zombies[0].health = 0; update(); expect(game.lockedId).toBe(3);
    encounter.zombies[0].health = 100; encounter.zombies[1].x = 100; update(); expect(game.lockedId).toBe(7);
    encounter.zombies[1].x = 4; encounter.zombies[1].z = -25;
    game.world.surfaces.push(wall); update(); expect(game.lockedId).toBe(3);
    wall.scale.x = 30; wall.updateMatrixWorld(true); update();
    expect(game.lockedId).toBeNull(); expect(game.host.dataset.locked).toBe('false');
    game.world.surfaces.length = 0; encounter.zombies.forEach(z => { z.health = 0; }); update();
    expect(game.lockedId).toBeNull(); expect(arsenal.shots).toBe(0);
  } finally { field.dispose(); (field.material as MeshBasicMaterial).dispose(); wall.geometry.dispose(); wall.material.dispose(); }
});
