import * as THREE from 'three';
import { cube } from './geometry';

interface Fragment { matrix: THREE.Matrix4; color: number; }
interface Armor { parts: Fragment[]; position: THREE.Vector3; velocity: THREE.Vector3; age: number; bounced: boolean; spin: number; }

/** 脱落护具保留实际模型形状，共用一次实例绘制，最多同时保留 24 件。 */
export class ArmorEffects extends THREE.InstancedMesh {
  private pieces: Armor[] = [];
  private transform = new THREE.Object3D();
  private partMatrix = new THREE.Matrix4();
  private color = new THREE.Color();
  private released = 0;

  constructor() {
    super(cube, new THREE.MeshStandardMaterial({ roughness: 0.85 }), 24 * 5);
    this.count = 0;
    this.frustumCulled = false;
    this.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  }

  release(parts: Fragment[], direction: THREE.Vector3) {
    if (!parts.length) return;
    const position = new THREE.Vector3();
    for (const part of parts) position.add(new THREE.Vector3().setFromMatrixPosition(part.matrix));
    position.divideScalar(parts.length);
    const inverse = new THREE.Matrix4().makeTranslation(-position.x, -position.y, -position.z);
    for (const part of parts) part.matrix.premultiply(inverse);
    const spin = this.released++ % 2 ? -1 : 1;
    this.pieces.push({ parts, position, velocity: new THREE.Vector3(direction.x * 1.2 + spin * 1.1, 2.7, direction.z * 1.2), age: 0, bounced: false, spin });
    if (this.pieces.length > 24) this.pieces.shift();
    this.sync();
  }

  update(delta: number) {
    for (const piece of this.pieces) {
      piece.age += delta;
      piece.velocity.y -= 7 * delta;
      piece.position.addScaledVector(piece.velocity, delta);
      if (piece.position.y < 0.45) {
        piece.position.y = 0.45;
        piece.velocity.y = piece.bounced ? 0 : Math.abs(piece.velocity.y) * 0.25;
        piece.velocity.x *= 0.5; piece.velocity.z *= 0.5;
        piece.bounced = true;
      }
    }
    this.pieces = this.pieces.filter(piece => piece.age < 2);
    this.sync();
  }

  private sync() {
    let index = 0;
    for (const piece of this.pieces) {
      this.transform.position.copy(piece.position);
      this.transform.rotation.set(piece.age * 3.4, piece.age * piece.spin * 2, piece.age * piece.spin * 4);
      this.transform.scale.setScalar(Math.min(1, (2 - piece.age) / 0.35));
      this.transform.updateMatrix();
      for (const part of piece.parts) {
        this.partMatrix.multiplyMatrices(this.transform.matrix, part.matrix);
        this.setMatrixAt(index, this.partMatrix);
        this.setColorAt(index++, this.color.setHex(part.color));
      }
    }
    this.count = index;
    this.instanceMatrix.needsUpdate = true;
    if (this.instanceColor) this.instanceColor.needsUpdate = true;
  }

  reset() { this.pieces = []; this.released = 0; this.sync(); }
  diagnostics() { return { active: this.pieces.length, released: this.released, positions: this.pieces.map(p => p.position.toArray()) }; }
}
