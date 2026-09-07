import * as THREE from 'three';
import { CONFIG, FIXED_DIFFICULTY, PRESSURE, ENEMY_RULES, zombieSpeed, zombieScale } from './config';
import type { GameMode, GamePhase, GameSnapshot, RunResult, ZombieKind } from './config';
import { dampView, pointerToNdc, weaponQuaternion } from './aim';
import { GameAudio } from './audio';
import { Arsenal } from './arsenal';
import { WEAPONS } from './weapons';
import type { WeaponId } from './weapons';
import { ActiveSkill } from './skills';
import { createShot, hitWithShot, projectileHits, projectileCount, pelletDirection, criticalRandom } from './combat';
import { strongestFeedback, type HitFeedback } from './hitFeedback';
import { cube, material, seededRandom } from './geometry';
import { WeaponView } from './weapon';
import { createWorld } from './world';
import { Encounter, distanceToBreach, emptyEnemyEventCounts } from './encounter';
import { ZombieField } from './zombies';
import { SpawnDirector } from './spawn';
import { BloodEffects } from './blood';
import { ArmorEffects } from './armorEffects';
import { BreachSequence } from './breach';
import { Navigation, NAV_RADIUS } from './navigation';
import { SKILLS, freshLevels, weaponStats, skillStats, upgradeChoices, applyUpgrade, waveEnemies, waveRate } from './rogue';
import type { UpgradeId } from './rogue';
import { visiblePoint, spawnEnemy } from './sceneRules';
import { finishShotTeleports } from './teleport';
import { StaticCollision } from './staticCollision';
import type { Position } from './encounter';
import { frameClocks } from './timing';

interface Effect { mesh: THREE.Mesh; velocity: THREE.Vector3; life: number; maxLife: number; gravity: number; spin: boolean; shrink: boolean; }
interface GameCallbacks { onState: (state: GameSnapshot) => void; onHit: (feedback: HitFeedback) => void; onError: (message: string) => void; onEnd: (result: RunResult) => void; }

export class Game {
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(CONFIG.camera.fov, 1, 0.025, 220);
  private renderer: THREE.WebGLRenderer;
  private weapon = new WeaponView();
  private world: ReturnType<typeof createWorld>;
  private encounter = new Encounter();
  private spawns = new SpawnDirector();
  private zombieField = new ZombieField();
  private blood = new BloodEffects();
  private armorEffects = new ArmorEffects();
  private breachSequence = new BreachSequence();
  private navigation: Navigation;
  private giantNavigation: Navigation;
  private wave = 1;
  private completed = 0;
  private clearTime = 0;
  private countdown = 3;
  private resumePhase: GamePhase = 'playing';
  private levels = freshLevels();
  private selectedWeapon: WeaponId = 'pistol';
  private skill = new ActiveSkill();
  private lockedId: number | null = null;
  private choices: UpgradeId[] = [];
  private seed = 1;
  private waveRandom = seededRandom(1);
  private upgradeRandom = seededRandom(2);
  private teleportRandom = seededRandom(3);
  private criticalRandom = criticalRandom(1);
  private criticalHitCount = 0;
  private criticalHeadHitCount = 0;
  private enemyEventCounts = emptyEnemyEventCounts();
  private teleportCount = 0;
  private result: RunResult | null = null;
  private arsenal = new Arsenal();
  private get firearm() { return this.arsenal.gun; }
  private wheelTime = 0;
  private audio = new GameAudio();
  private phase: GamePhase = 'ready';
  private aim = new THREE.Vector2();
  private view = new THREE.Vector2();
  private aimPoint = new THREE.Vector3();
  private raycaster = new THREE.Raycaster();
  private effects: Effect[] = [];
  private hitCount = 0;
  private headHitCount = 0;
  private skillActiveTime = 0;
  private replaySeed: number | undefined;
  private replayClock = false;
  private replayCollision: StaticCollision | undefined;
  private replayTime = 0;
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
    this.navigation = new Navigation(this.world.obstacles);
    this.giantNavigation = new Navigation(this.world.obstacles, NAV_RADIUS * zombieScale('giant'));
    this.encounter.setNavigation(this.navigation, this.giantNavigation);
    this.zombieField.sync(this.encounter);
    this.scene.add(this.zombieField);
    this.scene.add(this.blood);
    this.scene.add(this.armorEffects, this.breachSequence.light);
    this.scene.add(this.camera);
    this.camera.add(this.weapon.root, this.weapon.offhand);
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
    this.renderer.domElement.addEventListener('wheel', this.wheel, { passive: false });
    document.addEventListener('visibilitychange', this.visibility);
    void this.weapon.ready.then(() => { if (this.disposed) return; this.updateAim(0); this.dirty = true; this.publish(); }).catch(error => { if (!this.disposed) { console.error(error); this.callbacks.onError('枪械资源加载失败，请重新加载游戏。'); } });
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

  private get playerActive() { return this.phase === 'playing' || this.phase === 'countdown'; }

  private pointerMove = (event: PointerEvent) => {
    if (!this.playerActive) return;
    const bounds = this.host.getBoundingClientRect();
    this.aim.copy(pointerToNdc(event.clientX - bounds.left, event.clientY - bounds.top, this.width, this.height));
    this.updateCrosshair();
  };

