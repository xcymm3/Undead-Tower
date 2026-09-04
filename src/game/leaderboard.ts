import { UPGRADES } from './rogue';
import type { Difficulty, RunResult } from './config';

// 开局护甲新比例单独记榜；旧 v1 与 armor-v2 数据保留在原键。
export const LEADERBOARD_KEY = 'undead-tower.leaderboard.armor-v3';
type StoragePort = Pick<Storage, 'getItem' | 'setItem'>;
export interface PersonalRecord { status: 'first' | 'new' | 'tied' | 'chasing'; previous: number | null; difference: number; }

/** 在写入本次成绩前比较同难度最佳，按界面显示的十分之一秒比较。 */
export function personalRecord(result: RunResult, entries: RunResult[]): PersonalRecord {
  if (result.rogue) {
    const scores = entries.filter(r => r.id !== result.id && r.rogue?.weapon === result.rogue!.weapon).map(r => r.rogue!.completed);
    const previous = scores.length ? Math.max(...scores) : null, difference = result.rogue.completed - (previous ?? 0);
    return { status: previous === null ? 'first' : difference > 0 ? 'new' : difference === 0 ? 'tied' : 'chasing', previous, difference: Math.abs(difference) };
  }
  const previous = entries.filter(r => r.difficulty === result.difficulty && r.id !== result.id).reduce<number | null>((best, r) => best === null ? r.duration : Math.max(best, r.duration), null);
  if (previous === null) return { status: 'first', previous, difference: 0 };
  const difference = (Math.floor(result.duration * 10 + 1e-6) - Math.floor(previous * 10 + 1e-6)) / 10;
  return { status: difference > 0 ? 'new' : difference === 0 ? 'tied' : 'chasing', previous, difference: Math.abs(difference) };
}
const difficulties: Difficulty[] = ['easy', 'normal', 'hard'];

function isResult(value: unknown): value is RunResult {
  if (!value || typeof value !== 'object') return false;
  const r = value as RunResult;
  if (r.rogue !== undefined) {
    const g = r.rogue;
    if (!g || g.version !== 1 || g.weapon !== 'pistol' || !Number.isSafeInteger(g.seed) || g.seed < 0 || g.seed > 0xffffffff
      || ![g.completed, g.failedWave, g.waveKills, g.waveTotal].every(n => Number.isSafeInteger(n) && n >= 0)
      || g.failedWave !== g.completed + 1 || g.waveTotal !== 6 + 2 * g.completed || g.waveKills >= g.waveTotal
      || !Number.isFinite(g.clearTime) || g.clearTime < 0 || g.clearTime > r.duration || g.waveKills > r.kills
      || !g.levels || !Object.entries(UPGRADES).every(([id, upgrade]) => { const n = g.levels[id as keyof typeof UPGRADES]; return Number.isInteger(n) && n >= 0 && n <= upgrade.max; })
      || Object.values(g.levels).reduce((sum, n) => sum + n, 0) !== Math.min(g.completed, 23)) return false;
  }
  return typeof r.id === 'string' && r.id.length > 0 && difficulties.includes(r.difficulty)
    && Number.isFinite(r.duration) && r.duration >= 0
    && [r.kills, r.shots, r.hits].every(n => Number.isSafeInteger(n) && n >= 0)
    && r.hits <= r.shots && r.kills <= r.hits
    && typeof r.endedAt === 'string' && Number.isFinite(Date.parse(r.endedAt));
}

export function rankResults(entries: RunResult[]): RunResult[] {
  const unique = [...new Map(entries.filter(isResult).map(entry => [entry.id, entry])).values()];
  return difficulties.flatMap(difficulty => unique.filter(r => r.difficulty === difficulty)
    .sort((a, b) => (a.rogue && b.rogue ? b.rogue.completed - a.rogue.completed || b.rogue.waveKills - a.rogue.waveKills || a.rogue.clearTime - b.rogue.clearTime : b.duration - a.duration || b.kills - a.kills) || a.endedAt.localeCompare(b.endedAt) || a.id.localeCompare(b.id)).slice(0, 10));
}

/** 存储不可用时保留当前会话成绩，且明确向 UI 返回保存失败。 */
export class LeaderboardStore {
  private entries: RunResult[] = [];
  private storage?: StoragePort;
  persistent = true;

  constructor(storage?: StoragePort, private key = LEADERBOARD_KEY) {
    try { this.storage = storage ?? window.localStorage; }
    catch { this.persistent = false; }
    this.read();
  }
  read() {
    if (!this.storage) { this.persistent = false; return [...this.entries]; }
    try {
      const raw = this.storage.getItem(this.key);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      this.entries = rankResults([...this.entries, ...(Array.isArray(parsed) ? parsed.filter(isResult) : [])]);
    } catch { /* 损坏数据不会阻止游戏；下一次保存可替换损坏 JSON。 */ }
    return [...this.entries];
  }
  record(result: RunResult) {
    this.entries = rankResults([...this.read(), result]);
    try {
      if (!this.storage) throw new Error('storage unavailable');
      this.storage.setItem(this.key, JSON.stringify(this.entries));
      this.persistent = true;
    } catch { this.persistent = false; }
    return [...this.entries];
  }
}

export function formatDuration(seconds: number, precise = false) {
  const tenths = Math.floor(Math.max(0, seconds) * 10 + 1e-6);
  const minutes = Math.floor(tenths / 600);
  const rest = Math.floor(tenths / 10) % 60;
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}${precise ? `.${tenths % 10}` : ''}`;
}
