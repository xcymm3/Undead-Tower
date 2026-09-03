import type { Difficulty, RunResult } from './config';

export const LEADERBOARD_KEY = 'undead-tower.leaderboard.v1';
type StoragePort = Pick<Storage, 'getItem' | 'setItem'>;
const difficulties: Difficulty[] = ['easy', 'normal', 'hard'];

function isResult(value: unknown): value is RunResult {
  if (!value || typeof value !== 'object') return false;
  const r = value as RunResult;
  return typeof r.id === 'string' && r.id.length > 0 && difficulties.includes(r.difficulty)
    && Number.isFinite(r.duration) && r.duration >= 0
    && [r.kills, r.shots, r.hits].every(n => Number.isSafeInteger(n) && n >= 0)
    && r.hits <= r.shots && r.kills <= r.hits
    && typeof r.endedAt === 'string' && Number.isFinite(Date.parse(r.endedAt));
}

export function rankResults(entries: RunResult[]): RunResult[] {
  const unique = [...new Map(entries.filter(isResult).map(entry => [entry.id, entry])).values()];
  return difficulties.flatMap(difficulty => unique.filter(r => r.difficulty === difficulty)
    .sort((a, b) => b.duration - a.duration || b.kills - a.kills || a.endedAt.localeCompare(b.endedAt) || a.id.localeCompare(b.id)).slice(0, 10));
}

/** 存储不可用时保留当前会话成绩，且明确向 UI 返回保存失败。 */
export class LeaderboardStore {
  private entries: RunResult[] = [];
  private storage?: StoragePort;
  persistent = true;

  constructor(storage?: StoragePort) {
    try { this.storage = storage ?? window.localStorage; }
    catch { this.persistent = false; }
    this.read();
  }
  read() {
    if (!this.storage) { this.persistent = false; return [...this.entries]; }
    try {
      const raw = this.storage.getItem(LEADERBOARD_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      this.entries = rankResults([...this.entries, ...(Array.isArray(parsed) ? parsed.filter(isResult) : [])]);
    } catch { /* 损坏数据不会阻止游戏；下一次保存可替换损坏 JSON。 */ }
    return [...this.entries];
  }
  record(result: RunResult) {
    this.entries = rankResults([...this.read(), result]);
    try {
      if (!this.storage) throw new Error('storage unavailable');
      this.storage.setItem(LEADERBOARD_KEY, JSON.stringify(this.entries));
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
