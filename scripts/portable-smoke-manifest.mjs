import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { extractFile } from '@electron/asar';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const { version } = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const archive = path.join(root, 'release/win-unpacked/resources/app.asar');
const packagedMain = extractFile(archive, 'desktop/main.cjs');
const currentMain = await readFile(path.join(root, 'desktop/main.cjs'));
if (!packagedMain.equals(currentMain) || !packagedMain.includes('undead-smoke-hidden')) {
  throw Error('打包入口未包含当前静默模式，不能生成静默验收凭据');
}
const file = path.join(root, 'release', `Undead Tower Rogue ${version}.exe`);
const sha256 = createHash('sha256').update(await readFile(file)).digest('hex');
await writeFile(`${file}.smoke.json`, JSON.stringify({ version, hiddenSmoke: true, sha256 }, null, 2));
console.log('已生成静默验收凭据（无需启动 EXE）');
