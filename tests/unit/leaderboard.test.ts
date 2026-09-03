import { describe, expect, it } from 'vitest';
import { formatDuration, LeaderboardStore, rankResults } from '../../src/game/leaderboard';
import type { RunResult } from '../../src/game/config';

const result = (id: string, duration: number, difficulty: RunResult['difficulty'] = 'normal', kills = 2): RunResult => ({ id, duration, difficulty, kills, hits: 5, shots: 10, endedAt: '2026-09-03T08:00:00.000Z' });
const memoryStorage = () => {
  let data: string | null = null;
  return { getItem: () => data, setItem: (_key: string, value: string) => { data = value; } };
};

describe('本机排行榜', () => {
  it('按时长降序、同分按击杀排序，并且每种难度只留前 10 名', () => {
    const records = Array.from({ length: 15 }, (_, i) => result(String(i), i));
    records.push(result('easy', 99, 'easy'), result('hard', 88, 'hard'), result('tie', 14, 'normal', 4));
    const ranks = rankResults(records);
    expect(ranks.filter(r => r.difficulty === 'normal')).toHaveLength(10);
    expect(ranks.filter(r => r.difficulty === 'normal')[0].id).toBe('tie');
    expect(ranks.filter(r => r.difficulty === 'easy')).toHaveLength(1);
    expect(ranks.filter(r => r.difficulty === 'hard')).toHaveLength(1);
  });
  it('相同结算只写入一条，重新加载仍能读取', () => {
    const storage = memoryStorage();
    const store = new LeaderboardStore(storage);
    store.record(result('run', 32.4)); store.record(result('run', 32.4));
    expect(new LeaderboardStore(storage).read()).toEqual([result('run', 32.4)]);
  });
  it('损坏记录、非法数字和错误难度不会破坏排行榜', () => {
    const storage = memoryStorage(); storage.setItem('', '{broken');
    const store = new LeaderboardStore(storage);
    expect(store.read()).toEqual([]);
    const records = [result('valid', 10), { ...result('invalid', 2), duration: -1 }, { ...result('invalid2', 3), hits: 99 }, { ...result('invalid3', 5), difficulty: 'unknown' }];
    storage.setItem('', JSON.stringify(records));
    expect(store.read()).toEqual([result('valid', 10)]);
  });
  it('存储不可写时保留会话成绩并报告保存失败', () => {
    const store = new LeaderboardStore({ getItem: () => null, setItem: () => { throw new Error('blocked'); } });
    expect(store.record(result('run', 1))).toHaveLength(1);
    expect(store.persistent).toBe(false);
    expect(store.read()).toHaveLength(1);
  });
  it('秒表跨分钟显示正确，不将小数秒错误进位', () => {
    expect(formatDuration(0)).toBe('00:00');
    expect(formatDuration(59.99, true)).toBe('00:59.9');
    expect(formatDuration(61.23, true)).toBe('01:01.2');
    expect(formatDuration(3600)).toBe('60:00');
  });
});
