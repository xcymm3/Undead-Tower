import { afterEach, describe, expect, it, vi } from 'vitest';
import { AUDIO_SETTINGS_KEY, GameAudio } from '../../src/game/audio';

afterEach(() => vi.unstubAllGlobals());
function setup() {
  const data = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value) });
  const makeNode = () => ({ gain: { value: 0, setValueAtTime(v: number) { this.value = v; }, exponentialRampToValueAtTime: vi.fn() }, frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn((target: unknown) => target), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn() });
  const nodes: ReturnType<typeof makeNode>[] = [];
  function node() { const value = makeNode(); nodes.push(value); return value; }
  vi.stubGlobal('AudioContext', class {
    state = 'running'; currentTime = 0; sampleRate = 100; destination = {};
    createGain = node; createOscillator = node; createBiquadFilter = node;
    createBufferSource = node;
    createBuffer() { return { getChannelData: () => new Float32Array(30) }; }
    close() { return Promise.resolve(); }
  });
  return { data, nodes };
}

describe('统一音量与护甲声音', () => {
  it('所有声音经过主音量，零音量和静音不生成音源，恢复保持原音量', () => {
    const { nodes } = setup(); const audio = new GameAudio(); audio.unlock();
    audio.volume = 0.35;
    audio.shot(); audio.armor('bucket', false);
    const master = nodes[0];
    expect(master.gain.value).toBe(0.35);
    expect(nodes.slice(1).filter(n => n.connect.mock.calls.some(([target]) => target === master)).length).toBe(4);
    audio.enabled = false; expect(master.gain.value).toBe(0);
    const count = nodes.length; audio.shot(); audio.armor('cone', true); expect(nodes).toHaveLength(count);
    audio.enabled = true; expect(master.gain.value).toBe(0.35);
    audio.volume = 0; audio.shot(); audio.tone(1, 2, 1); expect(nodes).toHaveLength(count);
    expect(new GameAudio().volume).toBe(0);
  });
  it('护甲命中和脱落有不同音色，持久化且损坏设置不阻止启动', () => {
    const { data, nodes } = setup(); const audio = new GameAudio(); audio.unlock();
    audio.armor('cone', false); const cone = nodes[1].frequency.setValueAtTime.mock.calls[0][0];
    audio.armor('bucket', true); const bucket = nodes[5].frequency.setValueAtTime.mock.calls[0][0];
    expect(cone).not.toBe(bucket);
    expect(audio.diagnostics().lastArmorCue).toEqual({ kind: 'bucket', broken: true });
    audio.volume = 0.42; audio.enabled = false;
    const restored = new GameAudio(); expect(restored.volume).toBe(0.42); expect(restored.enabled).toBe(false);
    data.set(AUDIO_SETTINGS_KEY, '{broken'); expect(new GameAudio().volume).toBe(1);
    vi.stubGlobal('localStorage', { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } });
    const unavailable = new GameAudio(); unavailable.volume = 0.6; expect(unavailable.volume).toBe(0.6);
  });
});
