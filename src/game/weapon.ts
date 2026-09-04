import * as THREE from 'three';
import { box } from './geometry';
import { reloadPose } from './reloadPose';

export function createWeapon() {
  const root = new THREE.Group();
  root.scale.setScalar(0.52);
  // 枪身采用 -Z 前向；枪管与瞄准轴严格同轴。
  box(root, [0.19, 0.24, 0.63], [0, 0, -0.26], 0x303838);
  box(root, [0.16, 0.09, 0.65], [0, 0.155, -0.29], 0x505955);
  box(root, [0.15, 0.20, 0.39], [0, -0.01, -0.76], 0x526051);
  for (let i = 0; i < 5; i++) {
    box(root, [0.17, 0.018, 0.034], [0, 0.19, -0.37 - i * 0.095], 0x202929);
    box(root, [0.008, 0.045, 0.037], [0.078, 0.01, -0.66 - i * 0.055], 0x202a2a);
  }
  box(root, [0.065, 0.065, 0.42], [0, 0, -1.13], 0x252c2d);
  box(root, [0.095, 0.09, 0.15], [0, 0, -1.395], 0x424a47);
  box(root, [0.049, 0.047, 0.008], [0, 0, -1.474], 0x141a1a);
  box(root, [0.05, 0.145, 0.047], [0, 0.115, -1.19], 0x303938);
  box(root, [0.024, 0.034, 0.024], [0, 0.202, -1.19], 0xbab599);
  // 机匣、抛壳口、拉机柄、机械照门、枪托。
  box(root, [0.012, 0.065, 0.16], [0.102, 0.06, -0.22], 0x161e1e);
  const chargingHandle = box(root, [0.075, 0.027, 0.03], [0.133, 0.086, -0.09], 0x7b8277);
  const boltRelease = box(root, [0.03, 0.05, 0.055], [-0.111, 0.018, -0.16], 0x7b8277);
  box(root, [0.025, 0.09, 0.045], [-0.066, 0.228, -0.02], 0x283130);
  box(root, [0.025, 0.09, 0.045], [0.066, 0.228, -0.02], 0x283130);
  box(root, [0.13, 0.032, 0.045], [0, 0.186, -0.02], 0x283130);
  box(root, [0.12, 0.12, 0.18], [0, 0.07, 0.13], 0x626c57);
  box(root, [0.14, 0.18, 0.06], [0, 0.065, 0.25], 0x222b2b);
  const magazine = new THREE.Group(); root.add(magazine);
  magazine.position.set(0, -0.255, -0.40);
  magazine.rotation.x = -0.15;
  box(magazine, [0.125, 0.36, 0.20], [0, 0, 0], 0x646b58);
  box(magazine, [0.135, 0.035, 0.215], [0, -0.17, 0], 0x333d35);
  for (let i = 0; i < 3; i++) box(magazine, [0.13, 0.013, 0.16], [0, 0.045 - i * 0.06, 0.01], 0x444f43);
  const oldMagazine = magazine.clone(); root.add(oldMagazine); oldMagazine.visible = false;
  box(root, [0.10, 0.22, 0.12], [0, -0.18, 0.045], 0x29332f).rotation.x = -0.25;
  // 悬浮枪械自行完成退匣、装填与枪机动作。
  const animateReload = (progress: number | null, empty: boolean) => {
    const pose = reloadPose(progress, empty);
    magazine.position.set(...pose.magazine); magazine.rotation.x = pose.magazineTilt; magazine.visible = pose.magazineVisible;
    oldMagazine.position.set(...pose.oldMagazine); oldMagazine.rotation.set(...pose.oldRotation); oldMagazine.visible = pose.oldMagazineVisible;
    chargingHandle.position.z = -0.09 + (empty && progress !== null && progress < 0.9 ? 0.065 : 0);
    boltRelease.position.x = -0.111 + pose.bolt * 0.018;
    return pose;
  };
  animateReload(null, false);

  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0, -1.49);
  root.add(muzzle);
  const flash = new THREE.Group();
  const flashMat = new THREE.MeshBasicMaterial({ color: 0xffdd86, transparent: true, opacity: 0.95, depthWrite: false });
  const flashMesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.15, 0), flashMat);
  flashMesh.scale.set(0.75, 0.75, 2.6);
  flashMesh.position.z = -0.13;
  flash.add(flashMesh);
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.085, 0), new THREE.MeshBasicMaterial({ color: 0xfff7d5 }));
  core.scale.z = 3;
  core.position.z = -0.08;
  flash.add(core);
  flash.visible = false;
  muzzle.add(flash);
  const light = new THREE.PointLight(0xffc36b, 0, 8, 2);
  muzzle.add(light);
  root.traverse(obj => {
    if (obj instanceof THREE.Mesh) { obj.castShadow = false; obj.receiveShadow = false; }
  });
  return { root, muzzle, flash, light, magazine, oldMagazine, chargingHandle, animateReload };
}
