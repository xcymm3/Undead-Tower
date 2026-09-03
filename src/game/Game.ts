import * as THREE from 'three';
import { CONFIG } from './config';
import type { Difficulty, GameMode, GamePhase, GameSnapshot, RunResult } from './config';
import { dampView, pointerToNdc, weaponQuaternion } from './aim';
import { GameAudio } from './audio';
import { Firearm } from './firearm';
import { cube, material } from './geometry';
import { createWeapon } from './weapon';
import { createWorld } from './world';
import { Encounter } from './encounter';
import { ZombieField } from './zombies';
import { SpawnDirector } from './spawn';
import { BloodEffects } from './blood';

interface Effect { mesh: THREE.Mesh; velocity: THREE.Vector3; life: number; maxLife: number; gravity: number; spin: boolean; shrink: boolean; }
interface GameCallbacks { onState: (state: GameSnapshot) => void; onHit: (head: boolean, killed: boolean) => void; onError: (message: string) => void; onEnd: (result: RunResult) => void; }

export class Game {
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(CONFIG.camera.fov, 1, 0.025, 220);
  private renderer: THREE.WebGLRenderer;
  private weapon = createWeapon();
  private world: ReturnType<typeof createWorld>;
  private encounter = new Encounter();
  private spawns = new SpawnDirector();
  private zombieField = new ZombieField();
  private blood = new BloodEffects();
  private result: RunResult | null = null;
  private firearm = new Firearm();
  private audio = new GameAudio();
  private phase: GamePhase = 'ready';
  private aim = new THREE.Vector2();
  private view = new THREE.Vector2();
  private aimPoint = new THREE.Vector3();
  private raycaster = new THREE.Raycaster();
  private effects: Effect[] = [];
  private hitCount = 0;
  private kills = 0;
  private trigger = false;
  private recoil = 0;
  private flashTime = 0;
  private elapsed = 0;
  private frameId = 0;
  private previousTime = 0;
  private dirty = true;
  private renderCount = 0;
  private shadowTime = 0;
  private publishTime = 0;
  private frameCount = 0;
  private fpsTime = 0;
  private fps = 60;
  private damping: number = CONFIG.camera.damping;
  private pixelated = false;
  private disposed = false;
  private width = 1;
  private height = 1;
  private observer: ResizeObserver;
  private lastShot: { muzzle: number[]; direction: number[]; aimPoint: number[]; impact: number[]; hitTarget: number | null } | null = null;

