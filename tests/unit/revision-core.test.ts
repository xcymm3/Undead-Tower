import { beforeAll, describe, expect, it } from 'vitest';
import { PerspectiveCamera, Scene } from 'three';
import { CONFIG, PRESSURE, SURVIVAL, zombieScale } from '../../src/game/config';
import { Encounter, type SpawnPosition } from '../../src/game/encounter';
import { Navigation, NAV_RADIUS } from '../../src/game/navigation';
import { fairApproach, spawnEnemy, visiblePoint } from '../../src/game/sceneRules';
import { SPAWN_ZONES, SpawnDirector } from '../../src/game/spawn';
import { createWorld } from '../../src/game/world';
import { seededRandom } from '../../src/game/geometry';
import { Firearm } from '../../src/game/firearm';
import { Arsenal } from '../../src/game/arsenal';
import { WEAPONS } from '../../src/game/weapons';
import { ActiveSkill } from '../../src/game/skills';
import { freshLevels, skillStats, weaponStats, upgradePreview } from '../../src/game/upgrades';
import { frameClocks } from '../../src/game/timing';

let nav: Navigation, giant: Navigation;
const camera = new PerspectiveCamera(CONFIG.camera.fov, 1440 / 900, .025, 220);
camera.position.set(0, CONFIG.camera.height, 9); camera.rotation.set(-.105, 0, 0, 'YXZ'); camera.updateMatrixWorld(true);
beforeAll(() => { const world = createWorld(new Scene()); nav = new Navigation(world.obstacles); giant = new Navigation(world.obstacles, NAV_RADIUS * zombieScale('giant')); });
const director = (point: SpawnPosition) => ({ next: () => ({...point}) } as unknown as SpawnDirector);

describe('巨人完整生产路线', () => {
  it('拒绝两个林地入口、原坏点和障碍内部点，不能挪动入口', () => {
    const encounter = new Encounter(); encounter.reset('survival', 'hard');
    for (const point of [
      {x:1.4,z:-58,spawnZone:'west-woods'}, {x:1.4,z:-58,spawnZone:'east-woods'},
      {x:-15.45,z:-18.9,spawnZone:'checkpoint-yard'},
      {...giant.obstacles[0],x:giant.obstacles[0].minX,z:giant.obstacles[0].minZ,spawnZone:'north-road'},
    ]) expect(spawnEnemy('giant', encounter, camera, director(point), nav, giant)).toBeNull();
  });
  it.each([{x:1.4,z:-58,spawnZone:'north-road'},{x:-7.2,z:-34,spawnZone:'checkpoint-passage'}])('$spawnZone 按完整体积自然走至突破，沿途仍可瞄准', point => {
    const encounter = new Encounter(); encounter.reset('survival', 'hard'); encounter.setNavigation(nav, giant);
    expect(fairApproach(point, giant, camera, zombieScale('giant'))).toBe(true);
    expect(spawnEnemy('giant', encounter, camera, director(point), nav, giant)).toEqual(point);
    encounter.startWave(['giant'], 1); encounter.update(.01, () => point);
    let previous = {...encounter.zombies[0]}, travelled = 0;
    for (let i=0; i<3000 && !encounter.failed; i++) {
      encounter.update(.05, () => null);
      const z=encounter.zombies[0];
      expect(giant.clear(previous,z)).toBe(true); expect(visiblePoint(camera,z,2.5)).toBe(true);
      const distance=Math.hypot(z.x-previous.x,z.z-previous.z); expect(distance).toBeLessThanOrEqual(PRESSURE.speed*.5*.05+1e-7);
      travelled+=distance; previous={...z};
    }
    expect(encounter.failed).toBe(true); expect(encounter.breachedId).toBe(0); expect(travelled).toBeGreaterThan(30);
  });
  it('固定 seeds 覆盖所有非林地入口，接受者使用同一完整路线，占位不能消耗配额', () => {
    const encounter = new Encounter(); encounter.reset('survival','hard');
    const random=seededRandom(1729); let accepted=0;
    for (const zone of SPAWN_ZONES.filter(z=>z.center)) for(let i=0;i<8;i++) {
      const point={x:zone.center!.x+(random()*2-1)*zone.spread!.x,z:zone.center!.z+(random()*2-1)*zone.spread!.z,spawnZone:zone.id};
      const result=spawnEnemy('giant',encounter,camera,director(point),nav,giant);
      if(result) { accepted++; expect(result).toEqual(point); expect(fairApproach(result,giant,camera,2.5)).toBe(true); }
    }
    expect(accepted).toBeGreaterThan(8);
    const point={x:1.4,z:-58,spawnZone:'north-road'};
    encounter.startWave(['giant','giant'],10);
    encounter.update(.01,()=>point);
    const first=encounter.zombies[0]; first.health=1e6;
    const occupied=()=>spawnEnemy('giant',encounter,camera,director(point),nav,giant);
    expect(occupied()).toBeNull();
    encounter.update(1,()=>null); expect(encounter.waveQueue).toEqual(['giant']); expect(encounter.waveSpawned).toBe(1); expect(encounter.waveCleared).toBe(false);
    encounter.update(.05,()=>({x:-7.2,z:-34})); expect(encounter.waveSpawned).toBe(2); expect(encounter.waveKills).toBe(0);
  });
});

