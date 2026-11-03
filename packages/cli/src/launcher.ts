import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { AgentId } from './types.js';

/**
 * Starting GitFlux without any setup. Each watched folder gets one background server;
 * a small registry in ~/.gitflux lets hooks find it from any subfolder, even before `git init`.
 */

const HOME = path.join(os.homedir(), '.gitflux');
/**
 * One spelling per folder, whoever reports it: agents may pass a Windows short name
 * (C:\Users\JOHNSM~1\…), a symlink or a different case, while git reports the long form.
 */
const norm = (p: string) => {
  let r = path.resolve(p);
  try { r = realpathSync.native(r); } catch { /* folder may not exist yet */ }
  return process.platform === 'win32' ? r.toLowerCase() : r;
};
const key = (folder: string) => createHash('sha1').update(norm(folder)).digest('hex').slice(0, 16);
const regFile = (folder: string) => path.join(HOME, 'servers', `${key(folder)}.json`);


/** Which agent is calling: the hook command says so (`--agent codex`); otherwise read the payload. */
export function agentOf(argv: string[], payload: any): AgentId {
  const i = argv.indexOf('--agent');
  const named = i >= 0 ? argv[i + 1] : undefined;
  if (named === 'codex' || named === 'claude-code') return named;
  return /[\\/]\.codex[\\/]/.test(String(payload?.transcript_path ?? '')) ? 'codex' : 'claude-code';
}

export interface ServerInfo { port: number; pid: number; root: string }

export function writeRegistry(folders: string[], info: ServerInfo) {
  mkdirSync(path.join(HOME, 'servers'), { recursive: true });
  for (const f of new Set(folders.map(norm))) writeFileSync(regFile(f), JSON.stringify(info));
}

export function clearRegistry(folders: string[], pid: number) {
  for (const f of folders) {
    try { if (JSON.parse(readFileSync(regFile(f), 'utf8')).pid === pid) rmSync(regFile(f)); } catch {}
  }
}

const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch (e: any) { return e?.code === 'EPERM'; } };

function readRegistry(folder: string): ServerInfo | null {
  try {
    const info = JSON.parse(readFileSync(regFile(folder), 'utf8')) as ServerInfo;
    if (alive(info.pid)) return info;
    rmSync(regFile(folder), { force: true });
  } catch {}
  return null;
}

/** The server watching `cwd` or the nearest folder above it. */
export function findServer(cwd: string): ServerInfo | null {
  let dir = path.resolve(cwd);
  for (;;) {
    const s = readRegistry(dir);
    if (s) return s;
    const up = path.dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

/** The folder to watch for a session started in `cwd`: its git repo, or the folder itself. */
export function projectRoot(cwd: string) {
  try { return execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }).toString().trim() || cwd; }
  catch { return cwd; }
}

/** Places a session can start in that are clearly not a project. */
export function worthWatching(folder: string) {
  const f = norm(folder);
  return f !== norm(os.homedir()) && f !== norm(path.parse(f).root) && existsSync(folder);
}

export function ping(port: number, ms = 1500): Promise<boolean> {
  return new Promise(resolve => {
    const req = http.get({ host: '127.0.0.1', port, path: '/api/ping', timeout: ms }, res => { res.resume(); resolve(res.statusCode === 200); });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Return the running server for `folder`, starting one in the background if needed. */
export async function ensureServer(folder: string, cliFile: string, agent?: AgentId): Promise<ServerInfo | null> {
  const existing = readRegistry(folder);
  if (existing && await ping(existing.port)) return existing;
  const child = spawn(process.execPath, [cliFile, folder, '--no-open', ...(agent ? ['--agent', agent] : []), '--idle-exit'], { detached: true, stdio: 'ignore', windowsHide: true });
  child.unref();
  for (let i = 0; i < 60; i++) {
    await sleep(200);
    const s = readRegistry(folder);
    if (s && s.pid === child.pid && await ping(s.port, 800)) return s;
  }
  return null;
}

/** True the first time it is asked for a folder, so the page opens once per project. */
export function firstOpen(folder: string) {
  const f = path.join(HOME, 'opened', key(folder));
  if (existsSync(f)) return false;
  mkdirSync(path.dirname(f), { recursive: true });
  writeFileSync(f, norm(folder));
  return true;
}

export function openBrowser(url: string) {
  if (process.env.GITFLUX_NO_OPEN) return;
  const [cmd, argv] = process.platform === 'win32' ? ['cmd', ['/c', 'start', '""', url]]
    : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  try { spawn(cmd, argv as string[], { stdio: 'ignore', detached: true, windowsHide: true }).unref(); } catch {}
}

export function readStdin(ms = 2000): Promise<string> {
  return new Promise(res => {
    let s = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', d => (s += d));
    process.stdin.on('end', () => res(s));
    setTimeout(() => res(s), ms);
  });
}

export function post(port: number, p: string, body: string): Promise<string> {
  return new Promise(resolve => {
    const req = http.request({ host: '127.0.0.1', port, path: p, method: 'POST', headers: { 'content-type': 'application/json' }, timeout: 1500 }, res => {
      let s = ''; res.on('data', d => (s += d)); res.on('end', () => resolve(s));
    });
    req.on('error', () => resolve(''));
    req.on('timeout', () => { req.destroy(); resolve(''); });
    req.end(body);
  });
}

/**
 * `gitflux session-start`: the Claude Code SessionStart hook. Starts (or finds) the server for
 * this project, opens the page the first time, and tells the user where it is.
 */
export async function runSessionStart(cliFile: string, argv: string[] = []) {
  let payload: any = {};
  try { payload = JSON.parse((await readStdin()) || '{}'); } catch {}
  const root = projectRoot(payload.cwd || process.cwd());
  if (!worthWatching(root)) return;
  const agent = agentOf(argv, payload);
  const s = await ensureServer(root, cliFile, agent);
  if (!s) return;
  await post(s.port, '/api/hook', JSON.stringify({ ...payload, hook_event_name: 'SessionStart', gitflux_agent: agent }));
  const url = `http://localhost:${s.port}`;
  if (firstOpen(root)) openBrowser(url);
  process.stdout.write(JSON.stringify({
    systemMessage: `GitFlux is watching ${path.basename(root)}: ${url}`,
    hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: `GitFlux, a live map of this project's git and GitHub activity, is running at ${url}. If the user asks how to see what you did to git, point them there. If GitFlux blocks a git command because it would lose work, explain what would be lost and ask the user before trying again.` }
  }));
}

/** `gitflux open`: start the server if needed and open the page now. */
export async function runOpen(cliFile: string, cwd: string) {
  const root = projectRoot(cwd);
  const s = await ensureServer(root, cliFile);
  if (!s) { console.log('GitFlux could not start. Run "gitflux" in this folder to see why.'); process.exitCode = 1; return; }
  const url = `http://localhost:${s.port}`;
  openBrowser(url);
  console.log(`GitFlux is watching ${path.basename(root)}: ${url}`);
}
