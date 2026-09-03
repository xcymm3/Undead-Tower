import { writeFile } from 'node:fs/promises';
import { createServer } from 'vite';

const server = await createServer({ configFile: false, server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { evaluateBalance } = await server.ssrLoadModule('/scripts/balance-model.ts');
  const result = evaluateBalance();
  await writeFile(new URL('../docs/balance-results.json', import.meta.url), JSON.stringify(result, null, 2) + '\n');
  console.table(result.groups.map(({ difficulty, profile, fps, median, p10, p90, withinTarget, samples }) => ({ difficulty, profile, fps, median, p10, p90, target: `${withinTarget}/${samples}` })));
} finally { await server.close(); }
