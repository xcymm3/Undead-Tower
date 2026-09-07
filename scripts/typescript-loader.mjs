import { access } from 'node:fs/promises';

// Node's type transformation handles .ts files, while this narrow resolver
// preserves the extensionless relative imports used by the production source.
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (error?.code !== 'ERR_MODULE_NOT_FOUND' || !specifier.startsWith('.')) throw error;
    const candidate = new URL(`${specifier}.ts`, context.parentURL);
    await access(candidate);
    return nextResolve(candidate.href, context);
  }
}
