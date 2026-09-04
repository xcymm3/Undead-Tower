import * as THREE from 'three';
import { SURVIVAL } from './config';
import type { Encounter } from './encounter';

function markerEdges() {
  const box = new THREE.BoxGeometry(1.1, 2.95, 1.1);
  const edges = new THREE.EdgesGeometry(box);
  box.dispose();
  return edges;
}

/** 可见边线与判定共用 8 米半径，纯提示几何不参与枪口遮挡。 */
export class DefenseLine extends THREE.Group {
  private lineMaterial = new THREE.MeshBasicMaterial({ color: 0xf7c56a, side: THREE.DoubleSide, depthTest: false, depthWrite: false, transparent: true, opacity: 0.8, toneMapped: false });
  private markerMaterial = new THREE.LineBasicMaterial({ color: 0xff574b, transparent: true, opacity: 0.9, depthTest: false, toneMapped: false });
  private marker = new THREE.LineSegments(markerEdges(), this.markerMaterial);

  constructor() {
    super();
    const arc = new THREE.Mesh(new THREE.RingGeometry(SURVIVAL.breachRadius - 0.10, SURVIVAL.breachRadius + 0.10, 80, 1, Math.PI / 12, Math.PI * 5 / 6), this.lineMaterial);
    arc.rotation.x = -Math.PI / 2;
    arc.position.set(SURVIVAL.playerX, 0.035, SURVIVAL.playerZ);
    arc.renderOrder = 2;
    this.add(arc);
    // 外侧短划标识危险边缘，不使用遮挡目标的大面积墙体。
    const ticks = new THREE.InstancedMesh(new THREE.BoxGeometry(0.09, 0.045, 0.48), this.lineMaterial, 31);
    ticks.renderOrder = 2;
    const transform = new THREE.Object3D();
    for (let i = 0; i < 31; i++) {
      const angle = (-75 + i * 5) * Math.PI / 180;
      transform.position.set(Math.sin(angle) * (SURVIVAL.breachRadius + 0.4), 0.04, SURVIVAL.playerZ - Math.cos(angle) * (SURVIVAL.breachRadius + 0.4));
      transform.rotation.y = -angle;
      transform.updateMatrix(); ticks.setMatrixAt(i, transform.matrix);
    }
    this.add(ticks, this.marker);
    this.marker.renderOrder = 10;
    this.visible = false;
  }

  sync(encounter: Encounter) {
    this.visible = encounter.mode === 'survival';
    this.lineMaterial.color.setHex(encounter.failed ? 0xff574b : encounter.nearest !== null && encounter.nearest < 12 ? 0xff9254 : 0xf7c56a);
    const breached = encounter.zombies.find(z => z.id === encounter.breachedId);
    this.marker.visible = Boolean(breached);
    if (breached) this.marker.position.set(breached.x, 1.48, breached.z);
  }

  disposeMarker() { this.marker.geometry.dispose(); this.markerMaterial.dispose(); }
}
