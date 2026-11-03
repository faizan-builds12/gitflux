#!/usr/bin/env node
import path from 'node:path';
import { Engine, VERSION } from './engine.js';
import { startServer } from './server.js';
import { installHooks, runHookClient } from './hooks.js';
import { findRepo } from './snapshot.js';
import { openBrowser, runOpen, runSessionStart } from './launcher.js';

const HELP = `GitFlux ${VERSION}: see what happens to your git and GitHub, whether you or your AI agent runs the commands.

Usage
  gitflux [folder] [--port 4317] [--no-open]   Watch a folder and open the live map
  gitflux open [folder]                        Open the map, starting GitFlux if needed
  gitflux init-hooks [folder] [--agent codex]  Connect Claude Code (default) or Codex without the plugin

Working by hand, in any terminal or app? Just run "gitflux" in your project: it maps every git change.
With the Claude Code or Codex plugin, GitFlux starts with every session.
GitFlux only reads git. It never changes your repository.`;

// this file, whether run from dist/cli.js or the bundled plugin/bin/gitflux.mjs
const self = process.argv[1];

async function main() {
  const args = process.argv.slice(2);
  const flag = (name: string) => args.includes(name);
  const opt = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
  const positional = args.filter((a, i) => !a.startsWith('--') && !(args[i - 1] ?? '').match(/^--(port|agent)$/));

  if (flag('--help') || flag('-h')) return console.log(HELP);
  if (flag('--version') || flag('-v')) return console.log(VERSION);

  if (positional[0] === 'hook') return runHookClient(self, args);
  if (positional[0] === 'session-start') return runSessionStart(self, args);
  if (positional[0] === 'open') return runOpen(self, path.resolve(positional[1] ?? '.'));

  if (positional[0] === 'init-hooks') {
    const folder = path.resolve(positional[1] ?? '.');
    const repo = await findRepo(folder);
    const agent = opt('--agent') === 'codex' ? 'codex' : 'claude-code';
    const file = installHooks(repo?.root ?? folder, path.resolve(self), agent);
    const name = agent === 'codex' ? 'Codex' : 'Claude Code';
    console.log(`Connected ${name} to GitFlux.\n  Updated ${file}\n  Restart ${name} in this folder${agent === 'codex' ? ' and approve the new hooks with /hooks' : ''}. GitFlux starts with each session.`);
    return;
  }

  const folder = path.resolve(positional[0] ?? '.');
  const agentArg = opt('--agent');
  const engine = new Engine(folder, { agent: agentArg === 'codex' || agentArg === 'claude-code' ? agentArg : undefined });
  await engine.start();
  const { port, close } = await startServer(engine, Number(opt('--port') ?? 4317), { folder, idleExit: flag('--idle-exit') });
  const url = `http://localhost:${port}`;
  console.log(`\n  GitFlux is watching ${engine.state.repo?.name ?? folder}\n  ${url}\n\n  Press Ctrl+C to stop.\n`);
  if (!flag('--no-open')) openBrowser(url);

  const stop = async () => { await close(); await engine.stop(); process.exit(0); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  engine.once('idle', stop);
}

main().catch(e => { console.error(e?.message ?? e); process.exit(1); });
