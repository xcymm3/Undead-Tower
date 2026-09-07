import { BuildInventory } from './ui/BuildInventory';
import { SkillHud } from './ui/SkillHud';
import { ROGUE_KEY, waveIntel } from './game/rogue';
import { hitFeedbackText, type HitFeedback } from './game/hitFeedback';
import { UpgradePanel } from './ui/UpgradePanel';
import { useEffect, useRef, useState } from 'react';
import { Game } from './game/Game';
import { WEAPONS } from './game/weapons';
import type { WeaponId } from './game/weapons';
import { FIXED_DIFFICULTY } from './game/config';
import type { GameMode, GameSnapshot } from './game/config';
import { formatDuration, LeaderboardStore, personalRecord } from './game/leaderboard';
import type { PersonalRecord } from './game/leaderboard';
import { BreachOverlay, DeploymentPanel, LeaderboardTable, ResultPanel } from './ui/SessionPanels';

const initialState: GameSnapshot = { weaponsReady: false, weaponIndex: 0, requestedWeapon: 0, switching: false, reloadQueued: false, inventory: WEAPONS.map(gun => gun.capacity), phase: 'ready', mode: 'practice', difficulty: FIXED_DIFFICULTY, survived: 0, alive: 4, zombieCounts: { normal: 4, cone: 0, bucket: 0, football: 0, giant: 0, wizard: 0, skitter: 0, charger: 0, howler: 0, berserker: 0 }, nearest: null, spawnRate: 0, speed: 0, result: null, ammo: 30, reloading: false, shots: 0, hits: 0, kills: 0, fps: 0, yaw: 0, pitch: 0, sound: true, volume: 1, breach: null, pixelated: false };

