import { fileURLToPath } from 'node:url';

const ROOT = new URL("../../../../../", import.meta.url);
const PACKAGES_ROOT = fileURLToPath(new URL("packages/", ROOT));

export function resolve(specifier, context, nextResolve) {
  let tsSpecifier = specifier;
  if (specifier.includes('@gsd/')) {
    tsSpecifier = specifier.replace('@gsd/', PACKAGES_ROOT).replace('/dist/', '/src/');
    if (tsSpecifier.includes('/packages/pi-ai') && !tsSpecifier.endsWith('.ts')) {
        tsSpecifier = tsSpecifier.replace(/\/packages\/pi-ai$/, '/packages/pi-ai/src/index.ts');
    } else if (!tsSpecifier.includes('/src/') && !tsSpecifier.endsWith('.ts')) {
        // Fallback for other gsd packages like pi-coding-agent, pi-tui, pi-agent-core
        tsSpecifier = tsSpecifier.replace(/\/packages\/([^\/]+)$/, '/packages/$1/src/index.ts');
    } else if (!tsSpecifier.endsWith('.ts') && !tsSpecifier.endsWith('.js') && !tsSpecifier.endsWith('.mjs')) {
        tsSpecifier += '/index.ts';
    }
  } else if (specifier.endsWith('.js')) {
    tsSpecifier = specifier.replace(/\.js$/, '.ts');
  }

  return nextResolve(tsSpecifier, context);
}
