import type { UpgradeId } from '../game/upgrades';

// Original field-manual pictograms: every upgrade has a distinct silhouette.
const paths: Record<UpgradeId, string> = {
  damage: 'M19 7h10l3 9v28H16V16zM20 17h8M24 22l-5 9h6l-2 8 8-12h-6z',
  rate: 'M10 13h21v8H20v14h-7V21h-3zM24 25c11 0 12 13 1 15M37 10l7 7-7 7M37 29l7 7-7 7',
  magazine: 'M15 8h22v8l-5 28H11l4-28zM18 21h12M17 28h12M16 35h12',
  reload: 'M13 16a17 17 0 0 1 28 5M41 11v10H31M39 36a17 17 0 0 1-28-5M11 41V31h10M24 17h5v18h-5z',
  critical_chance: 'M9 9h34v34H9zM16 16h4v4h-4zM32 32h4v4h-4zM16 36l20-20M26 5v8M5 26h8M39 26h8M26 39v8',
  critical_damage: 'M29 5L15 24h10l-4 23 17-26H27zM9 9l7 7M43 9l-7 7M7 29h8M37 35l8 7',
  duration: 'M15 8h22M15 44h22M18 8v10l16 16v10M34 8v10L18 34v10M21 39h10M21 13h10',
  cooldown: 'M26 8a18 18 0 1 1-17 12M8 8v12h12M26 15v12l8 5M32 5h9',
  rifle_velocity: 'M8 20h28l9 6-9 6H8zM31 20v12M12 16h12M12 36h12M6 26h16',
  rifle_overload: 'M9 12h9v28H9zM34 12h9v28h-9zM29 7L19 27h9l-5 18 13-24H25z',
  p90_dense: 'M8 12h28v7H8zM12 23h28v7H12zM16 34h28v7H16zM37 10l8 5-8 5',
  p90_frost: 'M26 5v42M8 15l36 22M8 37l36-22M20 9l6 6 6-6M20 43l6-6 6 6M10 22l8-2-2-8M36 40l-2-8 8-2M10 30l8 2-2 8M36 12l-2 8 8 2',
  pistol_match: 'M10 25h14l4-10h14v9H31l-6 15H13zM35 5v9M30 9h10M12 29h6M18 43h6',
  pistol_partner: 'M5 14h16v8h-6v17H8V22H5zM47 14H31v8h6v17h7V22h3zM23 26h6M26 22v8',
  revolver_cylinder: 'M26 7l16 9v20l-16 9-16-9V16zM21 15h10v7H21zM16 28h7v8h-7zM29 28h7v8h-7z',
  revolver_deadeye: 'M6 19v-9h9M37 10h9v9M46 33v9h-9M15 42H6v-9M28 14L18 28h9l-3 11 12-17h-9z',
  shotgun_choke: 'M8 18h19l9 5v6l-9 5H8zM27 18v16M40 15h4M42 25h5M40 35h4M11 23h12M11 29h12',
  shotgun_impact: 'M7 16l10 10L7 36M19 12l14 14-14 14M33 7l13 19-13 19M8 26h16',
  sniper_caliber: 'M7 23h27l11 3-11 3H7zM12 18h21v16H12zM17 12h11M22 8v10M6 38h29',
  sniper_pierce: 'M10 12h6v28h-6M23 12h6v28h-6M36 12h6v28h-6M5 26h42l-6-6M47 26l-6 6',
};

export function UpgradeIcon({ id, size = 48 }: { id: UpgradeId; size?: number }) {
  return <svg className="upgrade-icon" data-upgrade-icon={id} width={size} height={size} viewBox="0 0 52 52" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="miter" aria-hidden="true"><path d={paths[id]} /></svg>;
}
