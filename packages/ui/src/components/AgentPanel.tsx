import { useEffect, useRef, useState } from 'react';
import { User, CaretUp, CaretDown, ArrowDown, ArrowLineDown, Check, Copy, HandPalm, Prohibit, ShieldCheck, ShieldSlash, ShieldWarning, Terminal, CheckCircle, type Icon } from '@phosphor-icons/react';
import type { AgentEntry, GuardMode } from '../../../cli/src/types';
import { setGuard } from '../live';
import { Tip } from '@/components/ui/tooltip';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

/** `agentName`: the connected agent ("Claude Code", "Codex"); null when you work in git by hand. */
interface Props { entries: AgentEntry[]; connected: boolean; agentName: string | null; guard: GuardMode }

const time = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const guardStates = (agent: string): Record<NonNullable<AgentEntry['guard']>, { icon: Icon; label: string; tone: string; tip: string }> => ({
  waiting: { icon: HandPalm, label: `Paused. Answer in ${agent}`, tone: 'danger', tip: `${agent} is asking you whether to run this. Nothing has changed yet.` },
  held: { icon: HandPalm, label: `Paused. ${agent} will ask you first`, tone: 'danger', tip: `GitFlux stopped this and told ${agent} to ask you in the chat. It only runs if you say yes. Nothing has changed yet.` },
  approved: { icon: ShieldWarning, label: 'You let it run', tone: 'warn', tip: 'You said yes, so it ran.' },
  declined: { icon: ShieldCheck, label: 'Stopped. Nothing changed', tone: 'ok', tip: 'You said no, or the agent moved on, so the command never ran.' },
  blocked: { icon: Prohibit, label: 'Blocked by GitFlux', tone: 'ok', tip: 'The guard is set to Block, so the command was refused and your agent was told a safer way.' },
  passed: { icon: CheckCircle, label: 'Checked: nothing would be lost', tone: 'quiet', tip: 'This kind of command can lose work, but GitFlux checked and nothing would be lost here, so it ran without a pause.' },
  unguarded: { icon: ShieldSlash, label: 'Guard is off, so it ran', tone: 'warn', tip: 'The guard is Off. Turn it to Ask to be asked first next time.' }
});

const MODES: { mode: GuardMode; label: string; hint: string }[] = [
  { mode: 'ask', label: 'Ask', hint: 'Commands that would lose work wait for your OK.' },
  { mode: 'block', label: 'Block', hint: 'Commands that would lose work are refused; your agent is told a safer way.' },
  { mode: 'off', label: 'Off', hint: 'Nothing is paused. GitFlux still shows what happened.' }
];

export function AgentPanel({ entries, connected, agentName, guard }: Props) {
  const agent = agentName ?? 'your agent';
  const list = useRef<HTMLOListElement>(null);
  const stick = useRef(true);
  const [atBottom, setAtBottom] = useState(true);
  const [unseen, setUnseen] = useState(0);
  const [current, setCurrent] = useState(0); // which of your prompts is at the top of the view
  const prompts = entries.filter(e => e.kind === 'prompt').length;
  const seenCount = useRef(entries.length);

  const onScroll = () => {
    const el = list.current;
    if (!el) return;
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    stick.current = bottom; setAtBottom(bottom);
    if (bottom) setUnseen(0);
    const mine = [...el.querySelectorAll<HTMLElement>('li.you')];
    // at the bottom you're on your latest prompt; otherwise the last one scrolled past
    setCurrent(bottom ? mine.length : mine.filter(p => p.offsetTop <= el.scrollTop + 24).length);
  };

  useEffect(() => {
    const el = list.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
    else setUnseen(n => n + Math.max(0, entries.length - seenCount.current));
    seenCount.current = entries.length;
    onScroll();
  }, [entries.length]);

  // jumps are instant (smooth scrolling stalls in background tabs); a short highlight shows where you landed
  const flash = (li?: HTMLElement) => { if (!li) return; li.classList.remove('flash'); void li.offsetWidth; li.classList.add('flash'); };
  const toLatest = () => { const el = list.current; if (!el) return; el.scrollTop = el.scrollHeight; onScroll(); };
  /** jump to your previous (-1) or next (+1) prompt from where you are */
  const jump = (dir: -1 | 1) => {
    const el = list.current; if (!el) return;
    const mine = [...el.querySelectorAll<HTMLElement>('li.you')];
    const y = el.scrollTop;
    const target = dir < 0 ? mine.filter(p => p.offsetTop < y - 8).pop() ?? mine[0] : mine.find(p => p.offsetTop > y + 8);
    if (target) { el.scrollTop = target.offsetTop - 6; onScroll(); flash(target); }
    else if (dir > 0) toLatest();
  };

  return (
    <aside className="panel agent" aria-labelledby="agent-h" data-tour="agent">
      <header>
        <div>
          <h2 id="agent-h">Your coding agent</h2>
          <small>Prompts and the git commands it ran</small>
        </div>
        <Tip tip={connected ? `GitFlux sees your prompts and every git command ${agent} runs.` : 'No agent connected. GitFlux still maps every git change you make, from any terminal or app.'}>
          <span className={`badge ${connected ? 'on' : ''}`} tabIndex={0}><i />{connected ? agentName ?? 'Agent' : 'No agent'}</span>
        </Tip>
      </header>

      {entries.length === 0 ? (
        connected ? <div className="connect"><h3>Waiting for your first prompt</h3><p>Ask your agent to do something with git. Each prompt and git command shows up here.</p></div> : <ConnectHelp />
      ) : (
        <>
          {prompts > 0 && (
            <div className="lognav" role="toolbar" aria-label="Jump between your prompts" data-tour="prompts">
              <span className="lognav-label"><User size={14} weight="fill" />Your prompts <b>{Math.max(1, current)}/{prompts}</b></span>
              <Tip tip="Your previous prompt"><button type="button" onClick={() => jump(-1)} aria-label="Previous prompt"><CaretUp size={14} weight="bold" /></button></Tip>
              <Tip tip="Your next prompt"><button type="button" onClick={() => jump(1)} aria-label="Next prompt"><CaretDown size={14} weight="bold" /></button></Tip>
              <Tip tip="Jump to the latest message"><button type="button" onClick={toLatest} aria-label="Latest message" className="wide"><ArrowLineDown size={14} weight="bold" />Latest</button></Tip>
            </div>
          )}
          <div className="logwrap">
            <ol className="log" ref={list} aria-live="polite" onScroll={onScroll}>
              {entries.map(e => <Entry key={e.id} e={e} agent={e.agent || agent} />)}
            </ol>
            {!atBottom && (
              <button type="button" className="tolatest" onClick={toLatest}>
                <ArrowDown size={14} weight="bold" />{unseen > 0 ? `${unseen} new` : 'Latest'}
              </button>
            )}
          </div>
        </>
      )}

      {connected && <GuardSwitch mode={guard} />}
    </aside>
  );
}

