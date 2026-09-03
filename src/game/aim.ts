import { MathUtils, Quaternion, Vector2, Vector3 } from 'three';
import { CONFIG } from './config';

/** 瞄准值来自屏幕绝对位置，绝不累积鼠标位移，所以无法转身。 */
export function pointerToNdc(x: number, y: number, width: number, height: number): Vector2 {
  return new Vector2(MathUtils.clamp(x / width * 2 - 1, -1, 1), MathUtils.clamp(1 - y / height * 2, -1, 1));
}

/** 指数阻尼与帧率无关；镜头总是在固定朝向的小锥体内。 */
export function dampView(current: Vector2, aim: Vector2, delta: number, damping: number = CONFIG.camera.damping): Vector2 {
  const alpha = 1 - Math.exp(-damping * Math.max(0, delta));
  return new Vector2(
    MathUtils.lerp(current.x, -MathUtils.clamp(aim.x, -1, 1) * CONFIG.camera.yawLimit, alpha),
    MathUtils.lerp(current.y, MathUtils.clamp(aim.y, -1, 1) * CONFIG.camera.pitchLimit, alpha),
  );
}

/** 模型以本地 -Z 为枪管轴，枪管和最终子弹共享这条方向。 */
export function weaponQuaternion(origin: Vector3, target: Vector3): Quaternion {
  return new Quaternion().setFromUnitVectors(new Vector3(0, 0, -1), target.clone().sub(origin).normalize());
}
