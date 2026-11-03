import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Tag, Warning, CheckFat, CloudArrowUp, GitMerge, Laptop, GithubLogo, Minus, Plus, CornersOut, ArrowLineRight, ArrowsDownUp, GitPullRequest, FolderSimpleDashed, CircleNotch } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Tip } from '@/components/ui/tooltip';
import type { AppState } from '../../../cli/src/types';
import { type Layout, type LNode, type Pt } from '../layout';
import { commitKind } from '../icons';

interface View { x: number; y: number; k: number }
interface Traveler { id: string; from: Pt; to: Pt; label: string; up: boolean }

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const short = (s: string) => s.slice(0, 7);

export function Canvas({ layout, state }: { layout: Layout; state: AppState | null }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 1 });
  const [follow, setFollow] = useState(true);
  const [anim, setAnim] = useState(false);
  const [drag, setDrag] = useState<{ x: number; y: number; vx: number; vy: number } | null>(null);

  useLayoutEffect(() => {
    const el = wrap.current!;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // keep the newest snapshots in view unless the user has moved the map
  const latestView = useCallback((): View => {
    // fit everything when possible; once the history is long, keep a readable zoom and pin the newest end
    const k = clamp(Math.min((size.h - 40) / layout.height, (size.w - 48) / layout.width), 0.55, 1.1);
    const w = layout.width * k;
    const x = w <= size.w - 40 ? (size.w - w) / 2 : size.w - w - 24;
    return { x, y: (size.h - layout.height * k) / 2, k };
  }, [layout.width, layout.height, size]);
  const fitView = useCallback((): View => {
    const k = clamp(Math.min((size.w - 60) / layout.width, (size.h - 40) / layout.height), 0.25, 1.1);
    return { x: (size.w - layout.width * k) / 2, y: (size.h - layout.height * k) / 2, k };
  }, [layout.width, layout.height, size]);

  useEffect(() => { if (follow) { setAnim(true); setView(latestView()); } }, [follow, latestView]);

  const zoomAt = (factor: number, cx = size.w / 2, cy = size.h / 2, smooth = true) => {
    setFollow(false); setAnim(smooth);
    setView(v => {
      const k = clamp(v.k * factor, 0.25, 2);
      return { k, x: cx - ((cx - v.x) * k) / v.k, y: cy - ((cy - v.y) * k) / v.k };
    });
  };

  // wheel: pan, or zoom with ctrl/cmd (and trackpad pinch)
  useEffect(() => {
    const el = wrap.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) zoomAt(Math.exp(-e.deltaY * 0.0022), e.clientX - r.left, e.clientY - r.top, false);
      else { setFollow(false); setAnim(false); setView(v => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY })); }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  // ---------- enter animations + snapshots crossing between bands ----------
  const prev = useRef<Map<string, Pt> | null>(null);
  const [travelers, setTravelers] = useState<Traveler[]>([]);
  const { fresh, delayed } = useMemo(() => {
    const before = prev.current;
    const fresh = new Set<string>(); const delayed = new Set<string>(); const trips: Traveler[] = [];
    if (before) {
      for (const n of layout.nodes) {
        if (before.has(n.key)) continue;
        fresh.add(n.key);
        if (n.ghost) continue;
        const otherKey = `${n.band === 'remote' ? 'local' : 'remote'}:${n.sha}`;
        const from = layout.pos.get(otherKey);
        if (from && before.has(otherKey) && !reduced()) {
          delayed.add(n.key);
          trips.push({ id: `${n.key}-${Date.now()}`, from, to: { x: n.x, y: n.y }, label: short(n.sha), up: n.band === 'local' });
        }
      }
    }
    if (trips.length) queueMicrotask(() => setTravelers(t => [...t, ...trips]));
    return { fresh, delayed };
  }, [layout]);
  useEffect(() => { prev.current = layout.pos; }, [layout]);

  const transform = `translate(${view.x}px, ${view.y}px) scale(${view.k})`;
  // branch labels and band headers stay pinned to the left edge when older history scrolls off-screen
  const stickX = Math.max(24, (14 - view.x) / view.k);
  // the tour explains one snapshot: the newest one on your laptop
  const tourNode = [...layout.nodes].reverse().find(n => n.band === 'local' && !n.ghost)?.key;
  const s = state?.snapshot;
  const remoteLabel = state?.github.nameWithOwner ?? s?.remotes.find(r => r.name === 'origin')?.url ?? s?.remotes[0]?.url;

  return (
    <section
      className={`canvas ${drag ? 'dragging' : ''}`}
      ref={wrap}
      aria-label="Branch map. Your laptop is the top band, GitHub is the bottom band."
      onPointerDown={e => {
        if ((e.target as HTMLElement).closest('button, a, [tabindex]')) return;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        setDrag({ x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }); setAnim(false); setFollow(false);
      }}
      onPointerMove={e => { if (drag) setView(v => ({ ...v, x: drag.vx + e.clientX - drag.x, y: drag.vy + e.clientY - drag.y })); }}
      onPointerUp={() => setDrag(null)}
    >
      {!s ? (
        <div className="empty-canvas">
          <div className="empty-card panel">
            <div className="tile">{state ? <FolderSimpleDashed size={28} /> : <CircleNotch size={28} className="spin" />}</div>
            <h2>{state ? 'This folder is not tracked by git yet' : 'Connecting to GitFlux'}</h2>
            <p>{state ? 'When you or your agent runs “git init”, your laptop and GitHub appear here and every change is drawn live.' : 'Run “gitflux” in this project, or start an agent session with the GitFlux plugin.'}</p>
          </div>
        </div>
      ) : (
        <div className={`world ${anim ? 'anim' : ''}`} style={{ width: layout.width, height: layout.height, transform }}>
          <svg className="edges" width={layout.width} height={layout.height} aria-hidden="true">
            <rect className="band local" x={0} y={layout.bands.local.y} width={layout.width} height={layout.bands.local.h} rx={26} />
            <rect className={`band remote ${layout.bands.remote.on ? '' : 'off'}`} x={0} y={layout.bands.remote.y} width={layout.width} height={layout.bands.remote.h} rx={26} />
            <line className="syncline" x1={24} x2={layout.width - 24} y1={layout.syncY} y2={layout.syncY} />
            {layout.edges.map(e => (
              <path key={e.key} className={`edge ${e.sprout ? 'sprout' : ''}`} d={e.d} style={{ ['--c' as string]: e.color, d: `path("${e.d}")` } as CSSProperties} />
            ))}
          </svg>

          <Tip tip="Snapshots saved on this computer. Only you can see these until they are uploaded." side="right">
            <div className="bandhead" data-tour="laptop" style={{ left: stickX, transform: `translateY(${layout.bands.local.y + 22}px)` }}>
              <span className="tile"><Laptop size={20} /></span>
              <span><b>Your laptop <em>Local</em></b><span>{s.root}</span></span>
            </div>
          </Tip>
          <Tip tip="Snapshots on GitHub: the backup, and what others see. They get here when your agent pushes." side="right">
          <div className="bandhead remote" data-tour="github" style={{ left: stickX, transform: `translateY(${layout.bands.remote.y + 22}px)` }}>
            <span className="tile gh"><GithubLogo size={20} weight="fill" /></span>
            <span><b>GitHub <em>Cloud</em></b><span>{layout.bands.remote.on ? `${remoteLabel ?? 'origin'}${state?.github.visibility ? ` · ${state.github.visibility}` : ''}` : 'Not on GitHub yet. It appears here after the first push.'}</span></span>
          </div>
          </Tip>
          <div className="synclabel" style={{ left: stickX + 276, top: layout.syncY }}>
            <ArrowsDownUp size={15} aria-hidden="true" />
            <span>Down is an upload (push), up is a download (pull){layout.truncated ? ' · newest 40 snapshots' : ''}</span>
          </div>

          {layout.pills.map(p => (
            <Tip key={p.key} side="right" tip={<><b>{p.name}</b><br />{p.band === 'local' ? 'Branch on your laptop' : 'Branch on GitHub'}. A branch is a separate line of work; its snapshots run left to right.</>}>
              <div className="lanepill" tabIndex={0} style={{ ['--c' as string]: p.color, left: stickX, transform: `translateY(${p.y}px) translateY(-50%)` }}>
                <i /><span>{p.name}</span>
              </div>
            </Tip>
          ))}

          {layout.nodes.map(n => <Node key={n.key} n={n} enter={fresh.has(n.key)} delay={delayed.has(n.key)} tour={n.key === tourNode} />)}

          {layout.annos.map(a => (
            <div key={a.key} style={{ position: 'absolute', left: 0, top: 0, transform: `translate(${a.x}px, ${a.y}px) translateY(-50%)`, display: 'flex', gap: 6, transition: 'transform .45s var(--ease)' }}>
              {a.badge && (
                <Tip tip={a.badge.tone === 'pending' ? 'Saved on your laptop but not uploaded. Ask your agent to push.' : 'On GitHub but not on your laptop yet. Ask your agent to pull.'}>
                  <span className={`lanebadge ${a.badge.tone}`} tabIndex={0} style={{ position: 'static', transform: 'none' }}>{a.badge.tone === 'pending' ? <CloudArrowUp size={14} /> : <GitMerge size={14} />}{a.badge.text}</span>
                </Tip>
              )}
              {a.prs.map(pr => (
                <a key={pr.number} className="prpill" style={{ position: 'static', transform: 'none' }} href={pr.url} target="_blank" rel="noreferrer">
                  <GitPullRequest size={15} aria-hidden="true" />PR #{pr.number} · {pr.checks === 'pass' ? 'Checks passed' : pr.checks === 'fail' ? 'Checks failed' : pr.checks === 'pending' ? 'Checks running' : 'Open'}
                </a>
              ))}
            </div>
          ))}

          {layout.head && s.status.conflicted > 0 && (
            <Tip tip="Two changes touched the same lines. Git is waiting for your agent to choose which to keep, or to abort the merge.">
              <div className="conflictflag" tabIndex={0} style={{ transform: `translate(${layout.head.x}px, ${layout.head.y + 82}px)` }}>
                <Warning size={15} weight="fill" />Merge conflict in {s.status.conflicted} file{s.status.conflicted > 1 ? 's' : ''}
              </div>
            </Tip>
          )}
          {layout.head && (
            <div className="headring" style={{ transform: `translate(${layout.head.x}px, ${layout.head.y}px)` }} aria-hidden="true"><span>You are here</span></div>
          )}

          {travelers.map(t => <TravelerEl key={t.id} t={t} onDone={() => setTravelers(ts => ts.filter(x => x.id !== t.id))} />)}
        </div>
      )}

      <div className="zoom panel" role="toolbar" aria-label="Map view">
        <Tip tip="Zoom in (Ctrl + scroll)" side="right"><Button variant="ghost" size="icon" onClick={() => zoomAt(1.2)} aria-label="Zoom in"><Plus size={18} weight="bold" /></Button></Tip>
        <Tip tip="Zoom out" side="right"><Button variant="ghost" size="icon" onClick={() => zoomAt(1 / 1.2)} aria-label="Zoom out"><Minus size={18} weight="bold" /></Button></Tip>
        <Tip tip="Show the whole map" side="right"><Button variant="ghost" size="icon" onClick={() => { setFollow(false); setAnim(true); setView(fitView()); }} aria-label="Show everything"><CornersOut size={19} /></Button></Tip>
      </div>
      {!follow && s && (
        <div className="follow">
          <Tip tip="Jump back to the newest snapshots and keep them in view"><Button variant="outline" onClick={() => setFollow(true)}><ArrowLineRight size={17} />Follow latest</Button></Tip>
        </div>
      )}
    </section>
  );
}

