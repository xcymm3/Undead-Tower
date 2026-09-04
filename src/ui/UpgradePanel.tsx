import { useState } from 'react';
import { UPGRADES, pistolStats } from '../game/rogue';
import type { RogueSnapshot, UpgradeId } from '../game/rogue';
import './rogue.css';

function preview(state: RogueSnapshot, id: UpgradeId) {
  const before = state.stats, after = pistolStats({ ...state.levels, [id]: state.levels[id] + 1 });
  if (id === 'damage') return `${before.damage.toFixed(0)} → ${after.damage.toFixed(0)} 伤害`;
  if (id === 'rate') return `${(1 / before.interval).toFixed(1)} → ${(1 / after.interval).toFixed(1)} 发/秒`;
  if (id === 'magazine') return `${before.capacity} → ${after.capacity} 发`;
  if (id === 'reload') return `${before.reloadDuration.toFixed(2)} → ${after.reloadDuration.toFixed(2)} 秒`;
  return `${(before.headMultiplier ?? 2).toFixed(1)} → ${after.headMultiplier!.toFixed(1)} 倍`;
}
export function UpgradePanel({ state, onConfirm }: { state: RogueSnapshot; onConfirm: (id: UpgradeId | null) => void }) {
  const [selected, setSelected] = useState<UpgradeId | null>(null);
  return <section className="upgrade-screen" aria-label="波次升级"><div className="upgrade-panel">
    <span className="label">WAVE CLEAR · PISTOL</span><h2>第 {state.wave} 波已清除</h2>
    <p>选择一项升级，为下一波做好准备。思考期间战斗暂停。</p>
    <div className="upgrade-cards" role="group" aria-label="选择手枪升级">{state.choices.map(id => <button key={id} className="upgrade-card" aria-pressed={selected === id} onClick={() => setSelected(id)}>
      <small>{state.levels[id]} / {UPGRADES[id].max} 级</small><h3>{UPGRADES[id].name}</h3><p>{UPGRADES[id].detail}</p><strong>{preview(state, id)}</strong>
    </button>)}</div>
    {!state.choices.length && <p>手枪配置已满。继续挑战更高波次。</p>}
    <button className="start-button" disabled={state.choices.length > 0 && !selected} onClick={() => onConfirm(selected)}>应用升级，开始第 {state.wave + 1} 波 <span>→</span></button>
    <div className="upgrade-summary">{(Object.keys(UPGRADES) as UpgradeId[]).map(id => <span key={id}>{UPGRADES[id].name} {state.levels[id]} 级</span>)}</div>
  </div></section>;
}
