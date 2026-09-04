import { describe, it, expect, vi } from 'vitest';
import { Scene, PerspectiveCamera, Raycaster, Vector3 } from 'three';
import { waveCounts, waveEnemies, waveRate, freshLevels, pistolStats, upgradeChoices, UPGRADES, ROGUE_KEY } from '../../src/game/rogue';
import { seededRandom } from '../../src/game/geometry';
import { Encounter, type Zombie } from '../../src/game/encounter';
import { Navigation, NAV_RADIUS } from '../../src/game/navigation';
import { CrowdMovement } from '../../src/game/movement';
import { teleportPoint } from '../../src/game/teleport';
import { ZOMBIE_TYPES, type ZombieKind, type RunResult } from '../../src/game/config';
import { createWorld } from '../../src/game/world';
import { SpawnDirector } from '../../src/game/spawn';
import { ZombieField } from '../../src/game/zombies';
import { rankResults, LeaderboardStore, personalRecord, LEADERBOARD_KEY } from '../../src/game/leaderboard';
const actor = (kind: ZombieKind, x = 0, z = -30): Zombie => ({ id: 1, kind, x, z, health: ZOMBIE_TYPES[kind].health, maxHealth: ZOMBIE_TYPES[kind].health, armorHealth: ZOMBIE_TYPES[kind].armor, downTime: 0, bornAt: 0 });

