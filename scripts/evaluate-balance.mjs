import { writeFile } from 'node:fs/promises';
import { createServer } from 'vite';

// 与正在试玩的 Vite 服务隔离缓存，防止 SSR 模拟覆盖浏览器依赖的预构建版本。
const server = await createServer({ configFile: false, cacheDir: 'node_modules/.vite-balance', server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { evaluateBalance } = await server.ssrLoadModule('/scripts/balance-model.ts');
  const result = evaluateBalance();
  await writeFile(new URL('../docs/balance-results.json', import.meta.url), JSON.stringify(result, null, 2) + '\n');
  console.table(result.groups.map(({ difficulty, profile, fps, median, p10, p90, withinTarget, samples }) => ({ difficulty, profile, fps, median, p10, p90, target: `${withinTarget}/${samples}` })));
} finally { await server.close(); }
