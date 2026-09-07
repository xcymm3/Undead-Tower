import { Box3, InstancedMesh, Matrix4, Mesh, Raycaster, Vector3, type Object3D, type Intersection } from 'three';

interface Node { bounds: Box3; children?: Node[]; meshes?: Mesh[]; }
/** Exact static geometry behind a bounding-volume tree; no WebGL renderer needed. */
export class StaticCollision {
  private root: Node;
  private meshBounds: Map<Mesh, Box3>;
  private boxPoint = new Vector3();
  constructor(surfaces: Object3D[]) {
    const meshes: Mesh[] = [];
    for (const surface of surfaces) {
      if (!(surface instanceof Mesh)) continue;
      surface.geometry.computeBoundingBox(); surface.geometry.computeBoundingSphere();
      if (surface instanceof InstancedMesh) {
        for (let i = 0; i < surface.count; i++) {
          const mesh = new Mesh(surface.geometry, surface.material), matrix = new Matrix4();
          surface.getMatrixAt(i, matrix); mesh.matrixWorld.multiplyMatrices(surface.matrixWorld, matrix); meshes.push(mesh);
        }
      } else { const mesh = new Mesh(surface.geometry, surface.material); mesh.matrixWorld.copy(surface.matrixWorld); meshes.push(mesh); }
    }
    const bounds = new Map(meshes.map(mesh => [mesh, mesh.geometry.boundingBox!.clone().applyMatrix4(mesh.matrixWorld)]));
    this.meshBounds = bounds;
    const build = (items: Mesh[]): Node => {
      const box = new Box3(); for (const mesh of items) box.union(bounds.get(mesh)!);
      if (items.length <= 6) return { bounds: box, meshes: items };
      const size = box.getSize(new Vector3()), axis = size.x >= size.y && size.x >= size.z ? 'x' : size.y >= size.z ? 'y' : 'z';
      items.sort((a, b) => bounds.get(a)!.min[axis] + bounds.get(a)!.max[axis] - bounds.get(b)!.min[axis] - bounds.get(b)!.max[axis]);
      const middle = Math.floor(items.length / 2);
      return { bounds: box, children: [build(items.slice(0, middle)), build(items.slice(middle))] };
    };
    this.root = build(meshes);
  }
  private inRange(ray: Raycaster, bounds: Box3) {
    if (bounds.containsPoint(ray.ray.origin)) return true;
    const point = ray.ray.intersectBox(bounds, this.boxPoint);
    return point !== null && ray.ray.origin.distanceToSquared(point) <= ray.far * ray.far;
  }
  intersections(ray: Raycaster) {
    const hits: Intersection[] = [];
    const visit = (node: Node) => {
      if (!this.inRange(ray, node.bounds)) return;
      if (node.meshes) { for (const mesh of node.meshes) if (this.inRange(ray, this.meshBounds.get(mesh)!)) mesh.raycast(ray, hits); }
      else node.children!.forEach(visit);
    };
    visit(this.root); return hits.sort((a, b) => a.distance - b.distance);
  }
  blocked = (origin: Vector3, target: Vector3) => {
    const delta = target.clone().sub(origin);
    const ray = new Raycaster(origin, delta.clone().normalize(), .025, delta.length() - .1), hits: Intersection[] = [];
    const visit = (node: Node): boolean => {
      if (!this.inRange(ray, node.bounds)) return false;
      if (node.meshes) {
        for (const mesh of node.meshes) {
          if (!this.inRange(ray, this.meshBounds.get(mesh)!)) continue;
          mesh.raycast(ray, hits); if (hits.length) return true;
        }
        return false;
      }
      return node.children!.some(visit);
    };
    return visit(this.root);
  };
}
