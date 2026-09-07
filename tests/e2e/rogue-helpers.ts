import type { Page } from '@playwright/test';
// 用真实游戏输入事件完成战斗；只读取诊断信息，不改血量、波数、速度或升级结果。
export async function clearWave(page: Page) {
  return page.evaluate(() => new Promise<number>((resolve, reject) => {
    const canvas = document.querySelector('canvas')!;
    let next = 0, lastTarget = -1;
    const blocked = new Map<number, number>(), deadline = performance.now() + 100000;
    const tick = (now: number) => {
      const state = window.__undeadTower!.snapshot();
      if (state.phase === 'upgrade') { resolve(state.rogue!.wave); return; }
      if (state.phase === 'failed' || state.phase === 'breaching') { reject(new Error(`自动操作在第 ${state.rogue!.wave} 波失败`)); return; }
      if (now > deadline) { reject(new Error(`第 ${state.rogue!.wave} 波超时`)); return; }
      if (state.phase === 'playing' && now >= next && !state.reloading) {
        if (state.ammo === 0) { window.dispatchEvent(new KeyboardEvent('keydown', {code:'KeyR',key:'r',bubbles:true})); next = now + 100; }
        else {
          if (lastTarget >= 0 && state.lastShot?.hitTarget !== lastTarget) blocked.set(lastTarget, now + 1500);
          lastTarget = -1;
          const target = state.targets.filter(z => z.health > 0 && z.head.x > 30 && z.head.x < innerWidth-30 && z.head.y > 130 && z.head.y < innerHeight-100 && (blocked.get(z.id) ?? 0) < now)
            .sort((a,b) => Math.hypot(a.x,a.z-9)/(a.kind==='football'?2:a.kind==='giant'?.5:1)-Math.hypot(b.x,b.z-9)/(b.kind==='football'?2:b.kind==='giant'?.5:1))[0];
          if (target) {
            const rect = canvas.getBoundingClientRect();
            const input = {clientX:target.head.x+rect.x,clientY:target.head.y+rect.y,button:0,bubbles:true};
            canvas.dispatchEvent(new PointerEvent('pointermove',input)); canvas.dispatchEvent(new PointerEvent('pointerdown',input));
            window.dispatchEvent(new PointerEvent('pointerup',input));
            lastTarget = target.id; next = now + state.rogue!.stats.interval * 1000 + 70;
          }
        }
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }));
}
