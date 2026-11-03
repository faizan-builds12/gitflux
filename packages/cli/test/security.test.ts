import { describe, it, expect, afterAll } from 'vitest';
import { existsSync } from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import WebSocket from 'ws';
import { Engine } from '../src/engine.js';
import { startServer } from '../src/server.js';
import { assess } from '../src/guard.js';
import { redact } from '../src/redact.js';
import { makeRepo, sh } from './helpers.js';

process.env.GITFLUX_NO_OPEN = '1';

describe('server only talks to its own page', async () => {
  const r = makeRepo();
  r.commit('add key ghp_' + 'A'.repeat(36));
  r.git('remote', 'add', 'origin', 'https://user:ghp_FAKE1234567890abcdef@github.com/me/app.git');
  const engine = new Engine(r.root);
  await engine.start();
  const srv = await startServer(engine, 4600, { folder: r.root });
  const base = `http://127.0.0.1:${srv.port}`;
  afterAll(async () => { await srv.close(); await engine.stop(); });

  const wsOpens = (origin: string) => new Promise<boolean>(resolve => {
    const ws = new WebSocket(`ws://127.0.0.1:${srv.port}/ws`, { headers: { Origin: origin } });
    ws.on('message', () => { resolve(true); ws.close(); });
    ws.on('error', () => resolve(false));
  });

  it('refuses WebSockets from other websites', async () => {
    expect(await wsOpens('https://evil.example')).toBe(false);
    expect(await wsOpens('http://evil.example:4600')).toBe(false);
    expect(await wsOpens(`http://localhost:${srv.port}`)).toBe(true);
  });

  // fetch() won't let us set Host, so use a raw request
  const statusWithHost = (host: string) => new Promise<number>(resolve => {
    http.get({ host: '127.0.0.1', port: srv.port, path: '/api/state', headers: { Host: host } }, res => { res.resume(); resolve(res.statusCode ?? 0); });
  });

  it('refuses requests addressed to another host name (DNS rebinding)', async () => {
    expect(await statusWithHost(`evil.example:${srv.port}`)).toBe(403);
    expect(await statusWithHost(`localhost:${srv.port}`)).toBe(200);
    expect(await statusWithHost(`127.0.0.1:${srv.port}`)).toBe(200);
    expect(await statusWithHost(`LOCALHOST:${srv.port}`)).toBe(200);
    expect(await statusWithHost(`localhost.evil.example:${srv.port}`)).toBe(403);
  });

  it('rejects oversized hook messages', async () => {
    const res = await fetch(`${base}/api/hook`, { method: 'POST', body: JSON.stringify({ prompt: 'x'.repeat(2 << 20) }) }).catch(() => ({ status: 413 }));
    expect(res.status).toBe(413);
  });

  it('never shows tokens from the remote URL', async () => {
    const state = await (await fetch(`${base}/api/state`)).text();
    expect(state).not.toContain('ghp_FAKE');
    expect(state).not.toContain('ghp_AAAA'); // token typed into a commit message
    expect(state).toContain('https://***@github.com/me/app.git');
  });
});

describe('guard hardening', () => {
  /** origin/main has a snapshot the laptop doesn't, so a force push is clearly risky. */
  function diverged() {
    const r = makeRepo(true);
    r.commit('first');
    r.git('push', '-q', '-u', 'origin', 'main');
    const other = path.join(r.base, 'other');
    sh(r.base, 'clone', '-q', path.join(r.base, 'origin.git'), other);
    sh(other, '-c', 'user.name=T', '-c', 'user.email=t@t.dev', 'commit', '-q', '--allow-empty', '-m', 'teammate');
    sh(other, 'push', '-q');
    r.git('fetch', '-q');
    return r;
  }
  const high = async (cmd: string, cwd: string) => (await assess(cmd, cwd)).filter(v => v.risk === 'high');

  it('never passes option-like names to git, and still pauses', async () => {
    const r = diverged();
    const v = await high('git push --force origin +--output=OWNED.txt:main', r.root);
    expect(existsSync(path.join(r.root, 'OWNED.txt'))).toBe(false);
    expect(v).toHaveLength(1);
    expect(await high('git reset --hard -- --output=X.txt', r.root)).toHaveLength(1);
    expect(existsSync(path.join(r.root, 'X.txt'))).toBe(false);
  });

  it('sees through shells, NAME=value prefixes, wrappers and aliases', async () => {
    const r = diverged();
    expect(await high('git push --force', r.root)).toHaveLength(1);
    expect(await high('bash -c "git push --force"', r.root)).toHaveLength(1);
    expect(await high('GIT_TRACE=1 git push --force', r.root)).toHaveLength(1);
    expect(await high('env GIT_TRACE=1 git push --force', r.root)).toHaveLength(1);
    expect(await high('git -c alias.p="push -f" p', r.root)).toHaveLength(1);
    r.git('config', 'alias.yolo', 'push --force');
    expect(await high('git yolo', r.root)).toHaveLength(1);
    expect(await high('git status', r.root)).toEqual([]);
  });
});

describe('redact', () => {
  it('hides credentials in URLs and common token formats', () => {
    expect(redact('https://user:ghp_abc123abc123abc123abc123@github.com/me/x.git')).toBe('https://***@github.com/me/x.git');
    expect(redact('https://x-access-token:abc@github.com/a/b')).toBe('https://***@github.com/a/b');
    expect(redact('key is sk-ant-api03-abcdefghijklmnopqrstuvwxyz')).toBe('key is ***');
    expect(redact('AKIAABCDEFGHIJKLMNOP and ghp_0123456789abcdefghij0123')).toBe('*** and ***');
    expect(redact('Authorization: Bearer abcdefghijklmnopqrstuvwxyz123')).toBe('Authorization: Bearer ***');
    expect(redact('git push origin main')).toBe('git push origin main');
  });
});
