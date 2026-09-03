import { useEffect, useRef, useState } from 'react';
import { Game } from './game/Game';
import type { GameSnapshot } from './game/config';

const initialState: GameSnapshot = { phase: 'ready', ammo: 30, reloading: false, shots: 0, hits: 0, kills: 0, fps: 0, yaw: 0, pitch: 0, sound: true, pixelated: false };

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
  const [damping, setDamping] = useState(2.4);
  const [feedback, setFeedback] = useState<{ head: boolean; killed: boolean; key: number } | null>(null);
  const hitTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    if (!host.current) return;
    try {
      const instance = new Game(host.current, {
        onState: setState,
        onHit: (head, killed) => {
          clearTimeout(hitTimer.current);
          setFeedback({ head, killed, key: performance.now() });
          hitTimer.current = setTimeout(() => setFeedback(null), 520);
        },
        onError: setError,
      });
      game.current = instance;
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
      game.current?.dispose();
      game.current = null;
    };
  }, []);

  const openSettings = () => {
    resumeAfterSettings.current = state.phase === 'playing';
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

  return <main className={`game-shell phase-${state.phase}`}>
    <div ref={host} className={`viewport ${state.pixelated ? 'pixelated' : ''}`}>
      {state.phase === 'playing' && <div className={`crosshair ${feedback ? 'is-hit' : ''} ${state.reloading ? 'is-reloading' : ''}`} aria-hidden="true"><i /><i /><i /><i /><b />{feedback && <span className="hit-mark" key={feedback.key}>×</span>}</div>}
    </div>
    <div className="vignette" aria-hidden="true" />

    <header className="topbar">
      <div className="brand"><span className="brand-mark"><Icon name="tower" size={27} /></span><div>UNDEAD TOWER<small>灰松哨站 · PINE RIDGE</small></div></div>
      {state.phase !== 'ready' && <div className="compass" aria-label="朝向始终固定在北方附近"><div className="compass-ticks" style={{ transform: `translateX(${state.yaw * 3}px)` }}><span>345</span><i /><i /><b>N</b><i /><i /><span>015</span></div><span className="compass-notch" /><small>固定朝向</small></div>}
      <div className="top-actions">
        <span className="build-label">PROTOTYPE <b>0.1</b></span>
        <button className="icon-button sound-button" onClick={() => game.current?.setSound(!state.sound)} aria-label={state.sound ? '关闭声音' : '开启声音'} title={state.sound ? '关闭声音 · M' : '开启声音 · M'}><Icon name={state.sound ? 'sound' : 'mute'} /></button>
        <button className="icon-button" onClick={toggleFullscreen} aria-label={fullscreen ? '退出全屏' : '进入全屏'} title="切换全屏"><Icon name="expand" /></button>
        <button className="icon-button" onClick={openSettings} aria-label="游戏设置" title="游戏设置"><Icon name="settings" /></button>
        {state.phase === 'playing' && <button className="icon-button" onClick={() => game.current?.pause()} aria-label="暂停游戏" title="暂停 · Esc"><Icon name="pause" /></button>}
      </div>
    </header>

    {state.phase === 'ready' && <section className="intro" aria-labelledby="game-title">
      <div className="intro-copy">
        <div className="field-tag"><span /> 生存射击 / 首次实地测试</div>
        <h1 id="game-title">UNDEAD<br /><span>TOWER</span><b>.</b></h1>
        <p className="intro-line">一座哨塔。一个方向。守住这里。</p>
        <p className="intro-description">进入灰松哨站，拿起步枪。<br />在有限视野中瞄准前方，测试你的第一发子弹。</p>
        <button className="start-button" onClick={() => game.current?.start()} disabled={Boolean(error) || !state.fps}><span>进入哨站<small>ENTER THE WATCH</small></span><Icon name="arrow" size={26} /></button>
        <div className="intro-controls"><span><kbd>鼠标</kbd> 瞄准</span><span><kbd>左键</kbd> 开火</span><span><kbd>R</kbd> 换弹</span></div>
      </div>
      <div className="scene-caption"><span className="caption-rule" /><p>PINE RIDGE<small>北侧检查站 · 射击训练区</small></p><span className="caption-coordinates">SECTOR 04<br />NORTH APPROACH</span></div>
      <div className="intro-foot"><span className="signal-dot" /> 单人训练 · 本地运行 <span className="intro-foot-right">有限视角 / LOW-POLY WORLD</span></div>
    </section>}

    {state.phase !== 'ready' && <div className="hud" aria-label="游戏状态">
      <aside className="objective"><span className="label">FIELD TRAINING</span><h2>守望北侧公路</h2><p><span className="tiny-square" /> 瞄准人形靶，完成射击测试</p><div className="objective-score"><span><b>{String(state.kills).padStart(2, '0')}</b> 击倒</span><span><b>{state.hits}</b> 命中</span><span><b>{state.shots ? Math.round(state.hits / state.shots * 100) : '—'}{state.shots > 0 && '%'}</b> 命中率</span></div></aside>
      <div className="station"><Icon name="tower" size={24} /><div>04 <span>灰松哨站</span><small>固定哨位 · 训练靶会自动复位</small></div></div>
      {feedback && state.phase === 'playing' && <div className={`hit-feedback ${feedback.head ? 'headshot' : ''}`} key={feedback.key}>{feedback.head ? '精准命中' : feedback.killed ? '目标击倒' : '命中目标'}<small>{feedback.head ? 'HEADSHOT' : feedback.killed ? 'TARGET DOWN' : 'TARGET HIT'}</small></div>}
      <div className={`ammo-panel ${state.ammo === 0 ? 'empty' : ''}`}><div className="weapon-label"><RifleIcon /><span>R-4 CARBINE<small>5.56 × 45 MM · 自动</small></span></div><div className="ammo-count"><strong data-testid="ammo">{String(state.ammo).padStart(2, '0')}</strong><span>/ 30<small>训练备弹 ∞</small></span></div><div className="ammo-bars" aria-hidden="true">{Array.from({ length: 30 }, (_, i) => <i key={i} className={i < state.ammo ? 'loaded' : ''} />)}</div><span className="reload-hint">{state.reloading ? '正在更换弹匣…' : state.ammo === 0 ? '弹匣已空 · 按 R 换弹' : <><kbd>R</kbd> 换弹</>}</span></div>
      {state.reloading && <div className="reload-progress" role="status"><span>装填中</span><i /></div>}
      <footer className="play-footer"><div><span className="signal-dot" /><span>{state.fps} FPS</span><span className="footer-divider" /><span>视角 {Math.abs(state.yaw).toFixed(1)}° / 4.0°</span></div><div><span><kbd>鼠标</kbd> 瞄准</span><span><kbd>左键</kbd> 射击 / 按住连发</span><span><kbd>ESC</kbd> 暂停</span></div></footer>
    </div>}

    {state.phase === 'paused' && !settings && <section className="pause-screen" aria-label="暂停菜单"><div className="pause-content"><Icon name="tower" size={36} /><span className="label">WATCH ON HOLD</span><h2>哨站已暂停</h2><p>准备好后，继续守望前方。</p><button className="start-button" onClick={() => game.current?.start()}>继续游戏 <Icon name="arrow" /></button><button className="text-button" onClick={() => { setFeedback(null); game.current?.reset(); }}>重新开始训练</button><small>按 ESC 继续</small></div></section>}

    <dialog ref={dialog} className="settings-dialog" aria-labelledby="settings-title" onCancel={event => { event.preventDefault(); event.stopPropagation(); closeSettings(); }} onKeyDown={event => { if (event.key === 'Escape') event.stopPropagation(); }}>
      <div className="dialog-heading"><div><span className="label">FIELD PREFERENCES</span><h2 id="settings-title">哨站设置</h2></div><button className="icon-button" onClick={closeSettings} aria-label="关闭设置"><Icon name="close" /></button></div>
      <p className="settings-intro">枪口跟随准星，镜头缓慢跟随视线。</p>
      <label className="range-label" htmlFor="damping"><span>镜头阻尼<small>调整跟随速度，转动范围始终固定</small></span><b>{damping <= 2 ? '很强' : damping <= 3.5 ? '强' : '适中'}</b></label>
      <input id="damping" type="range" min="1" max="5" step="0.1" value={6 - damping} onChange={event => { const value = 6 - Number(event.target.value); setDamping(value); game.current?.setDamping(value); }} />
      <div className="range-ends"><span>跟随更快</span><span>阻尼更强</span></div>
      <div className="view-limits"><Icon name="aim" /><p>水平 ±4°<span>垂直 ±2.5°</span><small>始终朝向北侧公路，无法转身。</small></p></div>
      <label className="toggle-row"><span>游戏声音<small>枪声、命中与装填反馈</small></span><input type="checkbox" checked={state.sound} onChange={event => game.current?.setSound(event.target.checked)} /><i /></label>
      <label className="toggle-row"><span>粗颗粒像素<small>降低渲染分辨率，保留清晰的界面</small></span><input type="checkbox" checked={state.pixelated} onChange={event => game.current?.setPixelated(event.target.checked)} /><i /></label>
      <div className="settings-controls"><span><kbd>左键</kbd> 射击</span><span><kbd>R</kbd> 换弹</span><span><kbd>M</kbd> 静音</span><span><kbd>ESC</kbd> 暂停</span></div>
      <button className="start-button dialog-done" onClick={closeSettings}>返回哨站 <Icon name="arrow" /></button>
    </dialog>

    {error && <div className="error-notice" role="alert"><p>{error}</p><button className="text-button" onClick={() => location.reload()}>重新加载</button></div>}
    <div className="mobile-notice">建议使用电脑横屏，搭配鼠标和键盘游玩。</div>
  </main>;
}
