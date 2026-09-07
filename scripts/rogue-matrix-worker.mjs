import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const args = process.argv.slice(2);
const argument = name => args.includes(name) ? args[args.indexOf(name) + 1] : '';
const taskFile = argument('--tasks');
const output = argument('--output');
const progress = argument('--progress');
const workerIndex = argument('--worker-index');
const moduleUrl = argument('--module');
const deadline = Number(argument('--deadline') || Infinity);
if (!taskFile || !output || !progress || !workerIndex || !moduleUrl) throw new Error('Matrix worker requires --tasks, --output, --progress, --worker-index and --module');
if (!(deadline > 0)) throw new Error('--deadline must be a positive epoch timestamp');
if (!Number.isSafeInteger(Number(workerIndex))) throw new Error('--worker-index must be an integer');

// The parent hashes the sources and builds one shared SSR bundle before spawn.
const { simulateRogueRun } = await import(moduleUrl);
const tasks = JSON.parse(await readFile(taskFile, 'utf8'));
const started = performance.now();
await mkdir(dirname(output), { recursive: true });
const results = [];
for (const { index, options } of tasks) {
  if (Date.now() >= deadline) break;
  const entry = { index, run: simulateRogueRun(options) };
  results.push(entry);
  await appendFile(progress, JSON.stringify(entry) + '\n');
}
await writeFile(output, JSON.stringify(results) + '\n');
console.log(`Matrix worker ${workerIndex}: ${results.length} runs in ${((performance.now() - started) / 1000).toFixed(1)}s`);
