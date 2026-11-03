import { useEffect, useRef, useState } from 'react';
import {
  ArrowArcLeft, ArrowRight, ArrowSquareOut, CaretDown, Check, CloudArrowDown, CloudArrowUp, Copy, EyeSlash, GitPullRequest, GithubLogo,
  Info, NotePencil, ShieldCheck, ShieldWarning, Warning, X
} from '@phosphor-icons/react';
import { suggest } from '../suggest';
import type { Alert, AppState, GitEvent } from '../../../cli/src/types';
import { Chip, Rich, plainText } from './Rich';
import { EVENT_HELP, eventIcon } from '../icons';
import { ago, dismissAlert, restoreAlert } from '../live';
import { Tip } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface Props { state: AppState; now: number; colorOf: (b: string) => string }

/**
 * The right column, as a bento: a fixed top (status, three counts, next step, alerts, GitHub)
 * and the activity feed filling the rest with its own scroll, so the page itself never scrolls.
 */
export function SidePanel({ state, now, colorOf }: Props) {
  const s = state.snapshot;
  const localRefs = s?.refs.filter(r => r.kind === 'local') ?? [];
  const notOnGitHub = localRefs.reduce((n, r) => n + (r.upstream ? r.ahead ?? 0 : 0), 0);
  const onlyOnGitHub = localRefs.reduce((n, r) => n + (r.upstream ? r.behind ?? 0 : 0), 0);
  const noUpstream = s && s.remotes.length ? localRefs.filter(r => !r.upstream).length : 0;

  // animate only events that arrive after the first render
  const seen = useRef<Set<string> | null>(null);
  const first = seen.current === null;
  if (first) seen.current = new Set(state.events.map(e => e.id));

  return (
    <aside className="panel side" aria-label="Overview and activity">
      <div className="side-top">
        <section aria-labelledby="ov-h" className="sec">
          <h2 id="ov-h">Your work</h2>
          <Bento state={state} notOnGitHub={notOnGitHub} onlyOnGitHub={onlyOnGitHub} noUpstream={noUpstream} />
        </section>
        <Attention alerts={state.alerts} dismissed={state.dismissed ?? []} />
        <section className="sec" aria-labelledby="gh-h">
          <h2 id="gh-h">On GitHub</h2>
          <GitHubBlock state={state} colorOf={colorOf} />
        </section>
      </div>

      <section className="side-feed" aria-labelledby="act-h" data-tour="activity">
        <h2 id="act-h">Activity <small>plain English · {state.events.length}</small></h2>
        {state.events.length === 0 ? <p className="muted">Nothing yet. Every git action will be explained here.</p> : (
          <ol className="feed" aria-live="polite">
            {state.events.slice(0, 120).map(e => {
              const isNew = !first && !seen.current!.has(e.id);
              if (isNew) seen.current!.add(e.id);
              return <EventRow key={e.id} e={e} now={now} colorOf={colorOf} enter={isNew} />;
            })}
          </ol>
        )}
      </section>
    </aside>
  );
}

// ---------- your work, as a bento ----------

const FILE_STATE: Record<string, string> = { modified: 'edited', added: 'new', deleted: 'deleted', renamed: 'renamed', untracked: 'new', conflict: 'conflict' };

