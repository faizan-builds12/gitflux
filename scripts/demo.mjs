#!/usr/bin/env node
// Live demo: drives a real repository like an AI agent would, while GitFlux watches.
//   npm run demo            (opens the browser)
//   npm run demo -- --no-open --fast
// Everything happens inside ./.demo; a bare repo there stands in for GitHub.
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync, appendFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const demo = path.join(root, '.demo');
const work = path.join(demo, 'todo-app');
const origin = path.join(demo, 'github', 'todo-app.git');
const ghSide = path.join(demo, 'github-web');
const args = process.argv.slice(2);
const fast = args.includes('--fast');
const PAUSE = fast ? 900 : 2600;

rmSync(demo, { recursive: true, force: true });
mkdirSync(work, { recursive: true });
mkdirSync(path.dirname(origin), { recursive: true });

const env = { ...process.env, GIT_AUTHOR_NAME: 'Agent', GIT_AUTHOR_EMAIL: 'agent@example.com', GIT_COMMITTER_NAME: 'Agent', GIT_COMMITTER_EMAIL: 'agent@example.com' };
const sh = (cwd, cmd) => {
  const r = spawnSync(cmd, { cwd, shell: true, env, encoding: 'utf8' });
  return { stdout: r.stdout ?? '', stderr: r.stderr ?? '', code: r.status };
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

// start GitFlux before the repo exists, so you see it pick up `git init`
const cli = path.join(root, 'packages', 'cli', 'dist', 'cli.js');
const server = spawn(process.execPath, [cli, work, ...(args.includes('--no-open') ? ['--no-open'] : [])], { stdio: ['ignore', 'pipe', 'inherit'] });
const port = await new Promise(resolve => {
  server.stdout.on('data', d => { const m = /localhost:(\d+)/.exec(String(d)); if (m) resolve(+m[1]); process.stdout.write(d); });
});
const hook = body => fetch(`http://127.0.0.1:${port}/api/hook`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ cwd: work, ...body }) }).catch(() => {});
const say = async prompt => { console.log(`\n> ${prompt}`); await hook({ hook_event_name: 'UserPromptSubmit', prompt }); await sleep(PAUSE * 0.6); };
const agent = async (cmd, { cwd = work, refused = false } = {}) => {
  console.log(`  $ ${cmd}`);
  await hook({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: cmd } });
  // the guard paused it and you said no in your agent: it never runs
  if (refused) { console.log('    (GitFlux paused it; you said no)'); await sleep(PAUSE * 1.8); return; }
  const r = sh(cwd, cmd);
  await hook({ hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command: cmd }, tool_response: { stdout: r.stdout.trim(), stderr: r.stderr.trim() } });
  await sleep(PAUSE);
  return r;
};
const file = (rel, text) => { const f = path.join(work, rel); mkdirSync(path.dirname(f), { recursive: true }); writeFileSync(f, text); };

await sleep(fast ? 1500 : 4000);

await say('Build me a simple todo app and put it on GitHub.');
await agent('git init -b main');
sh(work, 'git config user.name Agent && git config user.email agent@example.com && git config core.autocrlf false');
file('index.html', '<!doctype html><title>Todo</title><ul id="list"></ul>\n');
file('app.js', 'const todos = [];\n');
await agent('git add . && git commit -m "Scaffold todo app"');
appendFileSync(path.join(work, 'app.js'), 'function render() {}\n');
await agent('git commit -am "Add todo list UI"');
sh(demo, `git init -q --bare -b main "${origin}"`);
await agent(`git remote add origin "${origin}" && git push -u origin main`);

await say('Nice. Now add a login page.');
await agent('git checkout -b feature/login');
file('login.html', '<form id="login"></form>\n');
await agent('git add . && git commit -m "feat: add login form"');
file('auth.js', 'export async function login() {}\n');
await agent('git add . && git commit -m "Connect auth API"');
await agent('git push -u origin feature/login');

// meanwhile on github.com: the pull request gets squash-merged
console.log('\n  (you merge the pull request on GitHub)');
sh(demo, `git clone -q "${origin}" "${ghSide}"`);
sh(ghSide, 'git config user.name You && git config user.email you@example.com && git merge -q --squash origin/feature/login && git commit -q -m "Add login (#1)" && git push -q origin main');
await sleep(PAUSE * 0.5);

await say('The title has a typo. Just fix it quickly.');
await agent('git checkout main');
file('index.html', '<!doctype html><title>Todos</title><ul id="list"></ul>\n');
await agent('git commit -am "Fix typo in title"');
await agent('git push origin main');
await agent('git fetch origin');
await agent('git push --force origin main', { refused: true });

await say('No, don’t force it. Combine with what’s on GitHub, then upload.');
await agent('git pull --no-rebase --no-edit origin main');
await agent('git push origin main');

await say('Add my API key so the login works.');
file('.env', 'API_KEY=sk_test_123\n');
await agent('git add .env && git commit -m "Add API key config"');

console.log(`\nDemo finished. GitFlux is still running at http://localhost:${port} (Ctrl+C to stop).`);
process.on('SIGINT', () => { server.kill(); process.exit(0); });
