import { SKILLS } from '../game/upgrades';
import type { UpgradeId } from '../game/upgrades';
import type { RogueSnapshot } from '../game/rogue';
import type { WeaponId } from '../game/weapons';
import { UpgradeIcon } from './UpgradeIcon';

const skillIcons: Record<WeaponId, UpgradeId> = { rifle: 'rifle_overload', p90: 'p90_frost', pistol: 'pistol_partner', revolver: 'revolver_deadeye', shotgun: 'shotgun_impact', sniper: 'sniper_pierce' };
export function SkillHud({ state }: { state: RogueSnapshot }) {
  const { skill, skillStats: stats, weapon } = state;
  const sinceStart = stats.cooldown - skill.cooldownRemaining;
  const ended = skill.endedRemaining > 0;
  const progress = skill.active ? skill.remaining / stats.duration : 1 - skill.cooldownRemaining / stats.cooldown;
  return <aside className={`skill-hud skill-${weapon} ${skill.active ? 'active' : skill.cooldownRemaining > 0 ? 'cooldown' : 'ready'}`} aria-label="右键技能状态">
    <UpgradeIcon id={skillIcons[weapon]} size={34} /><div className="skill-copy"><span><kbd>右键</kbd> {SKILLS[weapon].name}</span>
    <strong>{skill.active ? `${sinceStart < .7 ? '技能启动' : '活动中'} · ${skill.remaining.toFixed(1)} 秒` : ended ? '技能结束 · 正在整备' : skill.cooldownRemaining > 0 ? `冷却 · ${skill.cooldownRemaining.toFixed(1)} 秒` : '准备就绪'}</strong>
    <small>持续 {stats.duration.toFixed(1)} 秒 / 冷却 {stats.cooldown.toFixed(1)} 秒</small></div>
    <div className="skill-meter" role="progressbar" aria-label={skill.active ? '技能剩余时间' : '技能就绪进度'} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}><i style={{ width: `${Math.max(0, Math.min(1, progress)) * 100}%` }} /></div>
  </aside>;
}