  private pointerDown = (event: PointerEvent) => {
    if (!this.playerActive) return;
    if (event.button === 2) {
      event.preventDefault();
      if (this.skill.press(skillStats(this.selectedWeapon, this.levels), this.encounter.mode === 'survival' && this.weapon.loaded && !this.firearm.reloading && !this.arsenal.blocked)) {
        this.dirty = true; this.publish();
      }
      return;
    }
    if (event.button !== 0) return;
    event.preventDefault();
    this.renderer.domElement.focus({ preventScroll: true });
    this.pointerMove(event);
    this.audio.unlock();
    this.trigger = this.firearm.definition.automatic;
    this.updateAim(0);
    this.shoot();
  };
  private releaseTrigger = (event?: Event) => {
    if (event?.type === 'pointerup') { if ((event as PointerEvent).button === 2) this.skill.release(); else if ((event as PointerEvent).button === 0) this.trigger = false; }
    else { this.trigger = false; this.skill.release(); }
  };
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
    if (event.code === 'Escape') { event.preventDefault(); if (this.phase === 'playing' || this.phase === 'countdown') this.pause(); else if (this.phase === 'paused') this.start(); }
    if (!this.playerActive) return;
    if (/^(Digit|Numpad)[1-6]$/.test(event.code)) { event.preventDefault(); this.switchWeapon(Number(event.code.slice(-1)) - 1); }
    if (event.code === 'KeyR') { event.preventDefault(); this.reload(); }
    if (event.code === 'KeyM') this.setSound(!this.audio.enabled);
  };

  switchWeapon(index: number) {
    if (!this.playerActive || !this.weapon.loaded || this.encounter.mode === 'survival') return;
    this.releaseTrigger(); this.flashTime = 0;
    this.arsenal.request(index); this.publish();
  }
  private wheel = (event: WheelEvent) => {
    if (!this.playerActive || event.ctrlKey || event.deltaY === 0) return;
    event.preventDefault();
    if (event.timeStamp - this.wheelTime < 100) return;
    this.wheelTime = event.timeStamp;
    this.switchWeapon((this.arsenal.requested + Math.sign(event.deltaY) + WEAPONS.length) % WEAPONS.length);
  };

  start() {
    if (!this.weapon.loaded) return;
    if (!['ready', 'paused'].includes(this.phase)) return;
    this.phase = this.phase === 'paused' ? this.resumePhase : this.encounter.mode === 'survival' ? 'countdown' : 'playing';
    this.releaseTrigger();
    this.previousTime = 0;
    this.dirty = true;
    this.aim.set(0, 0);
    this.updateCrosshair();
    this.audio.unlock();
    this.renderer.domElement.focus({ preventScroll: true });
    this.audio.setPlaying(this.playerActive);
    this.publish();
  }

  pause() {
    this.audio.setPlaying(false);
    this.releaseTrigger();
    this.dirty = true;
    if (this.phase === 'playing' || this.phase === 'countdown') { this.resumePhase = this.phase; this.phase = 'paused'; this.publish(); }
  }

  private prepare(mode: GameMode) {
    this.skill.reset(); this.lockedId = null; this.weapon.offhand.visible = false;
    this.breachSequence.reset();
    this.camera.position.set(0, CONFIG.camera.height, 9); this.camera.fov = CONFIG.camera.fov; this.camera.updateProjectionMatrix();
    this.audio.resetMusic();
    this.weapon.root.visible = true;
    this.arsenal.reset(); this.weapon.select(0); this.hitCount = 0; this.headHitCount = 0; this.skillActiveTime = 0; this.kills = 0;
    this.encounter.reset(mode, FIXED_DIFFICULTY);
    this.seed = (import.meta.env.DEV && import.meta.env.MODE === 'replay' ? this.replaySeed : undefined) ?? crypto.getRandomValues(new Uint32Array(1))[0];
    this.waveRandom = seededRandom(this.seed); this.upgradeRandom = seededRandom(this.seed ^ 0x12345678); this.teleportRandom = seededRandom(this.seed ^ 0x5a5a5a5a);
    this.criticalRandom = criticalRandom(this.seed); this.criticalHitCount = 0; this.criticalHeadHitCount = 0;
    this.enemyEventCounts = emptyEnemyEventCounts(); this.teleportCount = 0;
    this.spawns = new SpawnDirector(seededRandom(this.seed ^ 0x87654321));
    this.wave = 1; this.completed = 0; this.clearTime = 0; this.countdown = 3; this.levels = freshLevels(); this.choices = [];
    if (mode === 'survival') {
      const index = WEAPONS.findIndex(gun => gun.id === this.selectedWeapon);
      this.arsenal.active = index; this.arsenal.requested = index;
      this.firearm.definition = weaponStats(this.selectedWeapon, this.levels); this.firearm.reset();
      this.weapon.select(index); this.encounter.startWave(waveEnemies(1, this.waveRandom), waveRate(1));
    }
    this.zombieField.sync(this.encounter);
    this.blood.reset();
    this.armorEffects.reset();
    this.result = null;
    this.elapsed = 0;
    this.view.set(0, 0); this.aim.set(0, 0); this.recoil = 0; this.flashTime = 0; this.lastShot = null;
    this.renderer.shadowMap.needsUpdate = true;
    for (const effect of this.effects) this.scene.remove(effect.mesh);
    this.effects = [];
  }

  begin(mode: GameMode, weapon: WeaponId = this.selectedWeapon) {
    if (!this.weapon.loaded) return;
    if (!WEAPONS.some(gun => gun.id === weapon)) return;
    this.selectedWeapon = weapon;
    this.prepare(mode);
    this.phase = 'ready';
    this.start();
  }

  reset() { this.begin(this.encounter.mode); }

  menu() {
    this.prepare('practice');
    this.phase = 'ready'; this.trigger = false; this.dirty = true;
    this.updateCrosshair(); this.publish();
  }

  private endRun() {
    if (this.phase !== 'playing' || this.encounter.mode !== 'survival') return;
    this.skill.end(); this.lockedId = null; this.weapon.offhand.visible = false; this.encounter.clearStatuses();
    for (const effect of this.effects) this.scene.remove(effect.mesh);
    this.effects = [];
    this.host.dataset.locked = 'false';
    this.phase = 'breaching'; this.trigger = false; this.flashTime = 0; this.dirty = true;
    this.weapon.root.visible = false;
    this.audio.setPlaying(false);
    this.result = { id: crypto.randomUUID(), difficulty: this.encounter.difficulty, duration: this.encounter.elapsed, kills: this.kills, shots: this.arsenal.shots, hits: this.hitCount, endedAt: new Date().toISOString() };
    this.result.rogue = { version: 2, weapon: this.selectedWeapon, seed: this.seed, completed: this.completed, failedWave: this.wave, waveKills: this.encounter.waveKills, waveTotal: this.encounter.waveTotal, clearTime: this.clearTime, levels: { ...this.levels } };
    const culprit = this.encounter.zombies.find(z => z.id === this.encounter.breachedId)!;
    this.breachSequence.begin(this.camera, culprit, this.world.surfaces);
    this.audio.failure();
    this.publish();
  }

  private visiblePoint(point: Position, scale = 1, occlusion = false) {
    return visiblePoint(this.camera, point, scale, occlusion ? this.replayCollision?.blocked ?? ((origin, target) => {
      const direction = target.clone().sub(origin);
      const ray = new THREE.Raycaster(origin, direction.clone().normalize(), .025, direction.length() - .1);
      return ray.intersectObjects(this.world.surfaces, false).length > 0;
    }) : undefined);
  }
  private spawnEnemy = (kind: ZombieKind = 'normal') => spawnEnemy(kind, this.encounter, this.camera, this.spawns, this.navigation, this.giantNavigation);
  chooseUpgrade(id: UpgradeId | null) {
    if (this.phase !== 'upgrade') return;
    if (this.choices.length) {
      if (!id) return;
      const levels = applyUpgrade(this.selectedWeapon, this.levels, this.choices, id);
      if (!levels) return;
      this.levels = levels;
    } else if (id !== null) return;
    this.choices = [];
    const shots = this.firearm.shots;
    this.firearm.definition = weaponStats(this.selectedWeapon, this.levels); this.firearm.reset(); this.firearm.shots = shots;
    this.arsenal.reloadQueued = false;
    for (const effect of this.effects) this.scene.remove(effect.mesh);
    this.effects = []; this.blood.reset(); this.armorEffects.reset();
    this.wave++; this.countdown = 3;
    this.encounter.startWave(waveEnemies(this.wave, this.waveRandom), waveRate(this.wave));
    this.zombieField.sync(this.encounter); this.releaseTrigger(); this.flashTime = 0; this.recoil = 0;
    // 尸群已经清空，立即重绘阴影，避免上一波僵尸的轮廓残留到下一次 100ms 定时刷新。
    this.renderer.shadowMap.needsUpdate = true;
    this.phase = 'countdown'; this.previousTime = 0; this.dirty = true; this.publish();
  }
  private finishWave() {
    if (this.phase !== 'playing' || !this.encounter.waveCleared) return;
    this.completed = this.wave; this.clearTime = this.encounter.elapsed;
    this.skill.end(); this.lockedId = null; this.weapon.offhand.visible = false; this.encounter.clearStatuses();
    for (const effect of this.effects) this.scene.remove(effect.mesh);
    this.effects = [];
    this.host.dataset.locked = 'false';
    this.choices = upgradeChoices(this.levels, this.upgradeRandom, this.selectedWeapon);
    this.phase = 'upgrade'; this.releaseTrigger(); this.flashTime = 0;
    this.audio.setPlaying(false); this.audio.tone(440, 880, .25, .06); this.dirty = true; this.publish();
  }
  private rogueSnapshot() {
    if (this.encounter.mode !== 'survival') return undefined;
    return { wave: this.wave, total: this.encounter.waveTotal, remaining: this.encounter.waveTotal - this.encounter.waveKills,
      completed: this.completed, countdown: Math.ceil(this.countdown), weapon: this.selectedWeapon,
      skill: this.skill.snapshot(), skillStats: skillStats(this.selectedWeapon, this.levels),
      levels: { ...this.levels }, choices: [...this.choices], stats: { ...this.firearm.definition } };
  }

  reload() {
    if (this.skill.active && this.selectedWeapon === 'rifle') return;
    if (this.playerActive && this.arsenal.reload()) {
      if (this.firearm.reloading) this.audio.tone(660, 220, 0.09, 0.035);
      this.publish();
    }
  }
  setSound(enabled: boolean) { this.audio.enabled = enabled; if (enabled) this.audio.unlock(); this.publish(); }
  setVolume(volume: number) { this.audio.volume = volume; this.audio.unlock(); this.publish(); }
  setPixelated(enabled: boolean) { this.pixelated = enabled; this.resize(); this.publish(); }

  private activeSurfaces() {
    return [...this.world.surfaces, this.zombieField];
  }

  private updateAim(delta: number) {
    this.view.copy(dampView(this.view, this.phase === 'ready' ? new THREE.Vector2() : this.aim, delta));
    this.camera.rotation.set(-0.105 + this.view.y, this.view.x, 0, 'YXZ');
    this.camera.updateMatrixWorld(true);
    this.raycaster.setFromCamera(this.aim, this.camera);
    this.raycaster.far = CONFIG.weapon.range;
    const hit = this.raycaster.intersectObjects(this.activeSurfaces(), false)[0];
    this.aimPoint.copy(hit?.point ?? this.raycaster.ray.at(CONFIG.weapon.range, new THREE.Vector3()));
    if (this.skill.active && this.selectedWeapon === 'revolver') {
      const candidates = this.encounter.zombies.filter(z => z.health > 0 && this.visiblePoint(z, zombieScale(z.kind), true))
        .sort((a, b) => (a.id === this.lockedId ? -1 : b.id === this.lockedId ? 1 : Math.hypot(a.x, a.z - 9) - Math.hypot(b.x, b.z - 9) || a.id - b.id));
      const target = candidates.find(z => {
        const point = new THREE.Vector3(z.x, 1.83 * zombieScale(z.kind), z.z);
        const origin = this.weapon.muzzle.getWorldPosition(new THREE.Vector3()), direction = point.clone().sub(origin);
        const ray = new THREE.Raycaster(origin, direction.clone().normalize(), 0, direction.length() + .5);
        return this.zombieField.decode(ray.intersectObjects(this.activeSurfaces(), false)[0])?.id === z.id;
      });
      this.lockedId = target?.id ?? null;
      if (target) {
        this.aimPoint.set(target.x, 1.83 * zombieScale(target.kind), target.z);
        const projected = this.aimPoint.clone().project(this.camera);
        this.host.style.setProperty('--aim-x', `${(projected.x + 1) * this.width / 2}px`);
        this.host.style.setProperty('--aim-y', `${(1 - projected.y) * this.height / 2}px`);
      } else this.updateCrosshair();
    } else { this.lockedId = null; this.updateCrosshair(); }
    this.host.dataset.locked = String(this.lockedId !== null && this.playerActive);
    const gun = this.firearm;
    this.weapon.animate(gun.reloading ? 'reload' : gun.fireRemaining > 0 ? 'fire' : 'idle', gun.reloading ? gun.animationProgress : gun.fireProgress);
    this.host.parentElement?.style.setProperty('--reload-progress', String(gun.reloadProgress));
    const p = gun.reloadProgress;
    const reloadMotion = gun.reloading ? Math.sin(Math.PI * p) : 0;
    const drop = this.arsenal.switching ? Math.sin(Math.PI * this.arsenal.switchProgress) : 0;
    const viewX = Math.min(0.38, Math.tan(THREE.MathUtils.degToRad(CONFIG.camera.fov / 2)) * this.camera.aspect * 0.8);
    const viewY = gun.definition.length < 0.6 ? -0.32 : -0.40;
    this.weapon.root.position.set(viewX - reloadMotion * 0.04, viewY - drop * 1.45 + reloadMotion * 0.08 - this.recoil * 0.025, -1.16 + this.recoil * 0.08);
    const localTarget = this.camera.worldToLocal(this.aimPoint.clone());
    this.weapon.root.quaternion.copy(weaponQuaternion(this.weapon.root.position, localTarget));
    this.weapon.root.rotateZ(-reloadMotion * 0.24 - drop * 0.20);
    this.weapon.root.updateMatrixWorld(true);
    this.weapon.offhand.visible = this.skill.active && this.selectedWeapon === 'pistol';
    if (this.weapon.offhand.visible) {
      this.weapon.offhand.position.copy(this.weapon.root.position); this.weapon.offhand.position.x *= -1;
      this.weapon.offhand.quaternion.copy(weaponQuaternion(this.weapon.offhand.position, localTarget));
      this.weapon.offhand.rotateZ(reloadMotion * .24); this.weapon.offhand.updateMatrixWorld(true);
    }
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
  private skillMaterials = Object.fromEntries(Object.entries(SKILLS).map(([id, skill]) => [id, new THREE.MeshBasicMaterial({ color: skill.color })])) as Record<WeaponId, THREE.MeshBasicMaterial>;

  private skillImpact(point: THREE.Vector3, weapon: WeaponId, direction: THREE.Vector3) {
    const count = weapon === 'shotgun' ? 7 : weapon === 'p90' ? 4 : 3;
    for (let n = 0; n < count; n++) {
      const angle = n * Math.PI * 2 / count;
      const velocity = new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0).multiplyScalar(weapon === 'shotgun' ? 4 : 1.3);
      velocity.addScaledVector(direction, weapon === 'sniper' ? 3 : -.2);
      const scale = weapon === 'p90' ? new THREE.Vector3(.045, .16, .045) : weapon === 'shotgun' ? new THREE.Vector3(.18, .035, .06) : new THREE.Vector3(.045, .045, .22);
      const mesh = this.addEffect(point.clone(), velocity, scale, 0, .25, 0, true, true, true);
      mesh.material = this.skillMaterials[weapon];
    }
  }

  private enemyFeedback() {
    for (const event of this.encounter.drainEnemyEvents()) {
      this.enemyEventCounts[event.type]++;
      const point = new THREE.Vector3(event.x, .16, event.z);
      const burst = (color: number, count: number, life = .24) => {
        for (let n = 0; n < count; n++) {
          const angle = n * Math.PI * 2 / count;
          this.addEffect(point.clone(), new THREE.Vector3(Math.cos(angle) * 1.4, .35 + (n % 2) * .25, Math.sin(angle) * 1.4), new THREE.Vector3(.12, .045, .2), color, life, 1.2, true);
        }
      };
      if (event.type === 'skitter-turn') { burst(0x70c7bc, 2, .18); this.audio.tone(460, 260, .07, .012); }
      else if (event.type === 'charger-windup') { burst(0xffb64f, 6, .32); this.audio.tone(170, 390, .22, .028, 'sawtooth'); }
      else if (event.type === 'charger-charge') { burst(0xff7d3c, 8, .22); this.audio.tone(620, 130, .18, .035, 'square'); }
      else if (event.type === 'charger-impact' || event.type === 'charger-interrupted') { burst(0xe5d1a0, 7, .28); this.audio.tone(210, 70, .14, .03); }
      else if (event.type === 'howler-windup') { burst(0x72d4d0, 6, .3); this.audio.tone(260, 520, .24, .025, 'sine'); }
      else if (event.type === 'howler-command') { burst(0x72d4d0, 12, .34); this.audio.tone(390, 760, .2, .04, 'sine'); this.audio.tone(520, 920, .18, .025, 'triangle', .04); }
      else if (event.type === 'howler-interrupted') { burst(0x8a9b98, 5, .2); this.audio.tone(360, 110, .12, .025); }
      else if (event.type === 'command-ended') { burst(0x567a78, 3, .2); this.audio.tone(420, 180, .11, .014, 'sine'); }
      else if (event.type === 'berserker-rage') { burst(0xff5a37, 12, .36); this.audio.tone(95, 240, .3, .045, 'sawtooth'); }
    }
  }

  private shoot() {
    if (!this.playerActive || !this.weapon.loaded || !this.arsenal.fire(this.skill.active && this.selectedWeapon === 'rifle')) return;
    this.audio.shot();
    this.flashTime = 0.065;
    this.recoil = Math.min(1, this.recoil + this.firearm.definition.recoil);
    const primaryMuzzle = this.weapon.muzzle.getWorldPosition(new THREE.Vector3());
    const shot = createShot(this.firearm.definition, this.levels, this.skill.active, this.criticalRandom);
    let landed = false, headed = false;
    let feedback: HitFeedback | null = null;
    for (let hand = 0; hand < projectileCount(shot.weapon.id, shot.active); hand++) {
    const muzzle = hand ? this.weapon.offhandMuzzle.getWorldPosition(new THREE.Vector3()) : primaryMuzzle;
    const centerDirection = this.aimPoint.clone().sub(muzzle).normalize();
    const definition = this.firearm.definition;
    for (let pellet = 0; pellet < definition.pellets; pellet++) {
      const direction = pelletDirection(centerDirection, this.camera.up, definition, pellet);
      this.raycaster.set(muzzle, direction);
      this.raycaster.far = CONFIG.weapon.range;
      // 从枪口再测一次遮挡，防止摄像机能看见但枪管被前景挡住时穿透。
      const intersections = this.raycaster.intersectObjects(this.activeSurfaces(), false);
      const contacts: (THREE.Intersection | undefined)[] = projectileHits(intersections, hit => this.zombieField.decode(hit), shot.active && definition.id === 'sniper' ? shot.skill.pierceTargets : 1);
      if (!contacts.length) contacts.push(undefined);
      for (let depth = 0; depth < contacts.length; depth++) {
      const hit = contacts[depth];
      const end = hit?.point ?? muzzle.clone().addScaledVector(direction, CONFIG.weapon.range);
      const length = muzzle.distanceTo(end);
      const tracer = this.addEffect(muzzle.clone().lerp(end, 0.5), new THREE.Vector3(), new THREE.Vector3(shot.active && definition.id === 'sniper' ? .026 : .015, .015, length), 0, shot.active ? .09 : .045, 0, false, false, true);
      if (shot.active) tracer.material = this.skillMaterials[definition.id];
      tracer.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction);
      const targetHit = this.zombieField.decode(hit);
      const targetId = targetHit?.id;
      let killed = false;
      if (pellet === 0) this.lastShot = { muzzle: muzzle.toArray(), direction: direction.toArray(), aimPoint: this.aimPoint.toArray(), impact: end.toArray(), hitTarget: targetId ?? null };
      if (targetHit) {
        const head = targetHit.head;
        const damage = hitWithShot(this.encounter, shot, targetHit.id, head, hand, depth, pellet);
        if (!damage) continue;
        if (shot.active) this.skillImpact(end, definition.id, direction);
        if (damage.armorBroken && damage.armorHit) this.armorEffects.release(this.zombieField.captureArmor(targetHit.id, damage.armorHit), direction);
        // 立即同步外观与碰撞，避免同一帧继续命中已经脱落的护具。
        this.zombieField.sync(this.encounter);
        this.scene.updateMatrixWorld(true);
        killed = damage.killed;
        if (killed) { this.blood.burst(end, direction, head); this.audio.death(); }
        landed = true; headed ||= head;
        this.kills = this.encounter.kills;
        feedback = strongestFeedback(feedback, { head, killed: damage.killed, armorBroken: damage.armorBroken, critical: damage.critical });
        if (damage.critical) { this.criticalHitCount++; if (head) this.criticalHeadHitCount++; }
        if (damage.armorHit) this.audio.armor(damage.armorHit, damage.armorBroken);
        else this.audio.tone(head ? 1100 : 800, 450, 0.07, 0.025);
      }
      if (hit && !killed) {
        for (let i = 0; i < 9; i++) {
          const velocity = new THREE.Vector3((Math.random() - 0.5) * 2, 1 + Math.random() * 2, (Math.random() - 0.3) * 2);
          this.addEffect(end.clone(), velocity, new THREE.Vector3().setScalar(0.035 + Math.random() * 0.055), targetId === undefined ? 0xb0ac85 : 0xc6ad78, 0.3 + Math.random() * 0.3, 5, true);
        }
      }
    }
    }
    const direction = centerDirection;
    for (let i = 0; i < 2; i++) this.addEffect(muzzle.clone().addScaledVector(direction, 0.12 + i * 0.13), new THREE.Vector3(0.03, 0.14, -0.07), new THREE.Vector3().setScalar(0.075), 0xc0c3ab, 0.24 + i * 0.09);
    }
    const teleports = finishShotTeleports(shot, this.encounter.zombies, this.navigation, p => this.visiblePoint(p, 1, true), this.teleportRandom);
    this.teleportCount += teleports.length;
    for (const { origin, destination } of teleports) {
      for (let n = 0; n < 7; n++) this.addEffect(new THREE.Vector3(origin.x + (n % 3 - 1) * .2, .28 + n * .29, origin.z), new THREE.Vector3(0, .75, 0), new THREE.Vector3(.2, .3, .2), 0x9c63cf, .22);
      for (let n = 1; n <= 5; n++) {
        const amount = n / 6;
        this.addEffect(new THREE.Vector3(THREE.MathUtils.lerp(origin.x, destination.x, amount), .55 + (n % 2) * .42, THREE.MathUtils.lerp(origin.z, destination.z, amount)), new THREE.Vector3(0, .12, 0), new THREE.Vector3(.11, .16, .11), 0xc49be8, .18 + n * .018);
      }
      for (let n = 0; n < 8; n++) {
        const angle = n * Math.PI / 4;
        this.addEffect(new THREE.Vector3(destination.x, .12, destination.z), new THREE.Vector3(Math.cos(angle) * 2.1, .25, Math.sin(angle) * 2.1), new THREE.Vector3(.22, .06, .16), 0xd4b4ef, .28, .5, false);
      }
      this.audio.tone(980, 320, .11, .032, 'sine');
      this.audio.tone(280, 820, .14, .036, 'sine', .11);
    }
    if (teleports.length) { this.zombieField.sync(this.encounter); this.scene.updateMatrixWorld(true); }
    if (landed) this.hitCount++;
    if (headed) this.headHitCount++;
    if (feedback) this.callbacks.onHit(feedback);
    this.publish();
  }

  private frame = (time: number) => {
    if (this.disposed) return;
    this.frameId = requestAnimationFrame(this.frame);
    if (this.replayClock || document.hidden || (this.phase !== 'playing' && this.phase !== 'breaching' && this.phase !== 'countdown' && !this.dirty)) { this.previousTime = 0; return; }
    // 保留 RAF 的刷新同步，但高刷新率显示器上最多绘制 60 帧。
    if (this.previousTime && time - this.previousTime < 1000 / 60 - 0.5) return;
    const rawDelta = this.previousTime ? (time - this.previousTime) / 1000 : 0;
    const delta = Math.min(rawDelta, 0.1);
    this.previousTime = time;
    this.advance(delta, rawDelta, time, true);
  };

  /** Shared normal/replay update; only the test clock can omit presentation frames. */
  private advance(delta: number, rawDelta: number, time: number, render: boolean, beforeFire?: () => void) {
    const clocks = frameClocks(this.phase, this.countdown, delta);
    delta = clocks.player;
    const wasBreaching = this.phase === 'breaching';
    this.dirty = false;
    this.elapsed += delta;
    this.frameCount++;
    this.fpsTime += rawDelta;
    if (this.fpsTime >= 1) { this.fps = Math.round(this.frameCount / this.fpsTime); this.fpsTime = 0; this.frameCount = 0; }
    const wasCountdown = this.phase === 'countdown';
    if (wasCountdown) {
      this.countdown = clocks.countdown;
      if (this.countdown === 0) { this.phase = 'playing'; this.audio.setPlaying(true); this.publish(); }
    }
    if (this.playerActive) {
      const previousGun = this.firearm;
      const previousActive = this.arsenal.active;
      const previousAmmo = this.firearm.ammo;
      const wasReloading = this.firearm.reloading;
      const wasSwitching = this.arsenal.switching;
      const previousFire = this.firearm.fireProgress;
      const wasFiring = this.firearm.fireRemaining > 0;
      const previousReload = this.firearm.reloadProgress;
      this.arsenal.update(delta);
      if (!wasCountdown) this.skillActiveTime += Math.min(delta, this.skill.remaining);
      this.skill.update(delta);
      const gun = this.firearm;
      const ejectAt = gun.definition.shellReload || gun.definition.id === 'sniper' ? 0.55 : 0.2;
      // 左轮只在原始换弹动画中退壳；泵动与拉栓武器等机械动作推进后再抛壳。
      if (wasFiring && previousGun === gun && gun.definition.id !== 'revolver' && previousFire < ejectAt && gun.fireProgress >= ejectAt) {
        const shellOrigin = this.weapon.root.localToWorld(new THREE.Vector3(0.04, -0.02, -0.12));
        const velocity = new THREE.Vector3(1.8, 1.2, 0.1).applyQuaternion(this.camera.quaternion);
        this.addEffect(shellOrigin, velocity, new THREE.Vector3(0.03, 0.025, 0.085), gun.definition.shellReload ? 0x984038 : 0xbb9751, 0.85, 5, true, false);
      }
      if (this.arsenal.active !== previousActive) { this.weapon.select(this.arsenal.active); this.recoil = 0; this.flashTime = 0; this.audio.tone(230, 350, 0.07, 0.03); this.publish(); }
      if (this.arsenal.switching !== wasSwitching) this.publish();
      if (!wasReloading && this.firearm.reloading) { this.audio.tone(660, 220, 0.09, 0.035); this.publish(); }
      if (this.firearm.definition.shellReload && this.firearm.ammo > previousAmmo && previousGun === this.firearm) { this.audio.tone(180, 380, 0.055, 0.035); this.publish(); }
      if (wasReloading && previousGun === this.firearm && !this.firearm.definition.shellReload) {
        const progress = this.firearm.reloadProgress;
        if (previousReload < 0.14 && progress >= 0.14) this.audio.tone(520, 210, 0.055, 0.035);
        if (previousReload < 0.71 && progress >= 0.71) this.audio.tone(190, 410, 0.06, 0.045);
        if (this.firearm.reloadEmpty && previousReload < 0.9 && progress >= 0.9) this.audio.tone(900, 230, 0.06, 0.04);
      }
      if (wasReloading && !previousGun.reloading) { this.audio.tone(350, 700, 0.08); this.publish(); }
      this.recoil *= Math.exp(-delta * 15);
      this.flashTime = Math.max(0, this.flashTime - delta);
      this.blood.update(delta);
      this.armorEffects.update(delta);
      if (clocks.enemy > 0) this.encounter.update(clocks.enemy, this.spawnEnemy);
      this.enemyFeedback();
      // Unrendered fixed-clock replay frames need exact collision poses only.
      // syncCollision uses the same Float32 part matrices lazily; visible play keeps full sync.
      if (this.replayClock && !render) this.zombieField.syncCollision(this.encounter);
      else this.zombieField.sync(this.encounter);
      if (this.encounter.failed) this.endRun();
      else if (!wasCountdown && this.encounter.mode === 'survival' && this.encounter.waveCleared) this.finishWave();
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
    if (this.phase === 'breaching') {
      const complete = this.breachSequence.update(this.camera, wasBreaching ? rawDelta : 0);
      this.zombieField.sync(this.encounter, this.breachSequence.progress);
      if (complete) { this.phase = 'failed'; this.callbacks.onEnd(this.result!); this.publish(); }
    } else if (this.phase !== 'failed') this.updateAim(this.playerActive ? delta : 0);
    if (this.playerActive && beforeFire) { beforeFire(); this.updateAim(0); }
    if (this.playerActive && this.trigger && this.firearm.definition.automatic) this.shoot();
    const flashColor = this.skill.active ? this.skillMaterials[this.selectedWeapon].color : this.tracerMaterial.color;
    this.weapon.flash.traverse(node => { if (node instanceof THREE.Mesh) (node.material as THREE.MeshBasicMaterial).color.copy(flashColor); });
    this.weapon.light.color.copy(flashColor);
    this.weapon.flash.visible = this.flashTime > 0 && this.playerActive;
    this.weapon.offhandFlash.visible = this.weapon.offhand.visible && this.weapon.flash.visible;
    this.weapon.offhandFlash.rotation.z = -this.elapsed * 26;
    this.weapon.flash.rotation.z = this.elapsed * 26;
    this.weapon.light.intensity = this.weapon.flash.visible ? 8 : 0;
    if (this.playerActive && time - this.shadowTime > 100) {
      this.renderer.shadowMap.needsUpdate = true;
      this.shadowTime = time;
    }
    if (render) { this.renderer.render(this.scene, this.camera); this.renderCount++; }
    // 特写取景与首帧材质准备可能耗时；从首帧呈现后重新计时，避免吞掉两秒动画。
    if (!wasBreaching && this.phase === 'breaching') this.previousTime = 0;
    if (time - this.publishTime > 200) { this.publishTime = time; this.publish(); }
  };

  /** Dedicated Vite replay mode only: no state editor, damage or wave skipping. */
  replayControls() {
    if (!import.meta.env.DEV || import.meta.env.MODE !== 'replay') return undefined;
    const project = (point: THREE.Vector3) => {
      const p = point.project(this.camera), rect = this.host.getBoundingClientRect();
      return { x: rect.left + (p.x + 1) * this.width / 2, y: rect.top + (1 - p.y) * this.height / 2 };
    };
    return {
      begin: (weapon: WeaponId, seed: number) => {
        if (!this.weapon.loaded || !Number.isSafeInteger(seed)) throw new Error('Replay not ready or invalid seed');
        this.scene.updateMatrixWorld(true);
        this.replayCollision ??= new StaticCollision(this.world.surfaces);
        this.replayClock = true; cancelAnimationFrame(this.frameId); this.replaySeed = seed; this.replayTime = 0;
        this.setSound(false); this.begin('survival', weapon);
      },
      step: (dt: number, render = false, beforeFire?: () => void) => {
        if (![1 / 30, 1 / 60].includes(dt)) throw new Error('Replay requires 30/60 FPS fixed steps');
        if (document.hidden) return;
        this.replayTime += dt * 1000; this.advance(dt, dt, this.replayTime, render, beforeFire);
      },
      choose: (id: UpgradeId | null) => this.chooseUpgrade(id),
      observe: () => ({
        phase: this.phase, time: this.encounter.elapsed, wave: this.wave, completed: this.completed,
        ammo: this.firearm.ammo, reloading: this.firearm.reloading, blocked: this.arsenal.blocked,
        automatic: this.firearm.definition.automatic,
        canFire: !this.arsenal.blocked && !this.firearm.reloading && this.firearm.cooldown <= 1e-8 && (this.skill.active && this.selectedWeapon === 'rifle' || this.firearm.ammo > 0),
        skillActive: this.skill.active, skillCooldown: this.skill.cooldownRemaining, infiniteAmmo: this.skill.active && this.selectedWeapon === 'rifle',
        shots: this.arsenal.shots, hits: this.hitCount, headHits: this.headHitCount, criticalHits: this.criticalHitCount, criticalHeadHits: this.criticalHeadHitCount, kills: this.kills,
        skillActivations: this.skill.activations, skillTime: this.skillActiveTime,
        choices: [...this.choices], levels: { ...this.levels }, clearTime: this.clearTime,
        targets: this.encounter.zombies.filter(z => z.health > 0 && this.visiblePoint(z, zombieScale(z.kind), true)).map(z => ({
          id: z.id, kind: z.kind, distance: distanceToBreach(z),
          eta: distanceToBreach(z) / (PRESSURE.speed * zombieSpeed(z.kind) * (z.enraged ? ENEMY_RULES.berserker.speedMultiplier : 1) * (1 - (z.slowRemaining ? z.slowFraction ?? 0 : 0))),
          head: project(new THREE.Vector3(z.x, 1.83 * zombieScale(z.kind), z.z)),
          chest: project(new THREE.Vector3(z.x, 1.25 * zombieScale(z.kind), z.z)),
          miss: project(new THREE.Vector3(z.x, 35, z.z)),
        })),
        allTargets: this.encounter.zombies.map(z => ({ id: z.id, kind: z.kind, health: z.health, maxHealth: z.maxHealth, spawnZone: z.spawnZone,
          enraged: z.enraged ?? false, specialState: z.specialState, specialRemaining: z.specialRemaining ?? 0, specialCooldown: z.specialCooldown ?? 0, commandRemaining: z.commandRemaining ?? 0 })),
        enemyEventCounts: { ...this.enemyEventCounts }, teleportCount: this.teleportCount,
        resources: { effects: this.effects.length, sceneChildren: this.scene.children.length, geometries: this.renderer.info.memory.geometries, textures: this.renderer.info.memory.textures },
      }),
    };
  }

  private publish() {
    this.callbacks.onState({ rogue: this.rogueSnapshot(), phase: this.phase, mode: this.encounter.mode, difficulty: this.encounter.difficulty, survived: this.encounter.elapsed, alive: this.encounter.alive, zombieCounts: this.encounter.zombieCounts, nearest: this.encounter.nearest, spawnRate: this.encounter.pressure.spawnRate, speed: this.encounter.pressure.speed, result: this.result, ammo: this.firearm.ammo, reloading: this.firearm.reloading, shots: this.arsenal.shots, hits: this.hitCount, kills: this.kills, fps: this.fps, yaw: THREE.MathUtils.radToDeg(this.view.x), pitch: THREE.MathUtils.radToDeg(this.view.y), sound: this.audio.enabled, volume: this.audio.volume, breach: this.breachFeedback(), pixelated: this.pixelated, weaponsReady: this.weapon.loaded, weaponIndex: this.arsenal.active, requestedWeapon: this.arsenal.requested, switching: this.arsenal.switching, reloadQueued: this.arsenal.reloadQueued, inventory: this.arsenal.guns.map(gun => gun.ammo) });
  }

  private breachFeedback(): GameSnapshot['breach'] {
    const zombie = this.encounter.zombies.find(z => z.id === this.encounter.breachedId);
    if (!zombie) return null;
    const position = new THREE.Vector3(zombie.x, 2.95 * zombieScale(zombie.kind), zombie.z).project(this.camera);
    return { id: zombie.id, kind: zombie.kind, x: (position.x + 1) * 50, y: (1 - position.y) * 50, side: zombie.x < -1.2 ? '左侧' : zombie.x > 1.2 ? '右侧' : '正前方' };
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
      rogue: this.rogueSnapshot(), lockedId: this.lockedId, offhandVisible: this.weapon.offhand.visible, offhandMuzzle: this.weapon.offhandMuzzle.getWorldPosition(new THREE.Vector3()).toArray(), seed: this.seed, phase: this.phase, mode: this.encounter.mode, difficulty: this.encounter.difficulty, survived: this.encounter.elapsed, totalSpawned: this.encounter.totalSpawned, pressure: this.encounter.pressure, nearest: this.encounter.nearest, result: this.result, ammo: this.firearm.ammo, shots: this.arsenal.shots, hits: this.hitCount, kills: this.kills, reloading: this.firearm.reloading,
      yaw: this.view.x, pitch: this.view.y, aim: this.aim.toArray(), aimPoint: this.aimPoint.toArray(), muzzle: muzzle.toArray(), barrelDirection: barrelDirection.toArray(),
      flashVisible: this.weapon.flash.visible, weaponVisible: this.weapon.root.visible, effects: this.effects.length, lastShot: this.lastShot, drawCalls: this.renderer.info.render.calls, renderCount: this.renderCount, fps: this.fps,
      criticalHits: this.criticalHitCount, criticalHeadHits: this.criticalHeadHitCount,
      enemyEventCounts: { ...this.enemyEventCounts }, teleportCount: this.teleportCount,
      blood: this.blood.diagnostics(),
      armorEffects: this.armorEffects.diagnostics(), audio: this.audio.diagnostics(), breach: this.breachFeedback(), defenseVisible: false,
      breachElapsed: this.breachSequence.elapsed, cameraPosition: this.camera.position.toArray(), cameraFov: this.camera.fov,
      obstacles: this.world.obstacles, blockedZombies: this.encounter.zombies.filter(z => z.health > 0 && !(z.kind === 'giant' ? this.giantNavigation : this.navigation).clear(z, z)).map(z => z.id),
      weaponIndex: this.arsenal.active, requestedWeapon: this.arsenal.requested, switching: this.arsenal.switching, switchProgress: this.arsenal.switchProgress, inventory: this.arsenal.guns.map(gun => gun.ammo), weaponAnimation: this.weapon.diagnostics(),
      reload: { progress: this.firearm.reloadProgress, remaining: this.firearm.reloadRemaining, empty: this.firearm.reloadEmpty, cycle: this.firearm.animationProgress },
      targets: this.encounter.zombies.map(z => ({ id: z.id, kind: z.kind, maxHealth: z.maxHealth, armorHealth: z.armorHealth, bodyHealth: Math.max(0, z.health - z.armorHealth), spawnZone: z.spawnZone, health: z.health, x: z.x, z: z.z, bornAt: z.bornAt, avoidance: z.avoidance ?? 0, heading: z.heading, enraged: z.enraged ?? false, slowRemaining: z.slowRemaining ?? 0, specialState: z.specialState, specialRemaining: z.specialRemaining ?? 0, specialCooldown: z.specialCooldown ?? 0, commandRemaining: z.commandRemaining ?? 0, head: project(new THREE.Vector3(z.x, 1.83 * zombieScale(z.kind), z.z)), chest: project(new THREE.Vector3(z.x, 1.25 * zombieScale(z.kind), z.z + 0.2)) })),
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
    this.renderer.domElement.removeEventListener('wheel', this.wheel);
    document.removeEventListener('visibilitychange', this.visibility);
    this.audio.dispose();
    this.weapon.dispose();
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
    Object.values(this.skillMaterials).forEach(material => material.dispose());
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

declare global { interface Window { __undeadTower?: { snapshot: () => ReturnType<Game['diagnostics']> }; __undeadReplay?: NonNullable<ReturnType<Game['replayControls']>>; } }
