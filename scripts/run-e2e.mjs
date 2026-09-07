import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

// Keep Vite in this process. Playwright's shell/taskkill server teardown can hang
// in restricted Windows sessions, even after all browser workers have exited.
const root = fileURLToPath(new URL('../', import.meta.url));
let server;
let child;
let exitCode = 1;
try {
  const existing = await fetch('http://127.0.0.1:5175', { signal: AbortSignal.timeout(800) }).then(response => response.ok).catch(() => false);
  if (!existing) {
    server = await createServer({ root, clearScreen: false, server: { host: '127.0.0.1', port: 5175, strictPort: true } });
    await server.listen();
  }
  child = spawn(process.execPath, [fileURLToPath(new URL('../node_modules/playwright/cli.js', import.meta.url)), 'test', ...process.argv.slice(2)], {
    cwd: root, stdio: 'inherit', windowsHide: true,
    env: { ...process.env, UNDEAD_MANAGED_TEST_SERVER: '1' },
  });
  const interrupt = () => child?.kill('SIGINT');
  process.once('SIGINT', interrupt);
  exitCode = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', code => resolve(code ?? 1)); });
  process.removeListener('SIGINT', interrupt);
} catch (error) {
  console.error(error);
} finally {
  await server?.close();
  process.exitCode = exitCode;
}
