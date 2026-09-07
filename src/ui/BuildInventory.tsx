import { useId } from 'react';
import { UPGRADES, UPGRADE_IDS, RARITIES, upgradePreview } from '../game/upgrades';
import type { UpgradeLevels, UpgradeId } from '../game/upgrades';
import type { WeaponId } from '../game/weapons';
import { UpgradeIcon } from './UpgradeIcon';

function benefit(weapon: WeaponId, levels: UpgradeLevels, id: UpgradeId) {
  const previous = { ...levels, [id]: Math.max(0, levels[id] - 1) };
  return upgradePreview(weapon, previous, id).map(metric => `${metric.label} ${metric.after.toFixed(metric.digits)} ${metric.unit}`).join(' · ');
}

export function BuildInventory({ weapon, levels, compact = false }: { weapon: WeaponId; levels: UpgradeLevels; compact?: boolean }) {
  const prefix = useId();
  const owned = UPGRADE_IDS.filter(id => levels[id] > 0);
  return <aside className={`build-inventory ${compact ? 'compact' : ''}`} aria-label="本局构筑">
    <div className="build-heading"><span className="label">FIELD MODS / 本局构筑</span><small>{owned.length} 项</small></div>
    {owned.length ? <div className="build-items">{owned.map(id => <div className={`build-item rarity-${UPGRADES[id].rarity}`} key={id}>
      <button type="button" aria-label={`${UPGRADES[id].name} ${levels[id]} / ${UPGRADES[id].max} 级`} aria-describedby={`${prefix}-${id}`}>
        <UpgradeIcon id={id} size={32} /><b>{levels[id]}</b><span>{UPGRADES[id].name}</span>
      </button>
      <div className="build-detail" id={`${prefix}-${id}`} role="tooltip"><strong>{UPGRADES[id].name} · {RARITIES[UPGRADES[id].rarity].label}</strong><span>{levels[id]} / {UPGRADES[id].max} 级 · {UPGRADES[id].detail}</span><span>当前：{benefit(weapon, levels, id)}</span></div>
    </div>)}</div> : <p className="build-empty">清除第一波后获得升级</p>}
  </aside>;
}
