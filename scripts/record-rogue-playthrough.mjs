import { chromium } from '@playwright/test';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { installAudioCapture, startVideoCapture, muxCapture } from './playthrough-capture.mjs';

// 只读诊断选择瞄准点；战斗和升级均经过正常输入，不修改游戏状态。
const url = process.env.GAME_URL ?? 'http://127.0.0.1:5175/';
const directory = path.resolve('recordings', new Date().toISOString().replaceAll(':', '-').replace(/\.\d+Z$/, 'Z'));
const ffmpeg = process.env.FFMPEG_PATH ?? path.resolve('recordings/tools/node_modules/ffmpeg-static/ffmpeg.exe');
await stat(ffmpeg);
await mkdir(directory, { recursive: true });
const output = path.join(directory, 'Undead-Tower-rogue-playthrough.mp4');
const silent = path.join(directory, 'picture.mp4'), audio = path.join(directory, 'game-audio.webm');
const events = [], errors = [];
let recordingStart = 0, capture;
const log = event => { const entry = { videoSeconds: (Date.now() - recordingStart) / 1000, ...event }; events.push(entry); console.log(JSON.stringify(entry)); };
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on('pageerror', error => { errors.push(error.message); log({ type: 'page-error', message: error.message }); });
  await page.exposeFunction('__recordRogueEvent', log);
  await installAudioCapture(page, audio);
  await page.goto(url);
  await page.waitForFunction(() => window.__undeadTower?.snapshot().weaponAnimation.loaded);
  await page.getByRole('button', { name: '正式模式' }).click();
  await page.getByRole('button', { name: '选择半自动手枪' }).click();
  await page.mouse.move(640, 360);
  capture = await startVideoCapture(page, silent, ffmpeg);
  recordingStart = capture.startedAt;
  log({ type: 'recording-start', directory });
  await page.waitForTimeout(2000);
  await page.getByRole('button', { name: '开始坚守' }).click();
  const snapshot = () => page.evaluate(() => window.__undeadTower.snapshot());
  while (true) {
    const outcome = await page.evaluate(() => new Promise(resolve => {
      const canvas = document.querySelector('canvas');
      const blocked = new Map(), seen = window.__rogueSeen ??= new Set();
      let next = 0, lastTarget = -1, reloading = false, lastStatus = 0;
      const deadline = performance.now() + 100000;
      const tick = now => {
        const state = window.__undeadTower.snapshot();
        if (['upgrade', 'breaching', 'failed'].includes(state.phase)) { resolve(state.phase); return; }
        if (now > deadline) { resolve('timeout'); return; }
        for (const z of state.targets) {
          if (z.health > 0 && !seen.has(z.kind)) { seen.add(z.kind); void window.__recordRogueEvent({ type: 'enemy-first-seen', kind: z.kind, wave: state.rogue.wave }); }
        }
        if (state.reloading !== reloading) {
          reloading = state.reloading;
          void window.__recordRogueEvent({ type: reloading ? 'reload-start' : 'reload-complete', wave: state.rogue.wave, ammo: state.ammo });
        }
        if (now - lastStatus > 15000) { lastStatus = now; void window.__recordRogueEvent({ type: 'progress', wave: state.rogue.wave, kills: state.kills, gameSeconds: state.survived }); }
        if (state.phase === 'playing' && now >= next && !state.reloading) {
          if (state.ammo === 0) {
            window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyR', key: 'r', bubbles: true }));
            window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyR', key: 'r', bubbles: true }));
            next = now + 100;
          } else {
            if (lastTarget >= 0 && state.lastShot?.hitTarget !== lastTarget) blocked.set(lastTarget, now + 1500);
            lastTarget = -1;
            const urgency = z => Math.hypot(z.x, z.z - 9) / (z.kind === 'football' ? 2 : z.kind === 'giant' ? .5 : 1);
            const target = state.targets.filter(z => z.health > 0 && z.head.x > 30 && z.head.x < innerWidth - 30 && z.head.y > 130 && z.head.y < innerHeight - 100 && (blocked.get(z.id) ?? 0) < now).sort((a, b) => urgency(a) - urgency(b))[0];
            if (target) {
              const rect = canvas.getBoundingClientRect();
              const input = { clientX: target.head.x + rect.x, clientY: target.head.y + rect.y, button: 0, bubbles: true };
              canvas.dispatchEvent(new PointerEvent('pointermove', input));
              canvas.dispatchEvent(new PointerEvent('pointerdown', input));
              window.dispatchEvent(new PointerEvent('pointerup', input));
              lastTarget = target.id;
              next = now + state.rogue.stats.interval * 1000 + 70;
            }
          }
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }));
    const state = await snapshot();
    if (outcome !== 'upgrade') {
      if (outcome === 'timeout') throw Error('单波超过 100 秒，停止录制，未伪造结算');
      log({ type: 'defense-breached', wave: state.rogue.wave, culprit: state.breach });
      break;
    }
    log({ type: 'wave-cleared', wave: state.rogue.wave, kills: state.kills });
    await page.mouse.move(640, 110, { steps: 6 });
    await page.waitForTimeout(2200);
    const labels = { damage: '强装药', head: '精准射击', rate: '轻快扳机', reload: '快速装填', magazine: '扩容弹匣' };
    const selected = ['damage', 'head', 'rate', 'reload', 'magazine'].find(key => state.rogue.choices.includes(key));
    await page.getByRole('button', { name: new RegExp(labels[selected]) }).click();
    await page.waitForTimeout(1200);
    log({ type: 'upgrade-selected', wave: state.rogue.wave, upgrade: selected });
    await page.getByRole('button', { name: `应用升级，开始第 ${state.rogue.wave + 1} 波` }).click();
    if (Date.now() - recordingStart > 420000) throw Error('录制超过七分钟资源上限，停止录制，未伪造结算');
  }
  await page.getByRole('region', { name: '游戏结束' }).waitFor({ timeout: 10000 });
  const ended = await snapshot();
  log({ type: 'run-ended', result: ended.result });
  await page.mouse.move(1240, 680);
  await page.waitForTimeout(5000);
  await page.screenshot({ path: path.join(directory, 'result.png') });
  const audioInfo = await page.evaluate(() => window.__playthroughAudio.stop());
  const videoInfo = await capture.stop(); capture = null;
  await muxCapture(ffmpeg, silent, audio, output, (audioInfo.startedAt - recordingStart) / 1000, videoInfo.duration);
  const bytes = (await stat(output)).size;
  if (bytes < 10000 || errors.length) throw Error(`录制异常：${bytes} bytes，${errors.join('; ')}`);
  await writeFile(path.join(directory, 'recording.json'), JSON.stringify({ output, bytes, ...videoInfo, result: ended.result, events, errors }, null, 2));
  console.log(JSON.stringify({ output, bytes, ...videoInfo, result: ended.result }));
} finally {
  if (capture) await capture.stop().catch(error => console.error(error.message));
  await writeFile(path.join(directory, 'events.json'), JSON.stringify(events, null, 2));
  await browser.close();
}
