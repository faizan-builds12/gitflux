#!/usr/bin/env node
// Build the GitFlux plugin (Claude Code and Codex): one self-contained server file plus the built page.
//   plugin/bin/gitflux.mjs   CLI + server + hooks, dependencies bundled in (needs only Node 18+)
//   plugin/THIRD_PARTY_LICENSES.txt   the bundled dependencies' licenses
//   plugin/ui/              the web page
// Run after `npm run build -w @gitflux/ui`. The output is committed so installing needs no npm.
import { build } from 'esbuild';
import { cpSync, rmSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'plugin');
const ui = path.join(root, 'packages/cli/ui-dist');
if (!existsSync(path.join(ui, 'index.html'))) throw new Error('Build the UI first: npm run build -w @gitflux/ui');

await build({
  entryPoints: [path.join(root, 'packages/cli/src/cli.ts')],
  outfile: path.join(out, 'bin/gitflux.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node18',
  minify: true,
  legalComments: 'none',
  // ws loads these optional native speedups inside try/catch
  external: ['bufferutil', 'utf-8-validate'],
  // bundled CommonJS dependencies call require()
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" }
});

rmSync(path.join(out, 'ui'), { recursive: true, force: true });
cpSync(ui, path.join(out, 'ui'), { recursive: true });

// The bundle drops the dependencies' license comments, so their notices ship in one file instead.
// Walks the runtime dependencies of the CLI and the page (not dev tools, which aren't shipped).
function pkgDir(name, from) {
  for (let d = from; ; d = path.dirname(d)) {
    const p = path.join(d, 'node_modules', name);
    if (existsSync(path.join(p, 'package.json'))) return p;
    if (path.dirname(d) === d) return null;
  }
}
const seen = new Map();
function walk(name, from) {
  const dir = pkgDir(name, from);
  if (!dir || seen.has(dir)) return;
  const pkg = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'));
  const file = readdirSync(dir).find(f => /^(licen[sc]e|copying)/i.test(f));
  seen.set(dir, { name: pkg.name, version: pkg.version, license: pkg.license, text: file ? readFileSync(path.join(dir, file), 'utf8').trim() : null });
  for (const dep of Object.keys(pkg.dependencies ?? {})) walk(dep, dir);
}
for (const w of ['packages/cli', 'packages/ui']) {
  const pkg = JSON.parse(readFileSync(path.join(root, w, 'package.json'), 'utf8'));
  for (const dep of Object.keys(pkg.dependencies ?? {})) walk(dep, path.join(root, w));
}
const notices = [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
writeFileSync(path.join(out, 'THIRD_PARTY_LICENSES.txt'),
  'GitFlux includes the following open-source software. Their licenses follow.\n\n' +
  notices.map(n => `${'='.repeat(72)}\n${n.name} ${n.version} (${n.license})\n${'='.repeat(72)}\n\n${n.text ?? `Licensed under ${n.license}.`}\n`).join('\n'));

console.log(`plugin built: plugin/bin/gitflux.mjs + plugin/ui + notices for ${notices.length} packages`);
