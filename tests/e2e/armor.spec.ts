import { expect, test } from '@playwright/test';
import { ZOMBIE_TYPES, zombieScale } from '../../src/game/config';

test('十类僵尸模型、命中、护甲脱落与巨人体型', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button',{name:'进入哨站'})).toBeEnabled();
  // 独立视觉夹具使用正式模块，原游戏停在静态标题页，不修改正式对局。
  const checks = await page.evaluate(async () => {
    const moduleAt = (url: string) => import(/* @vite-ignore */ url);
    const THREE = await moduleAt('/node_modules/.vite/deps/three.js') as typeof import('three');
    const { ZombieField } = await moduleAt('/src/game/zombies.ts') as typeof import('../../src/game/zombies');
    const { Encounter } = await moduleAt('/src/game/encounter.ts') as typeof import('../../src/game/encounter');
    const { ZOMBIE_TYPES } = await moduleAt('/src/game/config.ts') as typeof import('../../src/game/config');
    const { ArmorEffects } = await moduleAt('/src/game/armorEffects.ts') as typeof import('../../src/game/armorEffects');
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0x263b35);
    const camera = new THREE.PerspectiveCamera(52, innerWidth/innerHeight,.1,100); camera.position.set(0,11,24); camera.lookAt(0,2,-9);
    const renderer = new THREE.WebGLRenderer({antialias:false}); renderer.setSize(innerWidth,innerHeight);
    renderer.domElement.style.cssText='position:fixed;inset:0;z-index:100'; document.body.appendChild(renderer.domElement);
    scene.add(new THREE.HemisphereLight(0xfff0d0,0x425744,3)); const light=new THREE.DirectionalLight(0xffffff,2); light.position.set(-4,10,8); scene.add(light);
    const floor=new THREE.Mesh(new THREE.PlaneGeometry(80,80),new THREE.MeshStandardMaterial({color:0x788363})); floor.rotation.x=-Math.PI/2; scene.add(floor);
    const encounter=new Encounter(); encounter.reset('survival','hard');
    encounter.zombies=(Object.keys(ZOMBIE_TYPES) as (keyof typeof ZOMBIE_TYPES)[]).map((kind,id)=>({id,kind,x:(id%5-2)*5,z:-4-Math.floor(id/5)*10,health:ZOMBIE_TYPES[kind].health,maxHealth:ZOMBIE_TYPES[kind].health,armorHealth:ZOMBIE_TYPES[kind].armor,downTime:0,bornAt:0}));
    encounter.elapsed=.2;
    const field=new ZombieField(), effects=new ArmorEffects(); scene.add(field,effects); field.sync(encounter); scene.updateMatrixWorld(true);
    const hits=encounter.zombies.map(z=>{
      const ray=new THREE.Raycaster(new THREE.Vector3(z.x,1.83*(z.kind==='giant'?2.5:1),z.z+3),new THREE.Vector3(0,0,-1));
      return field.decode(ray.intersectObject(field)[0]);
    });
    renderer.render(scene,camera);
    window.__enemyPortrait = (id, back) => {
      const z=encounter.zombies[id], scale=z.kind==='giant'?2.5:1;
      camera.position.set(z.x+(back?2:-2)*scale,1.6*scale,z.z+(back?-5:5)*scale); camera.lookAt(z.x,1.3*scale,z.z);
      renderer.render(scene,camera);
    };
    // 保存闭包仅用于本测试页面的视觉切换，绝不进入游戏源码或生产包。
    window.__enemyFixture = () => {
      camera.position.set(0,11,24); camera.lookAt(0,2,-9);
      for(const z of encounter.zombies.filter(z=>z.armorHealth>0)) {
        const armor=field.captureArmor(z.id,z.kind); encounter.hit(z.id,false,z.armorHealth); effects.release(armor,new THREE.Vector3(0,0,-1));
      }
      effects.update(.12); field.sync(encounter); renderer.render(scene,camera);
      return {kinds:encounter.zombies.map(z=>z.kind),health:encounter.zombies.map(z=>z.health),effects:effects.diagnostics().active};
    };
    return hits;
  });
  expect(checks).toEqual(Object.keys(ZOMBIE_TYPES).map((_,id)=>({id,head:true})));
  await page.screenshot({path:test.info().outputPath('rogue-enemies.png')});
  for (const [id, kind] of Object.keys(ZOMBIE_TYPES).entries()) {
    await page.evaluate(id=>window.__enemyPortrait(id,false),id);
    await page.screenshot({path:test.info().outputPath(`enemy-${kind}-front.png`)});
    if (['skitter','charger','howler','berserker'].includes(kind)) {
      await page.evaluate(id=>window.__enemyPortrait(id,true),id);
      await page.screenshot({path:test.info().outputPath(`enemy-${kind}-back.png`)});
    }
  }
  const stripped=await page.evaluate(()=>window.__enemyFixture());
  expect(stripped.kinds).toEqual(Object.keys(ZOMBIE_TYPES).map(kind=>['cone','bucket'].includes(kind)?'normal':kind));
  expect(stripped.health).toEqual(Object.values(ZOMBIE_TYPES).map(type=>type.health-type.armor)); expect(stripped.effects).toBeGreaterThan(0);
  expect(zombieScale('giant')).toBe(2.5);
  await page.screenshot({path:test.info().outputPath('rogue-armor-off.png')});
});
declare global { interface Window { __enemyFixture: () => { kinds: string[]; health: number[]; effects: number }; __enemyPortrait: (id:number, back:boolean) => void; } }