describe('双倍基础装填与机械边界', () => {
  it.each(WEAPONS.map((weapon,i)=>({weapon,seconds:[1.55,1.8,1.7,2.4,.4,2][i]})))('$weapon.id 使用新值、成长、预览与逐发进度', ({weapon,seconds})=>{
    const levels=freshLevels(), gun=new Firearm(weaponStats(weapon.id,levels));
    expect(gun.definition.reloadDuration).toBe(seconds);
    const grown=weaponStats(weapon.id,{...levels,reload:1}); expect(grown.reloadDuration).toBeLessThan(seconds);
    expect(upgradePreview(weapon.id,levels,'reload').some(m=>m.before===seconds&&m.after===grown.reloadDuration)).toBe(true);
    gun.ammo=0;gun.reload();gun.update(seconds-.001);expect(gun.ammo).toBe(0);
    expect(gun.animationProgress).toBeGreaterThan(.9);gun.update(.0011);expect(gun.ammo).toBe(weapon.shellReload?1:weapon.capacity);
    if(weapon.shellReload) { expect(gun.fire()).toBe(true); expect(gun.ammo).toBe(0); expect(gun.reloading).toBe(false); gun.update(5);expect(gun.ammo).toBe(0); }
  });
  it('霰弹切枪只保留已装好的整发，空膛不能靠中断伪造子弹',()=>{
    const a=new Arsenal();a.active=a.requested=4;a.gun.ammo=0;a.reload();a.update(.2);
    expect(a.fire()).toBe(false);expect(a.gun.reloading).toBe(true);
    a.update(.4);expect(a.gun.ammo).toBe(1);a.request(2);expect(a.guns[4].reloading).toBe(false);
    a.update(3);expect(a.active).toBe(2);expect(a.guns[4].ammo).toBe(1);
  });
});

describe('准备时钟边界',()=>{
  it.each([30,60])('%s FPS 首波和连续波：玩家推进3秒，敌人/刷新/成绩冻结；零点下一帧启动',fps=>{
    const e=new Encounter();e.reset('survival','hard');const gun=new Firearm(WEAPONS[2]),skill=new ActiveSkill();
    for(let wave=0;wave<2;wave++) {
      e.startWave(['normal'],SURVIVAL.maxSpawnRate);let countdown=3;const before=e.elapsed;
      gun.ammo=0;gun.reload();skill.reset();skill.press(skillStats('pistol',freshLevels()),true);
      for(let i=0;i<fps*3;i++) {
        const clocks=frameClocks('countdown',countdown,1/fps);countdown=clocks.countdown;
        gun.update(clocks.player);skill.update(clocks.player);e.update(clocks.enemy,()=>({x:0,z:-58}));
        if(i===fps) {
          const frozen=frameClocks('paused',countdown,20);expect(frozen).toEqual({player:0,enemy:0,countdown});
          expect(frameClocks('upgrade',countdown,10).player).toBe(0);
        }
      }
      expect(countdown).toBe(0);expect(gun.ammo).toBe(12);expect(skill.remaining).toBeCloseTo(2);expect(skill.cooldownRemaining).toBeCloseTo(19);
      expect(e.elapsed).toBe(before);expect(e.waveSpawned).toBe(0);
      e.update(frameClocks('playing',0,1/fps).enemy,()=>({x:0,z:-58}));expect(e.waveSpawned).toBe(1);expect(e.elapsed-before).toBeCloseTo(1/fps);
    }
  });
});