function Bento({ state, notOnGitHub, onlyOnGitHub, noUpstream }: { state: AppState; notOnGitHub: number; onlyOnGitHub: number; noUpstream: number }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const s = state.snapshot;
  const sug = suggest(state);
  const files = s?.status.files ?? [];
  const unsaved = s ? s.status.staged + s.status.unstaged + s.status.untracked : 0;
  const remote = Boolean(s?.remotes.length);
  const HeadIcon = sug.tone === 'ok' ? ShieldCheck : sug.tone === 'danger' ? ShieldWarning : sug.tone === 'warn' ? Warning : Info;
  return (
    <Collapsible open={open} onOpenChange={setOpen} disabled={!files.length}>
      <div className={`bento ${sug.tone}`} data-tour="work">
        <div className="b-status">
          <span className="ic"><HeadIcon size={20} /></span>
          <p>{sug.headline}</p>
        </div>

        <Tip tip={files.length ? 'Edited files not in a snapshot yet. Click to see them.' : 'Edited files not in a snapshot yet.'}>
          <CollapsibleTrigger className={`b-stat ${unsaved ? 'hot' : ''}`} aria-label={`Unsaved changes: ${unsaved}`}>
            <span className="k"><NotePencil size={15} />Unsaved</span>
            <b>{unsaved}</b>
            {files.length > 0 && <CaretDown size={12} weight="bold" className={`chev ${open ? 'up' : ''}`} aria-hidden="true" />}
          </CollapsibleTrigger>
        </Tip>
        <Tip tip={remote ? `Snapshots on your laptop that GitHub doesn’t have.${noUpstream ? ` ${noUpstream} branch${noUpstream > 1 ? 'es have' : ' has'} never been pushed.` : ''}` : 'This project isn’t on GitHub yet.'}>
          <div className={`b-stat ${notOnGitHub || noUpstream ? 'hot' : ''}`} tabIndex={0}>
            <span className="k"><CloudArrowUp size={15} />Not on GitHub</span>
            <b>{remote ? notOnGitHub : '–'}</b>
            {noUpstream > 0 && <small>+{noUpstream} branch</small>}
          </div>
        </Tip>
        <Tip tip={remote ? 'Snapshots on GitHub your laptop doesn’t have, like a merged pull request.' : 'This project isn’t on GitHub yet.'}>
          <div className={`b-stat ${onlyOnGitHub ? 'gh' : ''}`} tabIndex={0}>
            <span className="k"><CloudArrowDown size={15} />Only on GitHub</span>
            <b>{remote ? onlyOnGitHub : '–'}</b>
          </div>
        </Tip>

        {sug.next && (
          <div className="b-next">
            <div className="next-t"><ArrowRight size={14} weight="bold" aria-hidden="true" /><span><b>Next step.</b> {sug.next}</span></div>
            {sug.prompt && (
              <Tip tip={copied ? 'Copied. Paste it to your agent.' : 'Copy this prompt, then paste it to your agent'}>
                <button type="button" className="ask" onClick={() => navigator.clipboard?.writeText(sug.prompt!).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1600); })} aria-label={`Copy prompt for your agent: ${sug.prompt}`}>
                  <span>“{sug.prompt}”</span>{copied ? <Check size={15} weight="bold" /> : <Copy size={15} />}
                </button>
              </Tip>
            )}
          </div>
        )}
      </div>
      <CollapsibleContent>
        <ul className="files">
          {files.map(f => (
            <li key={f.path}>
              <Tip tip={f.path} side="left"><span tabIndex={0}>{f.path}</span></Tip>
              <em className={f.state}>{FILE_STATE[f.state]}</em>
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ---------- needs attention: compact rows, nothing is ever lost ----------

const rank = { danger: 0, warn: 1, info: 2 } as const;
const alertIcon = (a: Alert) => (a.tone === 'danger' ? ShieldWarning : a.tone === 'warn' ? Warning : Info);

function Attention({ alerts, dismissed }: { alerts: Alert[]; dismissed: Alert[] }) {
  const sorted = [...alerts].sort((a, b) => rank[a.tone] - rank[b.tone] || b.time - a.time);
  // the most serious one starts open; the rest are one line each
  const [openId, setOpenId] = useState<string | null>(null);
  const shownOpen = openId ?? (sorted[0]?.tone === 'danger' ? sorted[0].id : null);
  const [showHidden, setShowHidden] = useState(false);
  const [undo, setUndo] = useState<Alert | null>(null);
  useEffect(() => { if (!undo) return; const t = setTimeout(() => setUndo(null), 7000); return () => clearTimeout(t); }, [undo]);

  if (!sorted.length && !dismissed.length) return null;
  const hide = (a: Alert) => { dismissAlert(a.id); setUndo(a); if (openId === a.id) setOpenId(null); };

  return (
    <section className="sec" aria-labelledby="attn-h" data-tour="attention">
      <h2 id="attn-h">
        <span>Needs attention <small>{sorted.length}</small></span>
        {dismissed.length > 0 && (
          <Tip tip="Alerts you closed. Open to bring one back.">
            <button type="button" className="hidden-btn" onClick={() => setShowHidden(v => !v)} aria-expanded={showHidden}>
              <EyeSlash size={14} />Hidden {dismissed.length}
            </button>
          </Tip>
        )}
      </h2>

      {sorted.length === 0 && !showHidden && <p className="muted">Nothing needs you right now.</p>}

      <div className="arows" aria-live="assertive">
        {sorted.map(a => {
          const AIcon = alertIcon(a);
          const open = shownOpen === a.id;
          return (
            <div key={a.id} className={`arow ${a.tone} ${open ? 'open' : ''}`} role={a.tone === 'danger' ? 'alert' : 'status'}>
              <button type="button" className="arow-head" onClick={() => setOpenId(open ? '' : a.id)} aria-expanded={open}>
                <span className="ic"><AIcon size={16} /></span>
                <span className="t">{a.title}</span>
                <CaretDown size={12} weight="bold" className={`chev ${open ? 'up' : ''}`} aria-hidden="true" />
              </button>
              <Tip tip="Hide. You can bring it back from Hidden.">
                <Button variant="ghost" size="icon" className="x" onClick={() => hide(a)} aria-label={`Hide: ${a.title}`}><X size={14} weight="bold" /></Button>
              </Tip>
              {open && (
                <div className="arow-body">
                  <p>{a.body}</p>
                  {a.fix && <p className="fix">{a.fix}</p>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {showHidden && dismissed.length > 0 && (
        <div className="hiddenlist">
          {dismissed.map(a => {
            const AIcon = alertIcon(a);
            return (
              <div key={a.id} className={`hrow ${a.tone}`}>
                <span className="ic"><AIcon size={14} /></span>
                <span className="t">{a.title}</span>
                <button type="button" onClick={() => restoreAlert(a.id)}><ArrowArcLeft size={13} weight="bold" />Show again</button>
              </div>
            );
          })}
        </div>
      )}

      {undo && (
        <div className="undo" role="status">
          <span>Hidden “{undo.title}”</span>
          <button type="button" onClick={() => { restoreAlert(undo.id); setUndo(null); }}>Undo</button>
        </div>
      )}
    </section>
  );
}

// ---------- activity ----------

function EventRow({ e, now, colorOf, enter }: { e: GitEvent; now: number; colorOf: (b: string) => string; enter: boolean }) {
  const EIcon = eventIcon(e);
  const src = e.via ? { label: e.via.agent, color: 'var(--agent)', tip: `Your agent did this by running a command.` }
    : e.source === 'github' ? { label: 'GitHub', color: 'var(--pr)', tip: 'This happened on github.com, not on your laptop.' }
    : e.source === 'gitflux' ? { label: 'GitFlux', color: 'var(--faint)', tip: 'A note from GitFlux itself.' }
    : { label: 'git', color: 'var(--faint)', tip: 'Seen in git. GitFlux can’t tell which program did it.' };
  const help = EVENT_HELP[e.kind];
  return (
    <li className={`ev ${e.tone} ${enter ? 'enter' : ''}`}>
      {help ? <Tip tip={help} side="left"><span className="ic" tabIndex={0}><EIcon size={19} /></span></Tip> : <span className="ic" aria-hidden="true"><EIcon size={19} /></span>}
      <div>
        <p><span className="sr">{plainText(e.title)}</span><span aria-hidden="true"><Rich text={e.title} colorOf={colorOf} /></span></p>
        <div className="meta">
          <Tip tip={src.tip}><span className="src" tabIndex={0} style={{ ['--w' as string]: src.color }}><i />{src.label}</span></Tip>
          {e.via && <Tip tip={<code>{e.via.command}</code>} className="font-mono"><code tabIndex={0}>{e.via.command}</code></Tip>}
          <Tip tip={new Date(e.time).toLocaleString()}><time tabIndex={0} dateTime={new Date(e.time).toISOString()}>{ago(e.time, now)}</time></Tip>
        </div>
      </div>
    </li>
  );
}

// ---------- GitHub: one compact card ----------

function GitHubBlock({ state, colorOf }: { state: AppState; colorOf: (b: string) => string }) {
  const gh = state.github;
  const s = state.snapshot;
  if (!s?.remotes.length) {
    return <div className="ghcard off"><div className="t"><GithubLogo size={18} />Not connected yet</div><div className="s">Lives only on your laptop. When you or your agent push, it shows up here.</div></div>;
  }
  const open = gh.prs.filter(p => p.state === 'OPEN');
  const recent = gh.prs.filter(p => p.state !== 'OPEN').slice(0, 2);
  const remoteUrl = s.remotes[0].url;
  return (
    <div className="ghcard">
      <div className="t">
        <GithubLogo size={18} aria-hidden="true" />
        {gh.url
          ? <a href={gh.url} target="_blank" rel="noreferrer">{gh.nameWithOwner ?? gh.url}</a>
          : <Tip tip={remoteUrl}><span className="ghname" tabIndex={0}>{remoteUrl.split(/[\\/]/).slice(-2).join('/')}</span></Tip>}
        {gh.visibility && (
          <Tip tip={gh.visibility === 'private' ? 'Only people you invite can see it.' : 'Anyone on the internet can see it.'}>
            <Badge tabIndex={0}>{gh.visibility === 'private' ? 'Private' : gh.visibility === 'public' ? 'Public' : gh.visibility}</Badge>
          </Tip>
        )}
        {gh.url && <ArrowSquareOut size={14} aria-hidden="true" style={{ color: 'var(--faint)' }} />}
      </div>
      {!gh.available && gh.reason && <div className="s">{gh.reason}</div>}
      {[...open, ...recent].map(p => (
        <div key={p.number} className="pr">
          <GitPullRequest size={16} aria-hidden="true" style={{ color: 'var(--pr)' }} />
          <a href={p.url} target="_blank" rel="noreferrer">#{p.number} {p.title}</a>
          {p.state === 'MERGED' ? <Badge variant="pr">Merged</Badge> : p.state === 'CLOSED' ? <Badge>Closed</Badge> : <Badge variant="info">Open</Badge>}
          {p.state === 'OPEN' && p.checks === 'pass' && <Badge variant="ok">Checks passed</Badge>}
          {p.state === 'OPEN' && p.checks === 'fail' && <Badge variant="danger">Checks failed</Badge>}
          <span className="pr-br"><Chip name={p.head} color={colorOf(p.head)} /></span>
        </div>
      ))}
    </div>
  );
}
