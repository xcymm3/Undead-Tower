export interface WeaponDefinition {
  id: string; label: string; short: string; model: string; capacity: number; interval: number;
  reloadDuration: number; automatic: boolean; damage: number; pellets: number; spread: number;
  length: number; rotationY: number; fireDuration: number; shellReload?: boolean; recoil: number;
}
export const WEAPONS: readonly WeaponDefinition[] = [
  { id: 'rifle', label: '步枪', short: 'RIFLE', model: 'Rifle', capacity: 30, interval: 0.115, reloadDuration: 0.775, automatic: true, damage: 50, pellets: 1, spread: 0, length: 0.90, rotationY: 0, fireDuration: 0.115, recoil: 0.7 },
  { id: 'p90', label: 'P90 冲锋枪', short: 'P90', model: 'P90', capacity: 50, interval: 0.09, reloadDuration: 0.90, automatic: true, damage: 35, pellets: 1, spread: 0, length: 0.65, rotationY: 0, fireDuration: 0.09, recoil: 0.45 },
  { id: 'pistol', label: '半自动手枪', short: 'PISTOL', model: 'Pistol', capacity: 12, interval: 0.3, reloadDuration: 0.85, automatic: false, damage: 60, pellets: 1, spread: 0, length: 0.48, rotationY: Math.PI / 2, fireDuration: 0.28, recoil: 0.75 },
  { id: 'revolver', label: '左轮手枪', short: 'REVOLVER', model: 'Revolver', capacity: 6, interval: 0.48, reloadDuration: 1.45, automatic: false, damage: 100, pellets: 1, spread: 0, length: 0.55, rotationY: 0, fireDuration: 0.43, recoil: 1 },
  { id: 'shotgun', label: '泵动霰弹枪', short: 'SHOTGUN', model: 'Shotgun', capacity: 6, interval: 0.72, reloadDuration: 0.48, shellReload: true, automatic: false, damage: 24, pellets: 7, spread: 0.045, length: 0.90, rotationY: 0, fireDuration: 0.68, recoil: 1.2 },
  { id: 'sniper', label: '栓动狙击枪', short: 'SNIPER', model: 'SniperRifle', capacity: 5, interval: 0.90, reloadDuration: 1.15, automatic: false, damage: 150, pellets: 1, spread: 0, length: 1.02, rotationY: 0, fireDuration: 0.82, recoil: 1 },
];
export const SWITCH_DURATION = 0.4;
