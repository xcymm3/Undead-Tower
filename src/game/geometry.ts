import * as THREE from 'three';

export const cube = new THREE.BoxGeometry(1, 1, 1);
const materials = new Map<number, THREE.MeshStandardMaterial>();
export function material(color: number) {
  if (!materials.has(color)) materials.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.96, flatShading: true }));
  return materials.get(color)!;
}

export function box(parent: THREE.Object3D, size: [number, number, number], position: [number, number, number], color: number) {
  const mesh = new THREE.Mesh(cube, material(color));
  mesh.scale.set(...size);
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

export function seededRandom(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

/** 将静态方块按材质合批；动态靶标与枪械仍保留独立变换。 */
export function batchStaticBoxes(scene: THREE.Scene, excluded: Set<THREE.Object3D>) {
  scene.updateMatrixWorld(true);
  const batches = new Map<string, THREE.Mesh[]>();
  scene.traverse(obj => {
    if (!(obj instanceof THREE.Mesh) || obj instanceof THREE.InstancedMesh || obj.geometry !== cube || excluded.has(obj)) return;
    const mat = obj.material as THREE.Material;
    const key = `${mat.uuid}:${obj.castShadow}:${obj.receiveShadow}`;
    const group = batches.get(key) ?? [];
    group.push(obj); batches.set(key, group);
  });
  for (const meshes of batches.values()) {
    if (meshes.length < 2) continue;
    const batch = new THREE.InstancedMesh(cube, meshes[0].material, meshes.length);
    batch.castShadow = meshes[0].castShadow;
    batch.receiveShadow = meshes[0].receiveShadow;
    meshes.forEach((mesh, i) => { batch.setMatrixAt(i, mesh.matrixWorld); mesh.removeFromParent(); });
    batch.computeBoundingSphere();
    scene.add(batch);
  }
}
