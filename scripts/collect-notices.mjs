import { readFile, writeFile } from 'node:fs/promises';

const packages = ['react', 'react-dom', 'scheduler', 'three', '@fontsource/ibm-plex-mono', '@fontsource/barlow-condensed'];
const notices = ['Undead Tower — bundled frontend and font license notices\n\nElectron and Chromium notices are also included beside the extracted application executable.'];
for (const name of packages) {
  const root = new URL(`../node_modules/${name}/`, import.meta.url);
  const { version } = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
  const license = await readFile(new URL('LICENSE', root), 'utf8');
  notices.push(`${name} ${version}\n${'-'.repeat(60)}\n${license.trim()}`);
}
await writeFile(new URL('../public/THIRD-PARTY-NOTICES.txt', import.meta.url), notices.join('\n\n\n') + '\n');
