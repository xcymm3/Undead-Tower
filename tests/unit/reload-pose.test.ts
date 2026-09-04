import { describe, expect, it } from 'vitest';
import { reloadPose } from '../../src/game/reloadPose';
import { createWeapon } from '../../src/game/weapon';

describe('换弹动作', () => {
  it('抽出、掉落、插入与复位使用独立弹匣，空仓才释放枪机', () => {
    expect(reloadPose(0.3).magazine[1]).toBeLessThan(-0.55);
    expect(reloadPose(0.39).oldMagazineVisible).toBe(true);
    expect(reloadPose(0.39).magazineVisible).toBe(false);
    expect(reloadPose(0.55).magazineVisible).toBe(true);
    expect(reloadPose(0.75).magazine[1]).toBeGreaterThan(-0.27);
    expect(reloadPose(0.88, true).bolt).toBeGreaterThan(0.9);
    expect(reloadPose(0.88, false).bolt).toBe(0);
    expect(reloadPose(1, true)).toEqual(reloadPose(null, true));
  });
  it('相同进度得到相同姿态，部件复位且不在帧间新增模型', () => {
    const weapon = createWeapon(); const count = weapon.root.children.length;
    weapon.animateReload(0.4, true);
    const position = weapon.magazine.position.toArray();
    weapon.animateReload(0.4, true);
    expect(weapon.magazine.position.toArray()).toEqual(position);
    weapon.animateReload(null, false);
    expect(weapon.magazine.position.toArray()).toEqual([0, -0.255, -0.4]);
    expect(weapon.oldMagazine.visible).toBe(false); expect(weapon.magazine.visible).toBe(true);
    expect(weapon.root.children).toHaveLength(count);
  });
});
