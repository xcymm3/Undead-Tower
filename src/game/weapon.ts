import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { WEAPONS } from './weapons';
import type { WeaponDefinition } from './weapons';

type Pose = { node: THREE.Object3D; position: THREE.Vector3; quaternion: THREE.Quaternion; scale: THREE.Vector3 };
const smooth = (t: number) => { t = THREE.MathUtils.clamp(t, 0, 1); return t * t * (3 - 2 * t); };
export type WeaponAnimation = 'idle' | 'fire' | 'reload';
// FBX 导出的 Blender 材质在 Three.js 中只有白色漫反射；按原部件名重建本地配色。
const MATERIAL_COLORS: Record<string, number> = {
  Metal: 0x647078, DarkMetal: 0x3b464d, DarkerMetal: 0x30383e,
  Black: 0x20292c, Barrels: 0x343f45, Barrel: 0x343f45, Muzzle: 0x242e33,
  Magazine: 0x38444a, Trigger: 0x899397, LightWood: 0x9c6945, DarkWood: 0x583b29, Wood: 0x7d5135,
  BulletYellow: 0xcaa34c, BulletOrange: 0xb37845, BulletTip: 0xb58d57, BulletRed: 0x984038, Green: 0x53624b,
  'Material.001': 0x263438, 'Material.002': 0x697b74, 'Material.003': 0x4b5b50, 'Material.004': 0x303d36,
};