function Icon({ name, size = 18 }: { name: 'tower' | 'aim' | 'sound' | 'mute' | 'settings' | 'expand' | 'pause' | 'arrow' | 'close'; size?: number }) {
  const paths = {
    tower: <><path d="M5 3h14v4H5zM7 7v7h10V7M8 14 4 22m12-8 4 8M7 18h10M10 8v3m4-3v3" /></>,
    aim: <><circle cx="12" cy="12" r="7" /><path d="M12 1v6m0 10v6M1 12h6m10 0h6" /></>,
    sound: <><path d="m11 4-6 5H2v6h3l6 5ZM15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" /></>,
    mute: <><path d="m11 4-6 5H2v6h3l6 5ZM16 9l6 6m0-6-6 6" /></>,
    settings: <><path d="M4 5h16M4 12h16M4 19h16M8 2v6m8 1v6m-6 1v6" /></>,
    expand: <path d="M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6" />,
    pause: <><path d="M8 5v14M16 5v14" /></>,
    arrow: <path d="M3 12h17m-6-6 6 6-6 6" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" aria-hidden="true">{paths[name]}</svg>;
}

function RifleIcon() {
  return <svg className="rifle-icon" viewBox="0 0 150 40" fill="currentColor" aria-hidden="true"><path d="M2 9h31v4h19V8h40v4h37v3h18v4h-18v2H88v5H75l-2 12H63l-3-15H49l-4 11h-8l3-14H23l-7 6H2zM66 3h17v4H66z" /></svg>;
}

export function App() {
  const host = useRef<HTMLDivElement>(null);
  const game = useRef<Game | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const resumeAfterSettings = useRef(false);
  const [state, setState] = useState(initialState);
  const [error, setError] = useState('');
  const [settings, setSettings] = useState(false);
  const [feedback, setFeedback] = useState<(HitFeedback & { key: number }) | null>(null);
  const [record, setRecord] = useState<PersonalRecord | null>(null);
  const hitTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [fullscreen, setFullscreen] = useState(false);
  const [mode, setMode] = useState<GameMode>('practice');
  const [selectedWeapon, setSelectedWeapon] = useState<WeaponId>('pistol');
  const [boardWeapon, setBoardWeapon] = useState<WeaponId>('pistol');
  const scoreDialog = useRef<HTMLDialogElement>(null);
  const [leaderboard] = useState(() => new LeaderboardStore(undefined, ROGUE_KEY));
  const [entries, setEntries] = useState(() => leaderboard.read());
  const [saved, setSaved] = useState(leaderboard.persistent);

  useEffect(() => {
    if (!host.current) return;
    try {
      const instance = new Game(host.current, {
        onState: setState,
        onHit: hit => {
          clearTimeout(hitTimer.current);
          setFeedback({ ...hit, key: performance.now() });
          hitTimer.current = setTimeout(() => setFeedback(null), 520);
        },
        onError: setError,
        onEnd: result => { setRecord(personalRecord(result, leaderboard.read())); setEntries(leaderboard.record(result)); setSaved(leaderboard.persistent); setFeedback(null); },
      });
      game.current = instance;
      if (import.meta.env.DEV && import.meta.env.MODE === 'replay') window.__undeadReplay = instance.replayControls();
      if (import.meta.env.DEV) window.__undeadTower = { snapshot: () => instance.diagnostics() };
    } catch (cause) {
      console.error(cause);
      setError('无法启动 3D 场景。请使用支持 WebGL 2 的桌面版 Chrome 或 Edge，并开启硬件加速。');
    }
    const onFullscreen = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFullscreen);
    return () => {
      clearTimeout(hitTimer.current);
      document.removeEventListener('fullscreenchange', onFullscreen);
      delete window.__undeadTower;
      delete window.__undeadReplay;
      game.current?.dispose();
      game.current = null;
    };
  }, [leaderboard]);

  const openSettings = () => {
    resumeAfterSettings.current = state.phase === 'playing' || state.phase === 'countdown';
    game.current?.pause();
    setSettings(true);
    dialog.current?.showModal();
  };
  const closeSettings = () => {
    dialog.current?.close();
    setSettings(false);
    if (resumeAfterSettings.current) game.current?.start();
  };
  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch { setError('当前窗口不支持全屏，请在独立浏览器中打开游戏。'); }
  };

  const weapon = state.rogue?.stats ?? WEAPONS[state.weaponIndex];
  const playerActive = state.phase === 'playing' || state.phase === 'countdown';
  const pendingWeapon = state.requestedWeapon !== state.weaponIndex;

  return <main className={`game-shell phase-${state.phase}`}>
    <div ref={host} className={`viewport ${state.pixelated ? 'pixelated' : ''}`}>
      {playerActive && <div className={`crosshair ${feedback ? 'is-hit' : ''} ${state.reloading ? 'is-reloading' : ''}`} aria-hidden="true"><i /><i /><i /><i /><b />{feedback && <span className="hit-mark" key={feedback.key}>×</span>}</div>}
      <div className="deadeye-reticle" aria-hidden="true"><i /><i /><i /><i /><span>目标锁定</span></div>
    </div>
    <div className="vignette" aria-hidden="true" />

    <header className="topbar" inert={state.phase === 'breaching'}>
      <div className="brand"><span className="brand-mark"><Icon name="tower" size={27} /></span><div>UNDEAD TOWER<small>灰松哨站 · PINE RIDGE</small></div></div>
      {state.phase !== 'ready' && <div className="compass" aria-label="朝向始终固定在北方附近"><div className="compass-ticks" style={{ transform: `translateX(${state.yaw * 3}px)` }}><span>345</span><i /><i /><b>N</b><i /><i /><span>015</span></div><span className="compass-notch" /><small>固定朝向</small></div>}
      <div className="top-actions">
        <span className="build-label">ROGUE <b>SIX ARMS</b></span>
        <button className="icon-button sound-button" onClick={() => game.current?.setSound(!state.sound)} aria-label={state.sound ? '关闭声音' : '开启声音'} title={state.sound ? '关闭声音 · M' : '开启声音 · M'}><Icon name={state.sound ? 'sound' : 'mute'} /></button>
        <button className="icon-button" onClick={toggleFullscreen} aria-label={fullscreen ? '退出全屏' : '进入全屏'} title="切换全屏"><Icon name="expand" /></button>
        <button className="icon-button" onClick={openSettings} aria-label="游戏设置" title="游戏设置"><Icon name="settings" /></button>
        {playerActive && <button className="icon-button" onClick={() => game.current?.pause()} aria-label="暂停游戏" title="暂停 · Esc"><Icon name="pause" /></button>}
      </div>
    </header>

    {state.phase === 'ready' && <section className="intro mode-menu" aria-labelledby="game-title">
      <div className="intro-copy">
        <div className="field-tag"><span /> 灰松哨站 / 尸群正在逼近</div>
        <h1 id="game-title">UNDEAD<br /><span>TOWER</span><b>.</b></h1>
        <p className="intro-line">一座哨塔。一个方向。守住这里。</p>
        <p className="intro-description">六款武器，逐波升级。守住北侧防线。</p>
        <div className="intro-controls"><span><kbd>鼠标</kbd> 瞄准</span><span><kbd>左键</kbd> 开火</span><span><kbd>R</kbd> 换弹</span><span><kbd>1–6 / 滚轮</kbd> 练习切枪</span></div>
      </div>
      <DeploymentPanel mode={mode} onMode={setMode} weapon={selectedWeapon} onWeapon={setSelectedWeapon} onStart={() => { setFeedback(null); game.current?.begin(mode, selectedWeapon); }} disabled={Boolean(error) || !state.weaponsReady} onLeaderboard={() => { setEntries(leaderboard.read()); scoreDialog.current?.showModal(); }} />
      {!state.weaponsReady && !error && <div className="weapon-loading" role="status">正在准备六款枪械…</div>}
      <div className="intro-foot"><span className="signal-dot" /> 固定哨位 · 僵尸生存 <span className="intro-foot-right">有限视角 / LOW-POLY WORLD</span></div>
    </section>}

    {(playerActive || state.phase === 'paused') && <div className="hud" aria-label="游戏状态">
      <aside className="objective"><span className="label">{state.mode === 'practice' ? 'FIELD TRAINING' : `ROGUE / WAVE ${state.rogue?.wave ?? 1}`}</span><h2>{state.mode === 'practice' ? '僵尸练习靶场' : '守住北侧防线'}</h2><p><span className="tiny-square" /> {state.mode === 'practice' ? '僵尸静止站位，击倒后复位' : '留意各条通路，不要让僵尸接近'}</p><div className="objective-score"><span><b>{String(state.kills).padStart(2, '0')}</b> 击杀</span><span><b>{state.hits}</b> 命中</span><span><b>{state.shots ? Math.round(state.hits / state.shots * 100) : '—'}{state.shots > 0 && '%'}</b> 命中率</span></div></aside>
      {state.mode === 'survival' && <><div className="survival-clock"><span>已通过 {state.rogue?.completed ?? 0} 波</span><strong data-testid="wave-number">第 {state.rogue?.wave ?? 1} 波</strong><small data-testid="survival-clock">{formatDuration(state.survived)}</small></div><aside className="horde-status"><span className="label">INCOMING HORDE</span><p data-testid="wave-remaining">本波剩余 <b>{state.rogue?.remaining ?? state.alive}</b> / {state.rogue?.total ?? state.alive}</p><small>普通 {state.zombieCounts.normal} · 路障 {state.zombieCounts.cone} · 铁桶 {state.zombieCounts.bucket}</small><small>橄榄球 {state.zombieCounts.football} · 巨人 {state.zombieCounts.giant} · 巫师 {state.zombieCounts.wizard}</small><small>游走 {state.zombieCounts.skitter} · 突进 {state.zombieCounts.charger}</small><small>号令 {state.zombieCounts.howler} · 狂暴 {state.zombieCounts.berserker}</small><small>刷新 {state.spawnRate.toFixed(1)} / 秒 · 基础移速 {state.speed.toFixed(1)} m/s</small></aside><div className={`proximity ${state.nearest !== null && state.nearest < 14 ? 'danger' : ''}`}>{state.nearest === null ? '留意公路和林地，僵尸即将出现' : state.nearest < 14 ? '僵尸逼近哨塔！' : '尸群正在接近'}</div></>}
      {state.rogue && <><SkillHud state={state.rogue} /><BuildInventory weapon={state.rogue.weapon} levels={state.rogue.levels} compact /></>}
      <div className="station"><Icon name="tower" size={24} /><div>04 <span>灰松哨站</span><small>{state.mode === 'practice' ? '练习模式 · 不计入排行榜' : `正式模式 · ${weapon.label}`}</small></div></div>
      {feedback && playerActive && <div className={`hit-feedback ${feedback.head || feedback.critical ? 'headshot' : ''}`} data-critical={feedback.critical} key={feedback.key}>{hitFeedbackText(feedback).label}<small>{hitFeedbackText(feedback).detail}</small></div>}
      <div className={`ammo-panel ${state.ammo === 0 ? 'empty' : ''}`}><div className="weapon-label"><RifleIcon /><span data-testid="weapon-name">{weapon.label}<small>{weapon.short} · {weapon.automatic ? '按住连发' : '单次射击'}</small></span></div><div className="ammo-count"><strong data-testid="ammo">{state.rogue?.skill.active && weapon.id === 'rifle' ? '∞' : String(state.ammo).padStart(2, '0')}</strong><span>/ {weapon.capacity}<small>哨站备弹 ∞</small></span></div><div className="ammo-bars" aria-hidden="true">{Array.from({ length: weapon.capacity }, (_, i) => <i key={i} className={i < state.ammo ? 'loaded' : ''} />)}</div><span className="reload-hint">{state.switching ? '切换中…' : pendingWeapon ? `动作结束后切换 · ${WEAPONS[state.requestedWeapon].label}` : state.reloadQueued ? '准备装填…' : state.reloading ? weapon.shellReload ? '逐发装填中…' : '正在更换弹匣…' : state.ammo === 0 ? '弹匣已空 · 按 R 换弹' : <><kbd>R</kbd> 换弹</>}</span></div>
      {state.mode === 'practice' && <div className="weapon-slots" role="group" aria-label="切换武器">{WEAPONS.map((gun, index) => <button key={gun.id} disabled={state.phase !== 'playing'} aria-label={`切换到${gun.label}`} aria-pressed={index === state.weaponIndex} data-pending={pendingWeapon && index === state.requestedWeapon} onClick={() => game.current?.switchWeapon(index)} title={`${index + 1} · ${gun.label}`}><kbd>{index + 1}</kbd><span>{gun.short}</span><small>{state.inventory[index]}</small></button>)}<p>数字键 1–6 / 滚轮切换</p></div>}
      {state.reloading && <div className="reload-progress" role="status"><span>装填中</span><i /></div>}
      <footer className="play-footer"><div><span className="signal-dot" /><span>{state.fps} FPS</span><span className="footer-divider" /><span>视角 {Math.abs(state.yaw).toFixed(1)}° / 4.0°</span></div><div><span><kbd>鼠标</kbd> 瞄准</span><span><kbd>左键</kbd> {weapon.automatic ? '按住连发' : '单次射击'}</span><span><kbd>ESC</kbd> 暂停</span></div></footer>
    </div>}

    {state.phase === 'paused' && !settings && <section className="pause-screen" aria-label="暂停菜单"><div className="pause-content"><Icon name="tower" size={36} /><span className="label">WATCH ON HOLD</span><h2>哨站已暂停</h2><p>准备好后，继续守望前方。{state.mode === 'survival' && '坚守计时已暂停。'}</p><button className="start-button" onClick={() => game.current?.start()}>继续游戏 <Icon name="arrow" /></button><button className="text-button" onClick={() => { setFeedback(null); game.current?.reset(); }}>{state.mode === 'practice' ? '重新开始训练' : '重新开始坚守'}</button><button className="text-button" onClick={() => { setFeedback(null); game.current?.menu(); }}>返回主菜单</button><small>按 ESC 继续</small></div></section>}

    {state.phase === 'countdown' && <section className="wave-countdown" role="status"><span>准备迎战 · 第 {state.rogue?.wave} 波</span><strong>{state.rogue?.countdown}</strong>{waveIntel(state.rogue?.wave ?? 1).map(tip => <p className="enemy-intel" key={tip}>{tip}</p>)}</section>}
    {state.phase === 'upgrade' && state.rogue && <UpgradePanel key={state.rogue.wave} state={state.rogue} onConfirm={id => game.current?.chooseUpgrade(id)} />}
    {state.phase === 'breaching' && state.breach && <BreachOverlay breach={state.breach} />}
    {state.phase === 'failed' && state.result && <ResultPanel result={state.result} entries={entries} saved={saved} record={record} breach={state.breach} onRetry={() => game.current?.reset()} onMenu={() => game.current?.menu()} />}

    <dialog ref={scoreDialog} className="settings-dialog leaderboard-dialog" aria-labelledby="leaderboard-title" onKeyDown={event => { if (event.key === 'Escape') event.stopPropagation(); }}>
      <div className="dialog-heading"><div><span className="label">LOCAL RECORDS</span><h2 id="leaderboard-title">坚守排行榜</h2></div><button className="icon-button" onClick={() => scoreDialog.current?.close()} aria-label="关闭排行榜"><Icon name="close" /></button></div>
      <p className="settings-intro">六枪肉鸽 · 每枪本机前 10 名</p><label className="leaderboard-filter">武器 <select value={boardWeapon} onChange={event => setBoardWeapon(event.target.value as WeaponId)}>{WEAPONS.map(gun => <option key={gun.id} value={gun.id}>{gun.label}</option>)}</select></label><LeaderboardTable entries={entries} difficulty={FIXED_DIFFICULTY} weapon={boardWeapon} /><p className="board-footnote">正式模式结束后自动记录。<br />成绩保存在当前浏览器；六枪规则独立记榜，旧手枪榜数据仍保留在原存储键。</p>
    </dialog>

    <dialog ref={dialog} className="settings-dialog" aria-labelledby="settings-title" onCancel={event => { event.preventDefault(); event.stopPropagation(); closeSettings(); }} onKeyDown={event => { if (event.key === 'Escape') event.stopPropagation(); }}>
      <div className="dialog-heading"><div><span className="label">FIELD PREFERENCES</span><h2 id="settings-title">哨站设置</h2></div><button className="icon-button" onClick={closeSettings} aria-label="关闭设置"><Icon name="close" /></button></div>
      <label className="toggle-row"><span>游戏声音<small>{state.sound ? '已开启' : '已静音'}</small></span><input type="checkbox" checked={state.sound} onChange={event => game.current?.setSound(event.target.checked)} /><i /></label>
      <div className="volume-control"><label htmlFor="volume">总音量 <b>{Math.round(state.volume * 100)}%{!state.sound && ' · 已静音'}</b></label><input id="volume" type="range" min="0" max="100" step="1" value={Math.round(state.volume * 100)} onChange={event => game.current?.setVolume(Number(event.target.value) / 100)} /><small>自动保存音量与静音设置</small></div>
      <label className="toggle-row"><span>粗颗粒像素<small>{state.pixelated ? '已开启 · 界面保持清晰' : '已关闭 · 原始分辨率'}</small></span><input type="checkbox" checked={state.pixelated} onChange={event => game.current?.setPixelated(event.target.checked)} /><i /></label>
      <button className="start-button dialog-done" data-state="success" aria-label="返回哨站" onClick={closeSettings}>完成 <Icon name="arrow" /></button>
    </dialog>

    {error && <div className="error-notice" role="alert"><p>{error}</p><button className="text-button" onClick={() => location.reload()}>重新加载</button></div>}
    <div className="mobile-notice">建议使用电脑横屏，搭配鼠标和键盘游玩。</div>
  </main>;
}
