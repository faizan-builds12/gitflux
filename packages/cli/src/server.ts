import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { Engine } from './engine.js';
import { clearRegistry, writeRegistry } from './launcher.js';
import type { ServerMessage } from './types.js';

const here = path.dirname(fileURLToPath(import.meta.url));
// plugin bundle: bin/gitflux.mjs + ui/; source build: dist/cli.js + ui-dist/
const UI_DIR = [path.resolve(here, '../ui'), path.resolve(here, '../ui-dist')].find(d => existsSync(path.join(d, 'index.html'))) ?? path.resolve(here, '../ui-dist');
const IDLE_MS = 30 * 60_000;
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json'
};

/**
 * `idleExit`: started in the background by the plugin, so stop after half an hour with no page
 * open and no agent activity. The next prompt starts it again.
 */
export async function startServer(engine: Engine, port: number, opts: { folder: string; idleExit?: boolean }): Promise<{ port: number; close: () => Promise<void> }> {
  let lastActive = Date.now();
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (!fromLocalPage(req)) { res.writeHead(403).end(); return; }

    if (url.pathname === '/api/ping') return json(res, { ok: true, root: engine.state.repo?.root });
    if (url.pathname === '/api/state') return json(res, engine.state);
    if (url.pathname === '/api/hook' && req.method === 'POST') {
      lastActive = Date.now();
      const body = await read(req);
      if (body === null) { res.writeHead(413).end(); return; }
      try { await engine.onHook(JSON.parse(body)); } catch {}
      res.writeHead(200, { 'content-type': 'application/json' }).end();
      return;
    }
    if (url.pathname === '/api/guard' && req.method === 'POST') {
      try {
        const { mode } = JSON.parse((await read(req)) ?? '');
        if (mode === 'ask' || mode === 'block' || mode === 'off') engine.setGuard(mode);
      } catch {}
      return json(res, { guard: engine.state.guard });
    }
    const m = /^\/api\/alerts\/([^/]+)\/dismiss$/.exec(url.pathname);
    if (m && req.method === 'POST') { engine.dismiss(decodeURIComponent(m[1])); return json(res, { ok: true }); }
    const rm = /^\/api\/alerts\/([^/]+)\/restore$/.exec(url.pathname);
    if (rm && req.method === 'POST') { engine.restore(decodeURIComponent(rm[1])); return json(res, { ok: true }); }
    serveStatic(url.pathname, res);
  });

  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
  server.on('upgrade', (req, socket, head) => {
    // browsers let any website open a WebSocket to localhost, so the origin check matters most here
    if (!req.url?.startsWith('/ws') || !fromLocalPage(req)) return socket.destroy();
    wss.handleUpgrade(req, socket, head, ws => {
      lastActive = Date.now();
      ws.on('close', () => { lastActive = Date.now(); });
      send(ws, { type: 'state', state: engine.state });
    });
  });
  let pending: NodeJS.Timeout | undefined;
  engine.on('change', () => {
    // coalesce bursts (a push touches many refs)
    clearTimeout(pending);
    pending = setTimeout(() => { for (const c of wss.clients) send(c, { type: 'state', state: engine.state }); }, 40);
  });

  const actual = await listen(server, port);
  // hooks find this server from the folder it was started for and from the repo root
  const folders = () => [opts.folder, engine.state.repo?.root ?? opts.folder];
  const register = () => writeRegistry(folders(), { port: actual, pid: process.pid, root: engine.state.repo?.root ?? opts.folder });
  register();
  let lastRoot = engine.state.repo?.root;
  engine.on('change', () => { if (engine.state.repo?.root !== lastRoot) { lastRoot = engine.state.repo?.root; register(); } });

  const idle = opts.idleExit ? setInterval(() => {
    if (wss.clients.size === 0 && Date.now() - lastActive > IDLE_MS) engine.emit('idle');
  }, 60_000) : undefined;
  idle?.unref();

  return {
    port: actual,
    close: async () => {
      clearInterval(idle);
      clearRegistry(folders(), process.pid);
      wss.close(); server.close();
    }
  };
}

const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;
const MAX_BODY = 1 << 20; // hook payloads are a few KB; 1 MB leaves room for long command output

/**
 * Only GitFlux's own page (and local tools like the hook client) may talk to the server.
 * Host stops DNS rebinding, where a website points its own name at 127.0.0.1;
 * Origin stops other websites calling in, which browsers allow for WebSockets.
 */
function fromLocalPage(req: http.IncomingMessage) {
  if (!LOCAL.test(req.headers.host ?? '')) return false;
  const origin = req.headers.origin;
  if (!origin) return true; // not a browser page: the hook client, curl
  try { return LOCAL.test(new URL(origin).host) && new URL(origin).protocol === 'http:'; } catch { return false; }
}

function send(ws: WebSocket, msg: ServerMessage) { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg)); }
function json(res: http.ServerResponse, data: unknown) { res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(data)); }
/** The request body, or null if it is bigger than MAX_BODY. */
function read(req: http.IncomingMessage) {
  return new Promise<string | null>(resolve => {
    let s = '', size = 0;
    req.on('data', d => {
      size += d.length;
      if (size > MAX_BODY) { resolve(null); req.destroy(); return; }
      s += d;
    });
    req.on('end', () => resolve(s));
    req.on('error', () => resolve(null));
  });
}

function serveStatic(p: string, res: http.ServerResponse) {
  let file = path.join(UI_DIR, path.normalize(p).replace(/^([\\/]\.\.)+/, ''));
  if (!file.startsWith(UI_DIR) || !existsSync(file) || statSync(file).isDirectory()) file = path.join(UI_DIR, 'index.html');
  if (!existsSync(file)) {
    res.writeHead(500, { 'content-type': 'text/plain' }).end('GitFlux UI is not built. Run "npm run build" in the repository root.');
    return;
  }
  const ext = path.extname(file);
  res.writeHead(200, { 'content-type': TYPES[ext] ?? 'application/octet-stream', 'cache-control': ext === '.html' ? 'no-cache' : 'max-age=31536000, immutable' });
  createReadStream(file).pipe(res);
}

function listen(server: http.Server, port: number, tries = 20): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', (e: any) => {
      if (e.code === 'EADDRINUSE' && tries > 0) resolve(listen(server, port + 1, tries - 1));
      else reject(e);
    });
    server.listen(port, '127.0.0.1', () => resolve((server.address() as any).port));
  });
}
