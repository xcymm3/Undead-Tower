import * as THREE from 'three';
import { cube } from './geometry';
import { ENEMY_RULES, SURVIVAL, zombieScale, zombieSpeed } from './config';
import type { ZombieKind } from './config';
import type { Encounter, Zombie } from './encounter';

type Triple = [number, number, number];
interface Part { size: Triple; position: Triple; color: number; head?: boolean; limb?: number; shirt?: boolean; kind?: ZombieKind; decor?: boolean; special?: 'windup' | 'charging' | 'command'; frost?: boolean; rage?: boolean; visualOnly?: boolean; }
const PARTS: Part[] = [
  { size: [0.64, 0.70, 0.35], position: [0, 1.18, 0], color: 0x596450, shirt: true },
  { size: [0.18, 0.24, 0.02], position: [-0.16, 1.30, 0.19], color: 0x81965d },
  { size: [0.15, 0.19, 0.02], position: [0.12, 0.91, 0.19], color: 0x859565 },
  { size: [0.49, 0.49, 0.45], position: [0, 1.79, 0], color: 0x8c9f68, head: true },
  { size: [0.48, 0.10, 0.43], position: [0, 2.02, -0.04], color: 0x42503e, head: true },
  { size: [0.09, 0.065, 0.02], position: [-0.12, 1.84, 0.236], color: 0xf1d79b, head: true },
  { size: [0.09, 0.065, 0.02], position: [0.12, 1.84, 0.236], color: 0xf1d79b, head: true },
  { size: [0.045, 0.05, 0.023], position: [-0.11, 1.84, 0.247], color: 0x9d4f3e, head: true },
  { size: [0.045, 0.05, 0.023], position: [0.13, 1.84, 0.247], color: 0x9d4f3e, head: true },
  { size: [0.22, 0.09, 0.02], position: [0.02, 1.65, 0.234], color: 0x354431, head: true },
  { size: [0.055, 0.04, 0.025], position: [-0.045, 1.68, 0.244], color: 0xc8c5a4, head: true },
  { size: [0.08, 0.15, 0.02], position: [-0.19, 1.73, 0.239], color: 0x6e784b, head: true },
  { size: [0.24, 0.71, 0.30], position: [-0.19, 0.47, 0], color: 0x3d4945, limb: 1 },
  { size: [0.24, 0.71, 0.30], position: [0.19, 0.47, 0.02], color: 0x3d4945, limb: -1 },
  { size: [0.25, 0.15, 0.42], position: [-0.19, 0.11, 0.08], color: 0x29352e, limb: 1 },
  { size: [0.25, 0.15, 0.42], position: [0.19, 0.11, 0.10], color: 0x29352e, limb: -1 },
  { size: [0.23, 0.23, 0.47], position: [-0.43, 1.30, 0.19], color: 0x596450, shirt: true, limb: 0.25 },
  { size: [0.23, 0.23, 0.47], position: [0.43, 1.27, 0.23], color: 0x596450, shirt: true, limb: -0.25 },
  { size: [0.20, 0.20, 0.26], position: [-0.44, 1.24, 0.53], color: 0x8c9f68, limb: 0.25 },
  { size: [0.20, 0.20, 0.26], position: [0.44, 1.21, 0.57], color: 0x8c9f68, limb: -0.25 },
  { size: [0.79, 0.10, 0.74], position: [0, 2.08, 0], color: 0xb95620, head: true, kind: 'cone' },
  { size: [0.61, 0.22, 0.59], position: [0, 2.24, 0], color: 0xe9822d, head: true, kind: 'cone' },
  { size: [0.46, 0.10, 0.45], position: [0, 2.40, 0], color: 0xe8e1c7, head: true, kind: 'cone' },
  { size: [0.36, 0.18, 0.35], position: [0, 2.54, 0], color: 0xe9822d, head: true, kind: 'cone' },
  { size: [0.19, 0.18, 0.18], position: [0, 2.72, 0], color: 0xf69b3e, head: true, kind: 'cone' },
  { size: [0.72, 0.11, 0.67], position: [0, 1.94, 0], color: 0x495657, head: true, kind: 'bucket' },
  { size: [0.65, 0.48, 0.60], position: [0, 2.21, 0], color: 0x9aa9ac, head: true, kind: 'bucket' },
  { size: [0.68, 0.08, 0.63], position: [0, 2.47, 0], color: 0xc0cbca, head: true, kind: 'bucket' },
  { size: [0.10, 0.25, 0.02], position: [-0.17, 2.19, 0.31], color: 0x657778, head: true, kind: 'bucket' },
  { size: [0.18, 0.08, 0.02], position: [0.09, 2.35, 0.31], color: 0xd0d6cc, head: true, kind: 'bucket' },
  { size: [0.7, 0.45, 0.62], position: [0, 2.08, 0], color: 0xa82f32, head: true, kind: 'football' },
  { size: [0.08, 0.12, 0.04], position: [-.23, 1.83, .32], color: 0xe4e4cc, head: true, kind: 'football' },
  { size: [0.08, 0.12, 0.04], position: [.23, 1.83, .32], color: 0xe4e4cc, head: true, kind: 'football' },
  { size: [0.52, 0.06, 0.05], position: [0, 1.84, .34], color: 0xe4e4cc, head: true, kind: 'football' },
  { size: [1.02, 0.28, 0.52], position: [0, 1.48, 0], color: 0xa82f32, kind: 'football' },
  { size: [.08, .25, .025], position: [-.08, 1.18, .2], color: 0xffedd0, kind: 'football', decor: true },
  { size: [.08, .25, .025], position: [.08, 1.18, .2], color: 0xffedd0, kind: 'football', decor: true },
  { size: [.6, .32, .54], position: [0, 2.1, -.02], color: 0x745035, head: true, kind: 'giant' },
  { size: [.65, .10, .59], position: [0, 1.94, -.02], color: 0x402e23, head: true, kind: 'giant' },
  { size: [.07, .32, .56], position: [0, 2.12, -.02], color: 0xb6986a, head: true, kind: 'giant' },
  { size: [.8, .66, .45], position: [0, .68, -.05], color: 0x44345f, kind: 'wizard', decor: true },
  { size: [.76, .96, .08], position: [0, 1.07, -.25], color: 0x644678, kind: 'wizard', decor: true },
  { size: [.8, .10, .76], position: [0, 2.08, 0], color: 0x4d326b, head: true, kind: 'wizard', decor: true },
  { size: [.5, .22, .48], position: [0, 2.23, 0], color: 0x765197, head: true, kind: 'wizard', decor: true },
  { size: [.3, .25, .3], position: [0, 2.46, 0], color: 0x765197, head: true, kind: 'wizard', decor: true },
  { size: [.12, .22, .12], position: [.03, 2.68, 0], color: 0xa47acf, head: true, kind: 'wizard', decor: true },
  { size: [.15, .15, .04], position: [0, 1.38, .21], color: 0xd6b96b, kind: 'wizard', decor: true },
  { size: [.88, .32, .48], position: [0, 1.38, -.2], color: 0x6b4a32, kind: 'charger', decor: true },
  { size: [.18, .18, .82], position: [-.42, 1.28, .48], color: 0xd59a45, kind: 'charger', decor: true },
  { size: [.18, .18, .82], position: [.42, 1.28, .48], color: 0xd59a45, kind: 'charger', decor: true },
  { size: [1.25, .055, .055], position: [0, .12, 0], color: 0xffb64f, kind: 'charger', decor: true, special: 'windup', visualOnly: true },
  { size: [.38, .17, .45], position: [-.45, 1.53, .02], color: 0x407983, kind: 'skitter', decor: true },
  { size: [.16, .5, .08], position: [-.23, 1.21, .22], color: 0x8fc1b7, kind: 'skitter', decor: true },
  { size: [.22, .25, .36], position: [.20, .47, .05], color: 0x223e45, kind: 'skitter', decor: true, limb: -1 },
  { size: [.62, .14, .53], position: [0, 1.99, 0], color: 0xa33e30, kind: 'berserker', decor: true, head: true },
  { size: [.14, .75, .07], position: [-.20, 1.18, .22], color: 0x9a332b, kind: 'berserker', decor: true },
  { size: [.14, .75, .07], position: [.20, 1.18, .22], color: 0x9a332b, kind: 'berserker', decor: true },
  { size: [.19, .18, .09], position: [0, 1.41, .24], color: 0x702c27, kind: 'berserker', decor: true, rage: true },
  { size: [.76, .9, .42], position: [0, 1.20, -.38], color: 0x365367, kind: 'howler', decor: true },
  { size: [.18, .62, .18], position: [-.42, 1.62, -.18], color: 0x7fb6b2, kind: 'howler', decor: true },
  { size: [.18, .62, .18], position: [.42, 1.62, -.18], color: 0x7fb6b2, kind: 'howler', decor: true },
  { size: [.62, .16, .12], position: [0, 2.12, .22], color: 0xe2c86d, kind: 'howler', decor: true },
  ...([-1, 1] as const).flatMap(side => [
    { size: [2, .045, .055], position: [0, .055, side] },
    { size: [.055, .045, 2], position: [side, .055, 0] },
  ].map(part => ({ ...part, size: part.size as Triple, position: part.position as Triple, color: 0x72d4d0, kind: 'howler' as const, decor: true, special: 'command' as const, visualOnly: true }))),
  { size: [.46, .055, .055], position: [0, 2.62, 0], color: 0x72d4d0, special: 'command', visualOnly: true },
  { size: [.055, .46, .055], position: [0, 2.62, 0], color: 0x72d4d0, special: 'command', visualOnly: true },
  { size: [.38, .055, .055], position: [0, 2.98, 0], color: 0x82cdd2, frost: true, visualOnly: true },
  { size: [.055, .38, .055], position: [0, 2.98, 0], color: 0x82cdd2, frost: true, visualOnly: true },
  { size: [.055, .055, .38], position: [0, 2.98, 0], color: 0x82cdd2, frost: true, visualOnly: true },
];
const SHIRTS = [0x596450, 0x6c585a, 0x546877, 0x827157].map(color => new THREE.Color(color));
const COLORS = PARTS.map(part => new THREE.Color(part.color));
const BREACH_COLOR = new THREE.Color(0xffd297);

