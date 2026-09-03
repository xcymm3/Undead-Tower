import { describe, expect, it } from 'vitest';
import { Vector2, Vector3 } from 'three';
import { dampView, pointerToNdc, weaponQuaternion } from '../../src/game/aim';
import { CONFIG } from '../../src/game/config';

describe('有限视角契约', () => {
  it('绝对屏幕坐标映射，越界输入仍被钳制', () => {
    expect(pointerToNdc(720, 450, 1440, 900).toArray()).toEqual([0, 0]);
    expect(pointerToNdc(1440, 0, 1440, 900).toArray()).toEqual([1, 1]);
    expect(pointerToNdc(-9999, 9999, 1440, 900).toArray()).toEqual([-1, -1]);
  });
  it('极限输入持续一万帧仍不能转身', () => {
    let view = new Vector2();
    for (let i = 0; i < 10000; i++) view = dampView(view, new Vector2(100, -100), 1 / 60);
    expect(Math.abs(view.x)).toBeLessThanOrEqual(CONFIG.camera.yawLimit);
    expect(Math.abs(view.y)).toBeLessThanOrEqual(CONFIG.camera.pitchLimit);
    expect(view.x).toBeCloseTo(-CONFIG.camera.yawLimit, 8);
  });
  it('镜头确实转动，但第一帧仅移动最终角度的很小部分', () => {
    const step = dampView(new Vector2(), new Vector2(1, 1), 1 / 60);
    expect(step.x).toBeLessThan(0);
    expect(step.y).toBeGreaterThan(0);
    expect(Math.abs(step.x)).toBeLessThan(CONFIG.camera.yawLimit * 0.05);
  });
  it('30 FPS 与 144 FPS 的一秒结果相同', () => {
    const advance = (fps: number) => {
      let view = new Vector2();
      for (let i = 0; i < fps; i++) view = dampView(view, new Vector2(0.8, -0.6), 1 / fps);
      return view;
    };
    expect(advance(30).distanceTo(advance(144))).toBeLessThan(1e-10);
  });
  it('从左右上下角瞄准时，枪管和枪口射线穿过同一个目标', () => {
    const origin = new Vector3(0.46, -0.43, -0.62);
    for (const x of [-20, 0, 20]) for (const y of [-15, 0, 15]) {
      const target = new Vector3(x, y, -30);
      const direction = new Vector3(0, 0, -1).applyQuaternion(weaponQuaternion(origin, target));
      const muzzle = origin.clone().addScaledVector(direction, 1.49);
      const expected = target.clone().sub(muzzle).normalize();
      expect(direction.dot(expected)).toBeCloseTo(1, 12);
    }
  });
});
