import { useEffect, useRef } from 'react';
import { ARMOR_SPAWNS, DIFFICULTIES, SURVIVAL } from '../game/config';
import type { Difficulty, GameMode, RunResult } from '../game/config';
import { formatDuration } from '../game/leaderboard';

export function DifficultyTabs({ value, onChange, label = '选择难度' }: { value: Difficulty; onChange: (value: Difficulty) => void; label?: string }) {
  return <div className="difficulty-tabs" role="group" aria-label={label}>{(Object.keys(DIFFICULTIES) as Difficulty[]).map(key => <button key={key} aria-pressed={value === key} onClick={() => onChange(key)}>{DIFFICULTIES[key].label}</button>)}</div>;
}

export function DeploymentPanel({ mode, difficulty, onMode, onDifficulty, onStart, onLeaderboard, disabled }: {
  mode: GameMode; difficulty: Difficulty; onMode: (mode: GameMode) => void; onDifficulty: (difficulty: Difficulty) => void; onStart: () => void; onLeaderboard: () => void; disabled: boolean;
}) {
  return <div className="deployment-panel">
    <span className="label">PREPARE YOUR WATCH</span><h2>选择你的防守</h2>
    <div className="mode-options" role="group" aria-label="游戏模式">
      <button className="mode-option" aria-pressed={mode === 'practice'} onClick={() => onMode('practice')}><span className="mode-radio" /><span>练习模式<small>静止僵尸靶 · 无限练习</small></span><b>01</b></button>
      <button className="mode-option" aria-pressed={mode === 'survival'} onClick={() => onMode('survival')}><span className="mode-radio" /><span>正式模式<small>僵尸逼近 · 挑战坚守纪录</small></span><b>02</b></button>
    </div>
    <div className="deployment-detail">
      {mode === 'survival' ? <><DifficultyTabs value={difficulty} onChange={onDifficulty} /><p>{DIFFICULTIES[difficulty].description}。<br />{difficulty === 'easy' ? '三档共享刷新和移速，最多每秒 10 只。' : difficulty === 'normal' ? `每 ${ARMOR_SPAWNS.normalPerCone} 只普通加入 1 只路障。` : `每 ${ARMOR_SPAWNS.normalPerCone} 普 → 1 路障；每 ${ARMOR_SPAWNS.conesPerBucket} 路障 → 1 铁桶。`}<br /><strong>任意僵尸进入哨塔 {SURVIVAL.breachRadius} 米内，防守失败。</strong></p></> : <><span className="practice-note">先熟悉你的第一发子弹。</span><p>僵尸固定站位，击倒后自动复位。<br />练习不会失败，也不会计入排行榜。</p></>}
    </div>
    <button className="start-button" onClick={onStart} disabled={disabled}><span>{mode === 'practice' ? '进入哨站' : '开始坚守'}<small>{mode === 'practice' ? 'ENTER THE RANGE' : 'HOLD THE LINE'}</small></span><span aria-hidden="true">→</span></button>
    <button className="leaderboard-link" onClick={onLeaderboard}>查看排行榜 <span>本机 TOP 10 ↗</span></button>
  </div>;
}

export function LeaderboardTable({ entries, difficulty, highlightId }: { entries: RunResult[]; difficulty: Difficulty; highlightId?: string }) {
  const rows = entries.filter(entry => entry.difficulty === difficulty);
  if (!rows.length) return <div className="empty-leaderboard"><span>—</span><p>还没有坚守纪录<small>完成一局{DIFFICULTIES[difficulty].label}难度的正式模式，留下第一条成绩。</small></p></div>;
  return <div className="leaderboard-scroll"><table className="leaderboard-table"><caption className="sr-only">{DIFFICULTIES[difficulty].label}难度坚守时长排行榜</caption><thead><tr><th scope="col">排名</th><th scope="col">坚守时长</th><th scope="col">击杀</th><th scope="col">日期</th></tr></thead><tbody>{rows.map((row, index) => <tr key={row.id} className={row.id === highlightId ? 'current-result' : ''}><td>{String(index + 1).padStart(2, '0')}{row.id === highlightId && <small>本次</small>}</td><td>{formatDuration(row.duration, true)}</td><td>{row.kills}</td><td>{new Date(row.endedAt).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })}</td></tr>)}</tbody></table></div>;
}

export function ResultPanel({ result, entries, saved, onRetry, onMenu }: { result: RunResult; entries: RunResult[]; saved: boolean; onRetry: () => void; onMenu: () => void }) {
  const focus = useRef<HTMLHeadingElement>(null);
  useEffect(() => { focus.current?.focus({ preventScroll: true }); }, []);
  const rank = entries.filter(r => r.difficulty === result.difficulty).findIndex(r => r.id === result.id);
  return <section className="result-screen" aria-label="游戏结束"><div className="result-panel">
    <div className="result-summary"><span className="label">PERIMETER BREACHED</span><h2 ref={focus} tabIndex={-1}>防线失守</h2><p>僵尸已进入哨塔 {SURVIVAL.breachRadius} 米内，游戏失败。</p><span className="result-time-label">你坚守了 · {DIFFICULTIES[result.difficulty].label}难度</span><strong className="result-time" data-testid="survival-result">{formatDuration(result.duration, true)}</strong><div className="result-stats"><span><b>{result.kills}</b> 击杀</span><span><b>{result.shots}</b> 发射</span><span><b>{result.shots ? Math.round(result.hits / result.shots * 100) : 0}%</b> 命中率</span></div><p className="record-notice" role="status">{saved ? rank >= 0 ? `已保存 · 本机${DIFFICULTIES[result.difficulty].label}榜第 ${rank + 1} 名` : '本次未进入前 10 名，继续挑战。' : '浏览器无法保存，本次成绩仅在当前页面保留。'}</p><button className="start-button" onClick={onRetry}>再守一次 <span aria-hidden="true">→</span></button><button className="text-button" onClick={onMenu}>返回主菜单</button></div>
    <div className="result-leaderboard"><div className="board-heading"><h3>坚守排行榜</h3><span>{DIFFICULTIES[result.difficulty].label} · 本机前 10</span></div><LeaderboardTable entries={entries} difficulty={result.difficulty} highlightId={result.id} /><p className="board-footnote">按坚守时长排序，同分比较击杀数。<br />仅记录正式模式，保存在当前浏览器。</p></div>
  </div></section>;
}