/** 整个尸群共用一个 InstancedMesh；命中先按僵尸包围盒筛选，再检查实际方块。 */
export class ZombieField extends THREE.InstancedMesh {
  private enemies: Zombie[] = [];
  private root = new THREE.Object3D();
  private part = new THREE.Object3D();
  private partMatrix = new THREE.Matrix4();
  private inverse = new THREE.Matrix4();
  private localRay = new THREE.Ray();
  private broadBox = new THREE.Box3();
  private unitBox = new THREE.Box3(new THREE.Vector3(-0.5, -0.5, -0.5), new THREE.Vector3(0.5, 0.5, 0.5));
  private point = new THREE.Vector3();
  private previousIds = '';
  private collisionEncounter?: Encounter;
  private collisionSynced = new Set<number>();

  constructor() {
    super(cube, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true }), SURVIVAL.maxZombies * PARTS.length);
    this.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.count = 0;
    this.frustumCulled = false;
    this.castShadow = true;
    this.receiveShadow = true;
  }

  sync(encounter: Encounter, breachProgress = 0) {
    this.collisionEncounter = undefined;
    this.enemies = encounter.zombies;
    const ids = `${encounter.breachedId}|${this.enemies.map(z => `${z.id}:${z.kind}:${z.armorHealth > 0}:${!!z.enraged}:${z.specialState}:${(z.commandRemaining ?? 0) > 0}:${(z.slowRemaining ?? 0) > 0}`).join(',')}`;
    const colorsChanged = ids !== this.previousIds;
    this.previousIds = ids;
    this.count = this.enemies.length * PARTS.length;
    this.enemies.forEach((_, index) => this.syncEnemy(encounter, index, colorsChanged, breachProgress));
    this.instanceMatrix.needsUpdate = true;
    if (colorsChanged && this.instanceColor) this.instanceColor.needsUpdate = true;
  }

  /** Headless simulation reuses the exact production pose, only for ray candidates. */
  syncCollision(encounter: Encounter) {
    this.enemies = encounter.zombies;
    this.collisionEncounter = encounter;
    this.collisionSynced.clear();
  }

  private syncEnemy(encounter: Encounter, index: number, colorsChanged: boolean, breachProgress = 0) {
      const zombie = this.enemies[index];
      const culprit = zombie.id === encounter.breachedId;
      const lunge = culprit ? Math.sin(Math.PI * Math.min(1, breachProgress / 0.8)) : 0;
      const moving = encounter.mode === 'survival' && zombie.health > 0;
      const stride = moving ? Math.sin((encounter.elapsed - zombie.bornAt + (culprit ? breachProgress * 1.4 : 0)) * 5 * zombieSpeed(zombie.kind) * (zombie.enraged ? ENEMY_RULES.berserker.speedMultiplier : 1) + zombie.id * 2) : 0;
      const downDuration = encounter.mode === 'practice' ? 3 : 0.85;
      const fall = zombie.health === 0 ? Math.min(Math.PI / 2, (downDuration - zombie.downTime) * 5) : 0;
      this.root.position.set(zombie.x, moving ? Math.abs(stride) * 0.025 : 0, zombie.z);
      const goal = { x: SURVIVAL.playerX, z: SURVIVAL.playerZ };
      this.root.rotation.set(-fall, encounter.mode === 'survival' ? zombie.heading ?? Math.atan2(goal.x - zombie.x, goal.z - zombie.z) : 0, 0, 'YXZ');
      if (moving && zombie.kind === 'skitter') this.root.rotation.z = Math.sin((zombie.motionAge ?? 0) * ENEMY_RULES.skitter.frequency + zombie.id * 2) * .18;
      if (moving && zombie.kind === 'charger' && zombie.specialState === 'windup') this.root.rotation.x = -.2;
      if (moving && zombie.kind === 'charger' && zombie.specialState === 'charging') this.root.rotation.x = .28;
      if (moving && zombie.kind === 'howler' && zombie.specialState === 'windup') this.root.rotation.x = -.26;
      if (moving && zombie.enraged) this.root.rotation.x = .16;
      if (culprit) {
        this.root.rotation.y = Math.atan2(goal.x - zombie.x, goal.z - zombie.z);
        this.root.rotation.x += lunge * 0.16;
        this.root.position.x += Math.sin(this.root.rotation.y) * lunge * 0.3;
        this.root.position.z += Math.cos(this.root.rotation.y) * lunge * 0.3;
      }
      this.root.scale.setScalar(zombieScale(zombie.kind));
      this.root.updateMatrix();
      PARTS.forEach((part, partIndex) => {
        this.part.position.set(...part.position);
        this.part.position.z += stride * (part.limb ?? 0) * 0.12;
        if (part.limb && Math.abs(part.limb) < 1) this.part.position.z += lunge * 0.28;
        this.part.rotation.set(stride * (part.limb ?? 0) * 0.14, 0, 0);
        this.part.scale.set(...part.size);
        if (part.frost && ((zombie.slowRemaining ?? 0) <= 0 || zombie.health <= 0)) this.part.scale.setScalar(0);
        if (part.special === 'windup' && zombie.specialState !== 'windup') this.part.scale.setScalar(0);
        if (part.special === 'charging' && zombie.specialState !== 'charging') this.part.scale.setScalar(0);
        if (part.special === 'command') {
          const sourceMarker = part.kind === 'howler';
          const active = sourceMarker ? zombie.specialState === 'windup' : (zombie.commandRemaining ?? 0) > 0;
          const radius = sourceMarker ? 1 + Math.sin((zombie.motionAge ?? 0) * 10) * .15 : .7;
          this.part.position.x *= radius; this.part.position.z *= radius; this.part.scale.x *= radius; this.part.scale.z *= radius;
          if (!active || zombie.health <= 0) this.part.scale.setScalar(0);
        }
        if (part.kind && (part.kind !== zombie.kind || (!part.decor && zombie.armorHealth <= 0))) this.part.scale.setScalar(0);
        this.part.updateMatrix();
        this.partMatrix.multiplyMatrices(this.root.matrix, this.part.matrix);
        const instance = index * PARTS.length + partIndex;
        this.setMatrixAt(instance, this.partMatrix);
        if (colorsChanged) {
          const color = (part.shirt ? SHIRTS[zombie.id % SHIRTS.length] : COLORS[partIndex]).clone();
          if (part.shirt && zombie.kind === 'football') color.setHex(0xa82f32);
          if (part.shirt && zombie.kind === 'wizard') color.setHex(0x644678);
          if (part.shirt && zombie.kind === 'giant') color.setHex(0x715c43);
          if (part.shirt && zombie.kind === 'skitter') color.setHex(0x38606a);
          if (part.shirt && zombie.kind === 'charger') color.setHex(0x6b4a32);
          if (part.shirt && zombie.kind === 'howler') color.setHex(0x365367);
          if (part.rage && zombie.enraged) color.setHex(0xff794c);
          if (part.shirt && zombie.enraged) color.setHex(0x973b2a);
          if (part.shirt && (zombie.slowRemaining ?? 0) > 0) color.lerp(new THREE.Color(0x70d5ef), .7);
          if (part.shirt && (zombie.commandRemaining ?? 0) > 0) color.lerp(new THREE.Color(0x72d4d0), .55);
          if (encounter.failed) { if (culprit) color.lerp(BREACH_COLOR, 0.18); else color.multiplyScalar(0.42); }
          this.setColorAt(instance, color);
        }
      });
  }

  captureArmor(id: number, kind: ZombieKind) {
    const index = this.enemies.findIndex(zombie => zombie.id === id);
    if (index < 0 || kind === 'normal') return [];
    return PARTS.flatMap((part, partIndex) => {
      if (part.kind !== kind || part.decor) return [];
      const matrix = new THREE.Matrix4();
      this.getMatrixAt(index * PARTS.length + partIndex, matrix);
      return [{ matrix, color: part.color }];
    });
  }

  override raycast(raycaster: THREE.Raycaster, intersections: THREE.Intersection[]) {
    this.enemies.forEach((zombie, index) => {
      if (zombie.health <= 0) return;
      const scale = zombieScale(zombie.kind);
      this.broadBox.min.set(zombie.x - scale, -0.1, zombie.z - scale);
      this.broadBox.max.set(zombie.x + scale, 2.9 * scale, zombie.z + scale);
      if (!raycaster.ray.intersectsBox(this.broadBox)) return;
      if (this.collisionEncounter && !this.collisionSynced.has(index)) {
        this.syncEnemy(this.collisionEncounter, index, false);
        this.collisionSynced.add(index);
      }
      let nearest: THREE.Intersection | undefined;
      for (let partIndex = 0; partIndex < PARTS.length; partIndex++) {
        const part = PARTS[partIndex];
        if (part.visualOnly) continue;
        if (part.kind && (part.kind !== zombie.kind || (!part.decor && zombie.armorHealth <= 0))) continue;
        const instanceId = index * PARTS.length + partIndex;
        this.getMatrixAt(instanceId, this.partMatrix);
        this.inverse.copy(this.partMatrix).invert();
        this.localRay.copy(raycaster.ray).applyMatrix4(this.inverse);
        if (!this.localRay.intersectBox(this.unitBox, this.point)) continue;
        this.point.applyMatrix4(this.partMatrix);
        const distance = raycaster.ray.origin.distanceTo(this.point);
        if (distance < raycaster.near || distance > raycaster.far || (nearest && nearest.distance <= distance)) continue;
        nearest = { distance, point: this.point.clone(), object: this, instanceId };
      }
      if (nearest) intersections.push(nearest);
    });
  }

  decode(hit: THREE.Intersection | undefined) {
    if (!hit || hit.object !== this || hit.instanceId === undefined) return null;
    const zombie = this.enemies[Math.floor(hit.instanceId / PARTS.length)];
    return zombie ? { id: zombie.id, head: Boolean(PARTS[hit.instanceId % PARTS.length].head) } : null;
  }
}