function Entry({ e, agent }: { e: AgentEntry; agent: string }) {
  if (e.kind === 'prompt') {
    return (
      <li className="you">
        <div className="you-card">
          <span className="who"><User size={13} weight="fill" />You<time>{time(e.time)}</time></span>
          <div className="prompt">{e.text}</div>
        </div>
      </li>
    );
  }
  if (e.kind === 'guard') return <GuardEntry e={e} agent={agent} />;
  return (
    <li>
      <Tip tip={new Date(e.time).toLocaleString()} side="left"><time tabIndex={-1}>{time(e.time)}</time></Tip>
      <div className="cmd"><Terminal size={14} className="tool-ic" aria-hidden="true" /><span className="tool">Bash</span><code>{e.text}</code></div>
      {e.output && <div className={`out ${e.failed ? 'bad' : ''}`}>{e.output}</div>}
    </li>
  );
}

function GuardEntry({ e, agent }: { e: AgentEntry; agent: string }) {
  const states = guardStates(agent);
  const g = states[e.guard ?? 'unguarded'] ?? states.unguarded;
  const GIcon = g.icon;
  const high = (e.verdicts ?? []).filter(v => v.risk === 'high');
  return (
    <li className={`gentry ${g.tone}`}>
      <time>{time(e.time)}</time>
      <Tip tip={g.tip} side="right">
        <div className="gstate" tabIndex={0}><GIcon size={16} aria-hidden="true" /><span>{g.label}</span></div>
      </Tip>
      <div className="cmd"><code>{e.text}</code></div>
      {high.map((v, i) => (
        <div className="gwhy" key={i}>
          <p><b>{v.title}.</b> Loses {v.loses}.</p>
          {v.safer && e.guard !== 'approved' && <p className="safer">Safer: {v.safer}</p>}
        </div>
      ))}
    </li>
  );
}

function GuardSwitch({ mode }: { mode: GuardMode }) {
  const [pending, setPending] = useState<GuardMode | null>(null);
  const shown = pending ?? mode;
  useEffect(() => setPending(null), [mode]);
  const hint = MODES.find(m => m.mode === shown)?.hint;
  return (
    <footer className="guardbar" data-tour="guard">
      <div className="guardbar-row">
        <Tip tip="Before your agent runs a git command that could destroy work, GitFlux checks what it would actually lose and stops it in time." side="top" align="start">
          <span className="guardbar-label" tabIndex={0}>{shown === 'off' ? <ShieldSlash size={17} aria-hidden="true" /> : <ShieldCheck size={17} aria-hidden="true" />}Guard</span>
        </Tip>
        <ToggleGroup type="single" value={shown} aria-label="Risky command guard" className="term-toggle"
          onValueChange={v => { if (!v) return; setPending(v as GuardMode); setGuard(v as GuardMode); }}>
          {MODES.map(m => (
            <Tip key={m.mode} tip={m.hint} side="top">
              <ToggleGroupItem value={m.mode} aria-label={`${m.label}: ${m.hint}`}>{m.label}</ToggleGroupItem>
            </Tip>
          ))}
        </ToggleGroup>
      </div>
      <p>{hint}</p>
    </footer>
  );
}

/** Shown when no agent is connected: working by hand is fully supported; agents are an add-on. */
function ConnectHelp() {
  return (
    <div className="connect">
      <h3>Working by hand? You’re all set</h3>
      <p>GitFlux maps every git change you make, from any terminal, VS Code, GitHub Desktop or anything else. Nothing to connect.</p>
      <h3 style={{ marginTop: 20 }}>Using a coding agent?</h3>
      <p>Add the plugin to also see your prompts and every command it runs, and to stop commands that would lose work.</p>
      <CopyLine label="Claude Code" cmd="claude plugin install gitflux@gitflux" />
      <CopyLine label="Codex" cmd="codex plugin add gitflux@gitflux" />
      <p style={{ marginTop: 12 }}>Then start a new session. GitFlux opens by itself.</p>
    </div>
  );
}

function CopyLine({ label, cmd }: { label: string; cmd: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="copyline">
      <span className="copyline-label">{label}</span>
      <Tip tip={copied ? 'Copied' : 'Copy to clipboard'}>
        <button className="copy" type="button" onClick={() => { navigator.clipboard?.writeText(cmd).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1600); }).catch(() => {}); }} aria-label={`Copy command for ${label}: ${cmd}`}>
          <span>{cmd}</span>{copied ? <Check size={16} weight="bold" /> : <Copy size={16} />}
        </button>
      </Tip>
    </div>
  );
}