  constructor(private host: HTMLDivElement, private callbacks: GameCallbacks) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.needsUpdate = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.domElement.setAttribute('aria-label', '灰松哨站 3D 射击场景，移动鼠标瞄准，左键开火');
    this.renderer.domElement.setAttribute('data-testid', 'game-canvas');
    this.renderer.domElement.tabIndex = 0;
    host.appendChild(this.renderer.domElement);
    this.camera.position.set(0, CONFIG.camera.height, 9);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.x = -0.105;
    this.world = createWorld(this.scene);
    this.zombieField.sync(this.encounter);
    this.scene.add(this.zombieField);
    this.scene.add(this.blood);
    this.scene.add(this.camera);
    this.camera.add(this.weapon.root);
    this.observer = new ResizeObserver(this.resize);
    this.observer.observe(host);
    this.resize();
    this.renderer.domElement.addEventListener('pointermove', this.pointerMove);
    this.renderer.domElement.addEventListener('pointerdown', this.pointerDown);
    this.renderer.domElement.addEventListener('pointerleave', this.releaseTrigger);
    this.renderer.domElement.addEventListener('pointercancel', this.releaseTrigger);
    this.renderer.domElement.addEventListener('contextmenu', this.contextMenu);
    this.renderer.domElement.addEventListener('webglcontextlost', this.contextLost);
    window.addEventListener('pointerup', this.releaseTrigger);
    window.addEventListener('blur', this.blur);
    window.addEventListener('keydown', this.keyDown);
    document.addEventListener('visibilitychange', this.visibility);
    this.updateAim(0);
    this.publish();
    this.frameId = requestAnimationFrame(this.frame);
  }

  private resize = () => {
    this.width = Math.max(1, this.host.clientWidth);
    this.height = Math.max(1, this.host.clientHeight);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    // 默认最多渲染 1080p，避免高 DPI / 超宽屏无上限占用显存。
    const ratio = Math.min(devicePixelRatio, 1, 1920 / this.width, 1080 / this.height);
    this.renderer.setPixelRatio(ratio * (this.pixelated ? 0.68 : 1));
    this.renderer.setSize(this.width, this.height);
    this.dirty = true;
    this.updateCrosshair();
  };

  private updateCrosshair() {
    this.host.style.setProperty('--aim-x', `${(this.aim.x + 1) * this.width / 2}px`);
    this.host.style.setProperty('--aim-y', `${(1 - this.aim.y) * this.height / 2}px`);
  }

  private pointerMove = (event: PointerEvent) => {
    if (this.phase !== 'playing') return;
    const bounds = this.host.getBoundingClientRect();
    this.aim.copy(pointerToNdc(event.clientX - bounds.left, event.clientY - bounds.top, this.width, this.height));
    this.updateCrosshair();
  };

  private pointerDown = (event: PointerEvent) => {
    if (this.phase !== 'playing' || event.button !== 0) return;
    event.preventDefault();
    this.renderer.domElement.focus({ preventScroll: true });
    this.pointerMove(event);
    this.audio.unlock();
    this.trigger = true;
    this.updateAim(0);
    this.shoot();
  };
  private releaseTrigger = () => { this.trigger = false; };
  private contextMenu = (event: Event) => event.preventDefault();
  private contextLost = (event: Event) => {
    event.preventDefault();
    this.pause();
    this.callbacks.onError('3D 图形上下文已中断，请刷新页面重新加载哨站。');
  };
  private blur = () => { this.pause(); };
  private visibility = () => { if (document.hidden) this.pause(); };
  private keyDown = (event: KeyboardEvent) => {
    if (event.repeat) return;
    const tag = (event.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (event.code === 'Escape') { event.preventDefault(); if (this.phase === 'playing') this.pause(); else if (this.phase === 'paused') this.start(); }
    if (this.phase !== 'playing') return;
    if (event.code === 'KeyR') { event.preventDefault(); this.reload(); }
    if (event.code === 'KeyM') this.setSound(!this.audio.enabled);
  };

  start() {
    if (this.phase === 'failed') return;
    this.phase = 'playing';
    this.trigger = false;
    this.previousTime = 0;
    this.dirty = true;
    this.aim.set(0, 0);
    this.updateCrosshair();
    this.audio.unlock();
    this.renderer.domElement.focus({ preventScroll: true });
    this.publish();
  }

  pause() {
    this.trigger = false;
    this.dirty = true;
    if (this.phase === 'playing') { this.phase = 'paused'; this.publish(); }
  }

  private prepare(mode: GameMode, difficulty: Difficulty) {
    this.firearm.reset(); this.hitCount = 0; this.kills = 0;
    this.encounter.reset(mode, difficulty);
    this.spawns.reset();
    this.zombieField.sync(this.encounter);
    this.blood.reset();
    this.result = null;
    this.elapsed = 0;
    this.view.set(0, 0); this.aim.set(0, 0); this.recoil = 0; this.flashTime = 0; this.lastShot = null;
    this.renderer.shadowMap.needsUpdate = true;
    for (const effect of this.effects) this.scene.remove(effect.mesh);
    this.effects = [];
  }

  begin(mode: GameMode, difficulty: Difficulty) {
    this.prepare(mode, difficulty);
    this.phase = 'ready';
    this.start();
  }

  reset() { this.begin(this.encounter.mode, this.encounter.difficulty); }

  menu() {
    this.prepare('practice', this.encounter.difficulty);
    this.phase = 'ready'; this.trigger = false; this.dirty = true;
    this.updateCrosshair(); this.publish();
  }

  private endRun() {
    if (this.phase !== 'playing' || this.encounter.mode !== 'survival') return;
    this.phase = 'failed'; this.trigger = false; this.flashTime = 0; this.dirty = true;
    this.result = { id: crypto.randomUUID(), difficulty: this.encounter.difficulty, duration: this.encounter.elapsed, kills: this.kills, shots: this.firearm.shots, hits: this.hitCount, endedAt: new Date().toISOString() };
    this.audio.tone(160, 50, 0.4, 0.06);
    this.callbacks.onEnd(this.result);
    this.publish();
  }

  private spawnEnemy = () => this.spawns.next(this.camera);

  reload() {
    if (this.phase === 'playing' && this.firearm.reload()) {
      this.audio.tone(660, 220, 0.12);
      this.publish();
    }
  }
  setSound(enabled: boolean) { this.audio.enabled = enabled; if (enabled) this.audio.unlock(); this.publish(); }
  setPixelated(enabled: boolean) { this.pixelated = enabled; this.resize(); this.publish(); }
  setDamping(value: number) { this.damping = THREE.MathUtils.clamp(value, 1, 5); }

  private activeSurfaces() {
    return [...this.world.surfaces, this.zombieField];
  }

  private updateAim(delta: number) {
    this.view.copy(dampView(this.view, this.phase === 'ready' ? new THREE.Vector2() : this.aim, delta, this.damping));
    this.camera.rotation.set(-0.105 + this.view.y, this.view.x, 0, 'YXZ');
    this.camera.updateMatrixWorld(true);
    this.raycaster.setFromCamera(this.aim, this.camera);
    this.raycaster.far = CONFIG.weapon.range;
    const hit = this.raycaster.intersectObjects(this.activeSurfaces(), false)[0];
    this.aimPoint.copy(hit?.point ?? this.raycaster.ray.at(CONFIG.weapon.range, new THREE.Vector3()));
    const reloadProgress = this.firearm.reloading ? 1 - this.firearm.reloadRemaining / CONFIG.weapon.reloadDuration : 0;
    const reloadOffset = Math.sin(reloadProgress * Math.PI);
    // 后坐力平移枪身，再重算朝向；准星、枪口轴和命中点不会分离。
    this.weapon.root.position.set(0.43, -0.18 - reloadOffset * 0.55 - this.recoil * 0.035, -1.03 + this.recoil * 0.12);
    const localTarget = this.camera.worldToLocal(this.aimPoint.clone());
    this.weapon.root.quaternion.copy(weaponQuaternion(this.weapon.root.position, localTarget));
    if (this.firearm.reloading) this.weapon.root.rotateZ(-reloadOffset * 0.32);
    this.weapon.root.updateMatrixWorld(true);
  }

  private addEffect(position: THREE.Vector3, velocity: THREE.Vector3, scale: THREE.Vector3, color: number, life: number, gravity = 0, spin = false, shrink = true, emissive = false) {
    const effectMaterial = emissive ? this.tracerMaterial : material(color);
    const mesh = new THREE.Mesh(cube, effectMaterial);
    mesh.position.copy(position); mesh.scale.copy(scale); this.scene.add(mesh);
    this.effects.push({ mesh, velocity, life, maxLife: life, gravity, spin, shrink });
    if (this.effects.length > 160) this.scene.remove(this.effects.shift()!.mesh);
    return mesh;
  }
  private tracerMaterial = new THREE.MeshBasicMaterial({ color: 0xffdf9b });

  private shoot() {
    if (this.phase !== 'playing' || !this.firearm.fire()) return;
    this.audio.shot();
    this.flashTime = 0.065;
    this.recoil = Math.min(1, this.recoil + 0.75);
    const muzzle = this.weapon.muzzle.getWorldPosition(new THREE.Vector3());
    const direction = this.aimPoint.clone().sub(muzzle).normalize();
    this.raycaster.set(muzzle, direction);
    this.raycaster.far = Math.min(CONFIG.weapon.range, muzzle.distanceTo(this.aimPoint) + 0.08);
    // 从枪口再测一次遮挡，防止摄像机能看见但枪管被前景挡住时穿透。
    const hit = this.raycaster.intersectObjects(this.activeSurfaces(), false)[0];
    const end = hit?.point ?? muzzle.clone().addScaledVector(direction, CONFIG.weapon.range);
    const length = muzzle.distanceTo(end);
    const tracer = this.addEffect(muzzle.clone().lerp(end, 0.5), new THREE.Vector3(), new THREE.Vector3(0.015, 0.015, length), 0, 0.045, 0, false, false, true);
    tracer.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction);
    const targetHit = this.zombieField.decode(hit);
    const targetId = targetHit?.id;
    let killed = false;
    this.lastShot = { muzzle: muzzle.toArray(), direction: direction.toArray(), aimPoint: this.aimPoint.toArray(), impact: end.toArray(), hitTarget: targetId ?? null };
    if (targetHit) {
      const head = targetHit.head;
      const damage = this.encounter.hit(targetHit.id, head)!;
      killed = damage.killed;
      if (killed) this.blood.burst(end, direction, head);
      this.hitCount++;
      this.kills = this.encounter.kills;
      this.callbacks.onHit(head, damage.killed);
      this.audio.tone(head ? 1100 : 800, 450, 0.07, 0.025);
    }
    if (hit && !killed) {
      for (let i = 0; i < 9; i++) {
        const velocity = new THREE.Vector3((Math.random() - 0.5) * 2, 1 + Math.random() * 2, (Math.random() - 0.3) * 2);
        this.addEffect(end.clone(), velocity, new THREE.Vector3().setScalar(0.035 + Math.random() * 0.055), targetId === undefined ? 0xb0ac85 : 0xc6ad78, 0.3 + Math.random() * 0.3, 5, true);
      }
    }
    const shellOrigin = this.weapon.root.localToWorld(new THREE.Vector3(0.16, 0.08, -0.16));
    const shellVelocity = new THREE.Vector3(1.8, 1.2, 0.1).applyQuaternion(this.camera.quaternion);
    this.addEffect(shellOrigin, shellVelocity, new THREE.Vector3(0.03, 0.025, 0.085), 0xbb9751, 0.85, 5, true, false);
    for (let i = 0; i < 2; i++) this.addEffect(muzzle.clone().addScaledVector(direction, 0.12 + i * 0.13), new THREE.Vector3(0.03, 0.14, -0.07), new THREE.Vector3().setScalar(0.075), 0xc0c3ab, 0.24 + i * 0.09);
    this.publish();
  }

  private frame = (time: number) => {
    if (this.disposed) return;
    this.frameId = requestAnimationFrame(this.frame);
    if (document.hidden || (this.phase !== 'playing' && !this.dirty)) { this.previousTime = 0; return; }
    // 保留 RAF 的刷新同步，但高刷新率显示器上最多绘制 60 帧。
    if (this.previousTime && time - this.previousTime < 1000 / 60 - 0.5) return;
    const rawDelta = this.previousTime ? (time - this.previousTime) / 1000 : 0;
    const delta = Math.min(rawDelta, 0.1);
    this.previousTime = time;
    this.dirty = false;
    this.elapsed += delta;
    this.frameCount++;
    this.fpsTime += rawDelta;
    if (this.fpsTime >= 1) { this.fps = Math.round(this.frameCount / this.fpsTime); this.fpsTime = 0; this.frameCount = 0; }
    if (this.phase === 'playing') {
      const wasReloading = this.firearm.reloading;
      this.firearm.update(delta);
      if (wasReloading && !this.firearm.reloading) { this.audio.tone(350, 700, 0.08); this.publish(); }
      this.recoil *= Math.exp(-delta * 15);
      this.flashTime = Math.max(0, this.flashTime - delta);
      this.blood.update(delta);
      this.encounter.update(rawDelta, this.spawnEnemy);
      this.zombieField.sync(this.encounter);
      if (this.encounter.failed) this.endRun();
      for (let i = this.effects.length - 1; i >= 0; i--) {
        const effect = this.effects[i];
        effect.life -= delta;
        if (effect.life <= 0) { this.scene.remove(effect.mesh); this.effects.splice(i, 1); continue; }
        effect.velocity.y -= effect.gravity * delta;
        effect.mesh.position.addScaledVector(effect.velocity, delta);
        if (effect.spin) { effect.mesh.rotation.x += delta * 8; effect.mesh.rotation.z += delta * 5; }
        if (effect.shrink) effect.mesh.scale.multiplyScalar(Math.exp(-delta * 3));
      }
    }
    this.scene.updateMatrixWorld(true);
    this.updateAim(this.phase === 'playing' ? delta : 0);
    if (this.phase === 'playing' && this.trigger) this.shoot();
    this.weapon.flash.visible = this.flashTime > 0 && this.phase === 'playing';
    this.weapon.flash.rotation.z = this.elapsed * 26;
    this.weapon.light.intensity = this.weapon.flash.visible ? 8 : 0;
    if (this.phase === 'playing' && time - this.shadowTime > 100) {
      this.renderer.shadowMap.needsUpdate = true;
      this.shadowTime = time;
    }
    this.renderer.render(this.scene, this.camera);
    this.renderCount++;
    if (time - this.publishTime > 200) { this.publishTime = time; this.publish(); }
  };

  private publish() {
    this.callbacks.onState({ phase: this.phase, mode: this.encounter.mode, difficulty: this.encounter.difficulty, survived: this.encounter.elapsed, alive: this.encounter.alive, nearest: this.encounter.nearest, spawnRate: this.encounter.pressure.spawnRate, speed: this.encounter.pressure.speed, result: this.result, ammo: this.firearm.ammo, reloading: this.firearm.reloading, shots: this.firearm.shots, hits: this.hitCount, kills: this.kills, fps: this.fps, yaw: THREE.MathUtils.radToDeg(this.view.x), pitch: THREE.MathUtils.radToDeg(this.view.y), sound: this.audio.enabled, pixelated: this.pixelated });
  }

  /** 只读诊断用于验收，生产构建不挂载到 window。 */
  diagnostics() {
    const muzzle = this.weapon.muzzle.getWorldPosition(new THREE.Vector3());
    const barrelDirection = new THREE.Vector3(0, 0, -1).applyQuaternion(this.weapon.root.getWorldQuaternion(new THREE.Quaternion()));
    const project = (point: THREE.Vector3) => {
      const p = point.clone().project(this.camera);
      return { x: (p.x + 1) / 2 * this.width, y: (1 - p.y) / 2 * this.height };
    };
    return {
      phase: this.phase, mode: this.encounter.mode, difficulty: this.encounter.difficulty, survived: this.encounter.elapsed, totalSpawned: this.encounter.totalSpawned, pressure: this.encounter.pressure, nearest: this.encounter.nearest, result: this.result, ammo: this.firearm.ammo, shots: this.firearm.shots, hits: this.hitCount, kills: this.kills, reloading: this.firearm.reloading,
      yaw: this.view.x, pitch: this.view.y, aim: this.aim.toArray(), aimPoint: this.aimPoint.toArray(), muzzle: muzzle.toArray(), barrelDirection: barrelDirection.toArray(),
      flashVisible: this.weapon.flash.visible, effects: this.effects.length, lastShot: this.lastShot, drawCalls: this.renderer.info.render.calls, renderCount: this.renderCount, fps: this.fps,
      blood: this.blood.diagnostics(),
      targets: this.encounter.zombies.map(z => ({ id: z.id, spawnZone: z.spawnZone, health: z.health, x: z.x, z: z.z, bornAt: z.bornAt, head: project(new THREE.Vector3(z.x, 1.83, z.z + 0.24)), chest: project(new THREE.Vector3(z.x, 1.25, z.z + 0.2)) })),
    };
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    this.observer.disconnect();
    this.renderer.domElement.removeEventListener('pointermove', this.pointerMove);
    this.renderer.domElement.removeEventListener('pointerdown', this.pointerDown);
    this.renderer.domElement.removeEventListener('pointerleave', this.releaseTrigger);
    this.renderer.domElement.removeEventListener('pointercancel', this.releaseTrigger);
    this.renderer.domElement.removeEventListener('contextmenu', this.contextMenu);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.contextLost);
    window.removeEventListener('pointerup', this.releaseTrigger);
    window.removeEventListener('blur', this.blur);
    window.removeEventListener('keydown', this.keyDown);
    document.removeEventListener('visibilitychange', this.visibility);
    this.audio.dispose();
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    this.scene.traverse(obj => {
      if (obj instanceof THREE.DirectionalLight || obj instanceof THREE.PointLight || obj instanceof THREE.SpotLight) obj.shadow.dispose();
      if (obj instanceof THREE.Mesh) {
        if (obj instanceof THREE.InstancedMesh) obj.dispose();
        geometries.add(obj.geometry);
        (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach(m => materials.add(m));
      }
    });
    geometries.forEach(g => g.dispose());
    materials.forEach(m => { if ('map' in m && m.map instanceof THREE.Texture) m.map.dispose(); m.dispose(); });
    this.tracerMaterial.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

declare global { interface Window { __undeadTower?: { snapshot: () => ReturnType<Game['diagnostics']> }; } }
