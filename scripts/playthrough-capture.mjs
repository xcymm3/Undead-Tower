import { spawn, execFile } from 'node:child_process';
import { appendFile } from 'node:fs/promises';
import { once } from 'node:events';
import { promisify } from 'node:util';

export async function installAudioCapture(page, file) {
  await page.exposeFunction('__savePlaythroughAudio', data => appendFile(file, Buffer.from(data, 'base64')));
  await page.addInitScript(() => {
    const connect = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function (...args) {
      const result = connect.apply(this, args);
      if (args[0] !== this.context.destination || window.__playthroughAudio) return result;
      // 从主音量出口复制同一信号；不改变原音量、音效、音乐或游戏状态。
      const sink = this.context.createMediaStreamDestination(); connect.call(this, sink);
      const recorder = new MediaRecorder(sink.stream, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 160000 });
      let pending = Promise.resolve(), error = null;
      recorder.ondataavailable = event => {
        if (!event.data.size) return;
        pending = pending.then(() => new Promise((resolve, reject) => {
          const reader = new FileReader(); reader.onerror = reject;
          // 编码名称可能带逗号，base64 负载始于最后一个逗号之后。
          reader.onload = () => window.__savePlaythroughAudio(String(reader.result).split(',').at(-1)).then(resolve, reject);
          reader.readAsDataURL(event.data);
        }));
      };
      recorder.onerror = event => { error = String(event.error ?? event); };
      const startedAt = Date.now(); recorder.start(1000);
      window.__playthroughAudio = { stop: () => new Promise((resolve, reject) => {
        recorder.onstop = () => pending.then(() => { sink.stream.getTracks().forEach(track => track.stop()); error ? reject(Error(error)) : resolve({ startedAt }); }, reject);
        recorder.stop();
      }) };
      return result;
    };
  });
}

export async function startVideoCapture(page, file, ffmpeg) {
  const process = spawn(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-vcodec', 'mjpeg', '-framerate', '30', '-i', 'pipe:0', '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-threads', '2', '-movflags', '+faststart', file], { windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] });
  let error = ''; process.stderr.on('data', data => { error = (error + data).slice(-6000); });
  const finished = new Promise((resolve, reject) => { process.on('error', reject); process.on('close', code => code === 0 ? resolve() : reject(Error(`视频编码失败：${error}`))); });
  finished.catch(() => {});
  await once(process, 'spawn');
  const client = await page.context().newCDPSession(page);
  let firstTimestamp = null, startedAt = 0, previous = null, count = 0, pending = Promise.resolve();
  let resolveFirst;
  const firstFrame = new Promise(resolve => { resolveFirst = resolve; });
  const writeUntil = async target => {
    while (previous && count < target) {
      if (!process.stdin.write(previous)) await once(process.stdin, 'drain');
      count++;
    }
  };
  client.on('Page.screencastFrame', event => {
    void client.send('Page.screencastFrameAck', { sessionId: event.sessionId });
    const timestamp = event.metadata.timestamp ?? Date.now() / 1000;
    if (firstTimestamp === null) { firstTimestamp = timestamp; startedAt = Math.abs(timestamp * 1000 - Date.now()) < 5000 ? timestamp * 1000 : Date.now(); resolveFirst(); }
    const target = Math.max(0, Math.round((timestamp - firstTimestamp) * 30)), buffer = Buffer.from(event.data, 'base64');
    // 按实际帧时间补齐帧间空隙，暂停页与慢帧不会让视频时间加速或声音错位。
    pending = pending.then(async () => { await writeUntil(target); previous = buffer; });
  });
  await client.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1280, maxHeight: 720, everyNthFrame: 1 });
  await firstFrame;
  return {
    startedAt,
    stop: async () => {
      const duration = (Date.now() - startedAt) / 1000;
      await client.send('Page.stopScreencast'); await pending;
      await writeUntil(Math.ceil(duration * 30)); process.stdin.end(); await finished; await client.detach();
      return { duration: count / 30, frames: count };
    },
  };
}

export async function muxCapture(ffmpeg, silent, audio, output, offset, duration) {
  await promisify(execFile)(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-i', silent, '-itsoffset', offset.toFixed(6), '-i', audio, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-af', 'aresample=async=1:first_pts=0', '-t', duration.toFixed(6), '-movflags', '+faststart', output], { windowsHide: true });
}