function Node({ n, enter, delay, tour }: { n: LNode; enter: boolean; delay: boolean; tour?: boolean }) {
  const style = { ['--c' as string]: n.color, transform: `translate(${n.x}px, ${n.y}px)`, animationDelay: delay ? '.8s' : undefined } as CSSProperties;
  if (n.ghost) {
    return (
      <div className={`node ghost ${enter ? 'enter' : ''}`} style={style} aria-label={n.ghost}>
        <div className="tile"><Plus size={22} /></div>
        <div className="cap"><b>{n.ghost}</b></div>
      </div>
    );
  }
  const c = n.commit!;
  const kind = commitKind(c);
  const Icon = kind.icon;
  const where = n.band === 'local' ? (n.synced ? 'On your laptop and on GitHub' : 'Only on your laptop, not uploaded yet') : (n.synced ? 'On GitHub and your laptop' : 'Only on GitHub, not on your laptop yet');
  const when = new Date(c.time * 1000).toLocaleString();
  const label = `${kind.label}: ${c.subject}. ${short(c.sha)}, by ${c.author}, ${when}. Branch ${n.lane}. ${where}.`;
  const dot = n.band === 'local'
    ? (n.synced ? { cls: 'ok', icon: <CheckFat size={11} weight="fill" /> } : { cls: 'pending', icon: <CloudArrowUp size={12} weight="bold" /> })
    : (n.synced ? { cls: 'ok', icon: <CheckFat size={11} weight="fill" /> } : { cls: 'gh', icon: <GitMerge size={12} weight="bold" /> });
  return (
    <Tip side="bottom" tip={
      <div className="ntip">
        <span className="ntip-kind"><Icon size={14} />{kind.label}</span>
        <b>{c.subject}</b>
        <span className="ntip-meta">{short(c.sha)} · {c.author} · {when}</span>
        <span className={`ntip-where ${dot.cls}`}>{dot.icon}{where}</span>
      </div>
    }>
      <div className={`node ${enter ? 'enter' : ''}`} style={style} tabIndex={0} role="img" aria-label={label}>
        <div className="tile" data-tour={tour ? 'node' : undefined}>
          <Icon size={26} />
          <span className={`st ${dot.cls}`}>{dot.icon}</span>
        </div>
        <div className="cap"><b>{c.subject}</b><span>{short(c.sha)}</span></div>
        {n.tags?.map(t => <span key={t} className="ntag"><Tag size={12} weight="bold" />{t}</span>)}
      </div>
    </Tip>
  );
}

function TravelerEl({ t, onDone }: { t: Traveler; onDone: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current!;
    const a = el.animate(
      [
        { transform: `translate(${t.from.x}px, ${t.from.y + (t.up ? -40 : 40)}px) translate(-50%, -50%) scale(.7)`, opacity: 0 },
        { transform: `translate(${t.from.x}px, ${t.from.y + (t.up ? -44 : 44)}px) translate(-50%, -50%) scale(1)`, opacity: 1, offset: 0.15 },
        { transform: `translate(${t.to.x}px, ${t.to.y + (t.up ? 44 : -44)}px) translate(-50%, -50%) scale(1)`, opacity: 1, offset: 0.85 },
        { transform: `translate(${t.to.x}px, ${t.to.y + (t.up ? 44 : -44)}px) translate(-50%, -50%) scale(.8)`, opacity: 0 }
      ],
      { duration: 1100, easing: 'cubic-bezier(.65,0,.35,1)', fill: 'forwards' }
    );
    a.onfinish = onDone;
    return () => a.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <div ref={ref} className={`traveler ${t.up ? 'up' : ''}`} aria-hidden="true">{t.up ? '↑' : '↓'} {t.label}</div>;
}
