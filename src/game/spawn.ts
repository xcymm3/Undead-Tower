import { PerspectiveCamera, Plane, Raycaster, Vector2, Vector3 } from 'three';
import { SURVIVAL } from './config';

export function spawnAtScreenEdge(camera: PerspectiveCamera, random: () => number = Math.random) {
  const depth = 22 + random() * 8;
  const center = new Vector3(0, 1, SURVIVAL.playerZ - depth).project(camera);
  const ray = new Raycaster();
  ray.setFromCamera(new Vector2(random() < 0.5 ? -1.025 : 1.025, center.y), camera);
  const point = ray.ray.intersectPlane(new Plane(new Vector3(0, 1, 0), -1), new Vector3())!;
  return { x: point.x, z: point.z, waypoint: { x: Math.sign(point.x) * Math.min(4.5, Math.abs(point.x) * 0.25), z: -6 } };
}