export function prepareWeapon(model: THREE.Group, definition: WeaponDefinition) {
  // 原资源的左轮网格与弹药骨骼同名，否则 AnimationMixer 会错误地移动整个网格。
  model.traverse(node => { if (node instanceof THREE.Mesh && node.name === 'Bullets') node.name = 'RevolverMesh'; });
  const fireSource = model.animations.find(clip => clip.name.endsWith('|FireWOBullet'))
    ?? model.animations.find(clip => clip.name.includes('Armature|Fire'))!;
  const reloadSource = model.animations.find(clip => clip.name.endsWith('|Reload'))!;
  if (!fireSource || !reloadSource) throw new Error(`缺少枪械动画：${definition.id}`);
  const mixer = new THREE.AnimationMixer(model);
  const initial = mixer.clipAction(fireSource); initial.play(); mixer.update(0); model.updateMatrixWorld(true);
  const rest: Pose[] = [];
  model.traverse(node => rest.push({ node, position: node.position.clone(), quaternion: node.quaternion.clone(), scale: node.scale.clone() }));
  mixer.stopAllAction();
  const restore = () => rest.forEach(p => { p.node.position.copy(p.position); p.node.quaternion.copy(p.quaternion); p.node.scale.copy(p.scale); });
  restore(); model.updateMatrixWorld(true);
  const boneNames = new Set<string>(); model.traverse(node => { if (node instanceof THREE.Bone) boneNames.add(node.name); });
  const clip = (source: THREE.AnimationClip, firing: boolean) => new THREE.AnimationClip(source.name, source.duration,
    source.tracks.filter(track => { const name = track.name.slice(0, track.name.lastIndexOf('.')); return boneNames.has(name) && (!firing || name !== 'Control'); }).map(track => track.clone()));
  const clips = { fire: clip(fireSource, true), reload: clip(reloadSource, false) };
  // 原包把泵柄/枪栓运动放在 Reload 中；射击后也复用这些局部轨迹，不带动弹匣。
  const cycleBone = definition.id === 'shotgun' ? 'Reload' : definition.id === 'sniper' ? 'Handle' : null;
  if (cycleBone) for (const track of reloadSource.tracks.filter(track => track.name.startsWith(`${cycleBone}.`))) {
    const cycle = track.clone();
    cycle.times = Float32Array.from(track.times, t => clips.fire.duration * (0.18 + 0.72 * t / reloadSource.duration));
    clips.fire.tracks = clips.fire.tracks.filter(existing => existing.name !== cycle.name);
    clips.fire.tracks.push(cycle);
  }
  const actions = { fire: mixer.clipAction(clips.fire), reload: mixer.clipAction(clips.reload) };
  const points: THREE.Vector3[] = [], axisRotation = new THREE.Matrix4().makeRotationY(definition.rotationY);
  const oldMaterials = new Set<THREE.Material>();
  model.traverse(node => {
    if (!(node instanceof THREE.Mesh)) return;
    const geometry = node.geometry;
    for (let i = 0; i < geometry.attributes.position.count; i++) {
      // 发射物/快速装填器在原始待机中藏在远处，不能参与枪身尺寸或枪口的计算。
      if (node instanceof THREE.SkinnedMesh) {
        let bodyWeight = 0;
        for (let j = 0; j < 4; j++) {
          const bone = node.skeleton.bones[geometry.attributes.skinIndex.getComponent(i, j)];
          if (bone && !['Bullet', 'Bullets', 'Quick'].includes(bone.name)) bodyWeight += geometry.attributes.skinWeight.getComponent(i, j);
        }
        if (bodyWeight < 0.5) continue;
      }
      points.push(node.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(node.matrixWorld).applyMatrix4(axisRotation));
    }
    const convert = (material: THREE.Material) => {
      oldMaterials.add(material);
      const result = new THREE.MeshStandardMaterial({ name: material.name, color: MATERIAL_COLORS[material.name] ?? 0x59636a,
        roughness: /Wood|Green|Material/.test(material.name) ? 0.9 : 0.55,
        metalness: /Wood|Green|Material/.test(material.name) ? 0 : 0.28, flatShading: true });
      return result;
    };
    node.material = Array.isArray(node.material) ? node.material.map(convert) : convert(node.material);
    node.castShadow = false; node.receiveShadow = false; node.frustumCulled = false;
  });
  oldMaterials.forEach(material => material.dispose());
  const bounds = new THREE.Box3().setFromPoints(points), length = bounds.max.z - bounds.min.z;
  const front = new THREE.Box3().setFromPoints(points.filter(p => p.z < bounds.min.z + length * 0.015)).getCenter(new THREE.Vector3());
  const scale = definition.length / length;
  const holder = new THREE.Group(), orientation = new THREE.Group();
  orientation.rotation.y = definition.rotationY; orientation.add(model); holder.add(orientation);
  holder.scale.setScalar(scale);
  const muzzleZ = -definition.length * 0.72;
  holder.position.set(-front.x * scale, -front.y * scale, muzzleZ - front.z * scale);
  let lastKind = '', lastProgress = -1;
  const sample = (kind: WeaponAnimation, progress = 0) => {
    if (lastKind === kind && lastProgress === progress) return;
    lastKind = kind; lastProgress = progress;
    mixer.stopAllAction(); restore();
    if (kind !== 'idle') {
      const action = actions[kind]; action.reset().setLoop(THREE.LoopOnce, 1); action.clampWhenFinished = true;
      action.play(); action.paused = true; action.time = THREE.MathUtils.clamp(progress, 0, 1) * clips[kind].duration; mixer.update(0);
      // 片段两端回到统一待机姿态，消除不同导出动作间的位姿跳变。
      const weight = smooth(progress / 0.08) * smooth((1 - progress) / 0.12);
      if (weight === 0) restore();
      else rest.forEach(p => {
        p.node.position.lerp(p.position, 1 - weight);
        // 从当前采样姿态向待机插值，避免 slerpQuaternions 的目标别名覆盖动画旋转。
        p.node.quaternion.slerp(p.quaternion, 1 - weight);
        p.node.scale.lerp(p.scale, 1 - weight);
      });
    }
    model.updateMatrixWorld(true);
  };
  sample('idle');
  return { holder, model, sample, muzzleZ, clips, mixer, rest, diagnostics: () => ({ kind: lastKind, progress: lastProgress, bones: rest.filter(p => p.node instanceof THREE.Bone).map(p => ({ name: p.node.name, position: p.node.position.toArray(), quaternion: p.node.quaternion.toArray() })) }) };
}

