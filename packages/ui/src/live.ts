import { useEffect, useState } from 'react';
import type { AppState, GuardMode, ServerMessage } from '../../cli/src/types';

/** Live state from the local GitFlux server, with automatic reconnect. */
export function useLive() {
  const [state, setState] = useState<AppState | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let retry = 800;
    let timer: number | undefined;
    let closed = false;
    const open = () => {
      ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
      ws.onopen = () => { setConnected(true); retry = 800; };
      ws.onmessage = ev => {
        const msg = JSON.parse(ev.data) as ServerMessage;
        if (msg.type === 'state') setState(msg.state);
      };
      ws.onclose = () => {
        setConnected(false);
        if (!closed) timer = window.setTimeout(open, (retry = Math.min(retry * 1.6, 5000)));
      };
    };
    open();
    return () => { closed = true; clearTimeout(timer); ws?.close(); };
  }, []);

  return { state, connected };
}

export function restoreAlert(id: string) {
  return fetch(`/api/alerts/${encodeURIComponent(id)}/restore`, { method: 'POST' }).catch(() => undefined);
}

export function dismissAlert(id: string) {
  return fetch(`/api/alerts/${encodeURIComponent(id)}/dismiss`, { method: 'POST' }).catch(() => undefined);
}

export function setGuard(mode: GuardMode) {
  return fetch('/api/guard', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode }) }).catch(() => undefined);
}

/** Re-render every `ms` so relative times stay fresh. */
export function useNow(ms = 15000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}

export function ago(t: number, now: number) {
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 10) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(t).toLocaleDateString();
}