describe('肉鸽波次与升级', () => {
  it('名单总量固定且增长，新怪按设计引入，种子可重放', () => {
    for (let wave = 1; wave <= 100; wave++) {
      const counts = waveCounts(wave);
      expect(Object.values(counts).reduce((a,b) => a+b)).toBe(6 + 2*(wave-1));
      expect(waveEnemies(wave, seededRandom(31))).toEqual(waveEnemies(wave, seededRandom(31)));
      expect(waveRate(wave)).toBeLessThanOrEqual(10);
    }
    expect(waveCounts(3).football).toBe(0); expect(waveEnemies(4, seededRandom(1))[0]).toBe('football');
    expect(waveEnemies(6, seededRandom(1))[0]).toBe('wizard'); expect(waveEnemies(8, seededRandom(1))[0]).toBe('giant');
  });
  it('暂时全歼不提前过波，失败出生重试不丢名额，最终只生成固定总数', () => {
    const encounter = new Encounter(); encounter.reset('survival', 'hard'); encounter.startWave(['normal','cone'], 1);
    encounter.update(.1, () => null); expect(encounter.totalSpawned).toBe(0);
    encounter.update(.1, () => ({x: 0,z:-100})); expect(encounter.totalSpawned).toBe(1);
    encounter.hit(encounter.zombies[0].id, true, 1000); expect(encounter.waveCleared).toBe(false);
    encounter.update(2, () => ({x:0,z:-100})); expect(encounter.totalSpawned).toBe(2);
    encounter.hit(encounter.zombies.find(z => z.health > 0)!.id, true, 1000); expect(encounter.waveCleared).toBe(true);
    encounter.update(20, () => ({x:0,z:-100})); expect(encounter.totalSpawned).toBe(2);
  });
  it('占满槽位时保留名额，回收后继续投放', () => {
    const encounter = new Encounter(); encounter.reset('survival','hard'); encounter.startWave(['wizard'],10);
    encounter.zombies = Array.from({length:256}, (_,id) => ({...actor('normal',id*4,-10000), id}));
    encounter.update(.1, () => ({x:0,z:-1000})); expect(encounter.waveQueue).toEqual(['wizard']);
    encounter.zombies.pop(); encounter.update(.1, () => ({x:0,z:-1000})); expect(encounter.waveQueue).toEqual([]);
  });
  it('波内投放率保留分数余量，不因帧率改变总数', () => {
    const counts = [20, 60, 144].map(fps => {
      const encounter = new Encounter(); encounter.reset('survival', 'hard'); encounter.startWave(Array(100).fill('normal'), 2.15);
      for (let frame = 0; frame < fps * 10; frame++) encounter.update(1 / fps, () => ({ x: 0, z: -10000 }));
      return encounter.waveSpawned;
    });
    expect(counts).toEqual([22, 22, 22]);
  });
  it('升级公式、满级池与动画时长保持一致，不修改全局配置', () => {
    const levels = freshLevels(), base = pistolStats(levels);
    levels.damage=2; expect(pistolStats(levels).damage * 2).toBe(210);
    for (const id of Object.keys(UPGRADES) as (keyof typeof UPGRADES)[]) levels[id]=UPGRADES[id].max;
    const max = pistolStats(levels); expect(max.damage).toBe(150); expect(max.headMultiplier).toBe(3.5); expect(max.capacity).toBe(24);
    expect(max.fireDuration).toBeLessThanOrEqual(max.interval); expect(max.reloadDuration).toBeCloseTo(.53125);
    expect(upgradeChoices(levels, seededRandom(1))).toEqual([]);
    expect(new Set(upgradeChoices(freshLevels(), seededRandom(1))).size).toBe(3); expect(base.damage).toBe(75);
  });
});
describe('高级僵尸', () => {
  it('速度倍率、掉护甲后物种与总生命保持正确', () => {
    for (const [kind,speed] of [['normal',1.4],['football',2.8],['giant',.7],['wizard',1.4]] as const) {
      const z=actor(kind); new CrowdMovement().advance([z],1,1.4); expect(z.z+30).toBeCloseTo(speed);
    }
    const e=new Encounter(); e.reset('survival','hard');
    for (const kind of ['football','giant'] as const) { e.zombies=[actor(kind)]; e.hit(1,false,ZOMBIE_TYPES[kind].armor); expect(e.zombies[0].kind).toBe(kind); expect(e.zombies[0].armorHealth).toBe(0); expect(e.zombies[0].health).toBe(ZOMBIE_TYPES[kind].health-ZOMBIE_TYPES[kind].armor); }
  });
  it('瞬移保持半径且不进入障碍、其他敌人或不可见区域，无候选时原地', () => {
    const nav=new Navigation([]), z=actor('wizard');
    const point=teleportPoint(z,[z],nav,p=>p.x>0,seededRandom(77)); expect(point).not.toBeNull();
    expect(Math.hypot(point!.x,point!.z-9)).toBeCloseTo(39,10); expect(point!.x).toBeGreaterThan(0);
    expect(teleportPoint(z,[z],nav,()=>false,seededRandom(77))).toBeNull();
    const other={...actor('giant',point!.x,point!.z),id:2};
    const blocked=teleportPoint(z,[z,other],nav,p=>Math.hypot(p.x-point!.x,p.z-point!.z)<.1,seededRandom(77)); expect(blocked).toBeNull();
  });
  it('巨人头部真实可命中，护甲移除不残留碰撞', () => {
    const e=new Encounter(); e.reset('survival','hard'); e.zombies=[actor('giant')]; const field=new ZombieField(); field.sync(e);
    const ray=new Raycaster(new Vector3(0,1.83*2.5,10),new Vector3(0,0,-1));
    expect(field.decode(ray.intersectObject(field)[0])).toEqual({id:1,head:true});
    e.hit(1,false,1000); field.sync(e); expect(field.captureArmor(1,'giant')).toHaveLength(3); field.dispose();
  });
  it('真实场景存在巨人宽通道，整个身体一路无碰撞抵达', () => {
    vi.stubGlobal('document',{createElement:()=>({getContext:()=>({fillRect(){},strokeRect(){},fillText(){}})})});
    try {
      const world=createWorld(new Scene()), nav=new Navigation(world.obstacles,NAV_RADIUS*2.5);
      const camera=new PerspectiveCamera(61,1.6,.025,220); camera.position.set(0,4.8,9); camera.rotation.x=-.105; camera.updateMatrixWorld();
      const spawns=new SpawnDirector(seededRandom(31)); let tested=0;
      for(let i=0;i<32 && tested<4;i++) {
        const spawn=nav.spawn(spawns.next(camera)); if(!spawn)continue;
        const z=actor('giant',spawn.x,spawn.z), movement=new CrowdMovement(undefined,nav); let failed=false;
        for(let j=0;j<5000 && !failed;j++){const before={...z}; failed=movement.advance([z],.05,1.4).failed; expect(nav.clear(before,z)).toBe(true);}
        expect(failed,`巨人入口 ${spawn.spawnZone}`).toBe(true); tested++;
      }
      expect(tested).toBe(4);
    } finally {vi.unstubAllGlobals();}
  },20000);
});
describe('波数榜', () => {
  const result=(id:string,completed:number,waveKills:number,clearTime:number,duration=100):RunResult=>({id,difficulty:'hard',duration,kills:100,shots:100,hits:100,endedAt:'2026-09-04T00:00:00Z',rogue:{version:1,weapon:'pistol',seed:1,completed,failedWave:completed+1,waveKills,waveTotal:6+2*completed,clearTime,levels:{...freshLevels(),damage:completed}}});
  it('按通过波数、末波击杀、清波速度排序，拖延不加分，个人纪录按波数',()=>{
    const a=result('a',2,3,50,100), b=result('b',2,4,60), c=result('c',3,0,70), d=result('d',2,4,40);
    expect(rankResults([a,b,c,d]).map(r=>r.id)).toEqual(['c','d','b','a']);
    expect(personalRecord(c,[a]).difference).toBe(1); expect(personalRecord(b,[a]).status).toBe('tied');
    expect(rankResults([{...a,rogue:{...a.rogue!,failedWave:9}}])).toHaveLength(0);
  });
  it('新榜独立保存，不改旧榜，重新读取与原数据一致',()=>{
    const data=new Map([[LEADERBOARD_KEY,'old']]); const storage={getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{data.set(k,v);}};
    const store=new LeaderboardStore(storage,ROGUE_KEY); store.record(result('a',1,2,10)); expect(data.get(LEADERBOARD_KEY)).toBe('old'); expect(new LeaderboardStore(storage,ROGUE_KEY).read()).toHaveLength(1);
  });
});