export class WeaponView {
  readonly root = new THREE.Group();
  readonly offhand = new THREE.Group();
  readonly offhandMuzzle = new THREE.Object3D();
  readonly offhandFlash = new THREE.Group();
  readonly muzzle = new THREE.Object3D();
  readonly flash = new THREE.Group();
  readonly light = new THREE.PointLight(0xffc36b, 0, 8, 2);
  readonly ready: Promise<void>;
  private rigs: ReturnType<typeof prepareWeapon>[] = [];
  private offhandRig?: ReturnType<typeof prepareWeapon>;
  private active = 0;
  private disposed = false;
  loaded = false;
  constructor() {
    this.root.add(this.muzzle); this.muzzle.add(this.flash, this.light);
    const flame = new THREE.Mesh(new THREE.OctahedronGeometry(0.07, 0), new THREE.MeshBasicMaterial({ color: 0xffdd86, depthWrite: false }));
    flame.scale.set(0.75, 0.75, 2.6); flame.position.z = -0.065; this.flash.add(flame); this.flash.visible = false;
    this.offhand.add(this.offhandMuzzle); this.offhandMuzzle.add(this.offhandFlash);
    this.offhandFlash.add(flame.clone()); this.offhand.visible = false;
    const loader = new FBXLoader();
    this.ready = Promise.all(WEAPONS.map(async definition => {
      const model = await loader.loadAsync(`${import.meta.env.BASE_URL}models/weapons/${definition.model}.fbx`);
      if (definition.id === 'pistol') {
        const copy = clone(model) as THREE.Group; copy.animations = model.animations;
        const offhand = prepareWeapon(copy, definition);
        if (this.disposed) disposeModel(offhand.holder);
        else { this.offhandRig = offhand; this.offhand.add(offhand.holder); this.offhandMuzzle.position.z = offhand.muzzleZ; }
      }
      const rig = prepareWeapon(model, definition);
      if (this.disposed) { disposeModel(rig.holder); return null; }
      rig.holder.visible = false; this.root.add(rig.holder); return rig;
    })).then(rigs => {
      if (this.disposed) return;
      this.rigs = rigs.filter(rig => rig !== null); this.loaded = true; this.select(0);
    });
  }
  select(index: number) {
    this.active = index;
    this.rigs.forEach((rig, i) => { rig.holder.visible = i === index; if (i === index) rig.sample('idle'); });
    this.muzzle.position.set(0, 0, this.rigs[index]?.muzzleZ ?? -0.65);
    this.flash.visible = false; this.light.intensity = 0;
  }
  animate(kind: WeaponAnimation, progress: number) { this.rigs[this.active]?.sample(kind, progress); if (this.offhand.visible) this.offhandRig?.sample(kind, progress); }
  diagnostics() { return { loaded: this.loaded, model: WEAPONS[this.active].model, visibleModels: this.rigs.filter(rig => rig.holder.visible).length, ...this.rigs[this.active]?.diagnostics() }; }
  dispose() { this.disposed = true; [...this.rigs, ...(this.offhandRig ? [this.offhandRig] : [])].forEach(rig => {
    rig.mixer.stopAllAction(); rig.mixer.uncacheRoot(rig.model);
    rig.model.traverse(node => { if (node instanceof THREE.SkinnedMesh) node.skeleton.dispose(); });
  }); }
}
function disposeModel(root: THREE.Object3D) {
  root.traverse(node => { if (node instanceof THREE.Mesh) { if (node instanceof THREE.SkinnedMesh) node.skeleton.dispose(); node.geometry.dispose(); (Array.isArray(node.material) ? node.material : [node.material]).forEach(m => m.dispose()); } });
}
