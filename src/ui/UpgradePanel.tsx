import { useEffect, useRef, useState } from 'react';
import { UPGRADES, upgradePreview, RARITIES } from '../game/rogue';
import type { RogueSnapshot, UpgradeId } from '../game/rogue';
import './rogue.css';
import { UpgradeIcon } from './UpgradeIcon';
import { BuildInventory } from './BuildInventory';

function preview(state: RogueSnapshot, id: UpgradeId) {
  return upgradePreview(state.weapon, state.levels, id).map(metric => `${metric.label} ${metric.before.toFixed(metric.digits)} → ${metric.after.toFixed(metric.digits)} ${metric.unit}`).join(' / ');
}
export function UpgradePanel({ state, onConfirm }: { state: RogueSnapshot; onConfirm: (id: UpgradeId | null) => void }) {
  const [selected, setSelected] = useState<UpgradeId | null>(null);
  const [leaving, setLeaving] = useState(false);
  const confirmed = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const confirm = () => {
    if (confirmed.current || (state.choices.length > 0 && !selected)) return;
    confirmed.current = true;
    setLeaving(true);
    timer.current = setTimeout(() => onConfirm(selected), window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 180);
  };
  return <section className={`upgrade-screen ${leaving ? 'is-leaving' : ''}`} aria-label="波次升级" aria-busy={leaving}><div className="upgrade-panel">
    <span className="label">WAVE CLEAR · {state.stats.short}</span><h2>第 {state.wave} 波已清除</h2>
    <p>选一项强化。战斗已暂停。</p>
    <div className="upgrade-cards" role="group" aria-label="选择武器升级">{state.choices.map((id, index) => <button key={id} disabled={leaving} data-state={leaving ? 'loading' : selected === id ? 'success' : 'default'} className={`upgrade-card rarity-${UPGRADES[id].rarity}`} aria-pressed={selected === id} onClick={() => setSelected(id)}>
      <div className="card-index"><small>{RARITIES[UPGRADES[id].rarity].label}</small><span>0{index + 1}</span></div><div className="card-title"><UpgradeIcon id={id} size={58} /><h3>{UPGRADES[id].name}</h3></div><small className="card-level">{state.levels[id]} / {UPGRADES[id].max} 级 <span>{selected === id ? '✓ 已选择' : '选择此项'}</span></small><p>{UPGRADES[id].detail}</p><strong>{preview(state, id)}</strong>
    </button>)}</div>
    {!state.choices.length && <p>武器配置已满。继续挑战更高波次。</p>}
    <button className="start-button" data-state={leaving ? 'loading' : selected ? 'success' : 'default'} aria-label={leaving ? '升级已确认' : `应用升级，开始第 ${state.wave + 1} 波`} aria-busy={leaving} disabled={leaving || (state.choices.length > 0 && !selected)} onClick={confirm}>{leaving ? '正在进入下一波' : `确认强化 · 第 ${state.wave + 1} 波`} <span>→</span></button>
    <BuildInventory weapon={state.weapon} levels={state.levels} />
  </div></section>;
}
