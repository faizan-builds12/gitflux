import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Tag, Warning, Signpost, CheckFat, CloudArrowUp, GitMerge, GitPullRequest, IconContext, Plant, Plus, Sparkle, Wrench, HandPalm } from '@phosphor-icons/react';
import { useLive, useNow } from './live';
import { computeLayout } from './layout';
import { TopBar } from './components/TopBar';
import { AgentPanel } from './components/AgentPanel';
import { Canvas } from './components/Canvas';
import { SidePanel } from './components/SidePanel';
import { Tour, tourSeen } from './components/Tour';
import { RuleBook } from './components/RuleBook';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Button } from '@/components/ui/button';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

type Theme = 'light' | 'dark';

export function App() {
  const { state, connected } = useLive();
  const now = useNow();
  const [theme, setTheme] = useState<Theme>(() => (document.documentElement.dataset.theme as Theme) ?? 'light');
  const [legend, setLegend] = useState(false);
  const [helpTab, setHelpTab] = useState<HelpTab>('map');
  const [tour, setTour] = useState(false);
  const laneOrder = useRef<string[]>([]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('gitflux-theme', theme); } catch {}
  }, [theme]);
  useEffect(() => {
    if (state?.repo) document.title = `${state.repo.name} · GitFlux`;
  }, [state?.repo?.name]);

  // first visit: start the tour once there's a map to explain
  const hasMap = Boolean(state?.snapshot);
  useEffect(() => {
    if (!hasMap || tourSeen()) return;
    const t = setTimeout(() => setTour(true), 1200);
    return () => clearTimeout(t);
  }, [hasMap]);

  const layout = useMemo(() => computeLayout(state ?? emptyState, laneOrder.current), [state]);

  return (
    <IconContext.Provider value={{ weight: 'duotone', size: 18 }}>
      <TooltipProvider delayDuration={250} skipDelayDuration={150}>
        <a className="skip" href="#activity">Skip to activity</a>
        <h1 className="sr">GitFlux: live map of {state?.repo?.name ?? 'your repository'}</h1>
        <div className="shell">
          <TopBar state={state} connected={connected} now={now} theme={theme} onTheme={() => setTheme(t => (t === 'dark' ? 'light' : 'dark'))} onLegend={() => setLegend(true)} colorOf={layout.laneColor} />
          <AgentPanel entries={state?.agent ?? []} connected={Boolean(state?.agentConnected)} agentName={state?.agentName ?? null} guard={state?.guard ?? 'ask'} />
          <Canvas layout={layout} state={state} />
          <div id="activity" style={{ display: 'contents' }}>
            {state ? <SidePanel state={state} now={now} colorOf={layout.laneColor} /> : <aside className="panel side" />}
          </div>
        </div>
        <Legend open={legend} onOpenChange={setLegend} tab={helpTab} onTab={setHelpTab} onTour={() => { setLegend(false); setTour(true); }} />
        <Tour open={tour} onClose={() => setTour(false)} />
      </TooltipProvider>
    </IconContext.Provider>
  );
}

type HelpTab = 'map' | 'basics';

/** The ? dialog: how to read the map, the git rule book, and the tour. */
function Legend({ open, onOpenChange, onTour, tab, onTab }: { open: boolean; onOpenChange: (o: boolean) => void; onTour: () => void; tab: HelpTab; onTab: (t: HelpTab) => void }) {
  const rows: [ReactNode, string][] = [
    [<span className="sw" style={{ color: 'var(--ok)' }}><CheckFat size={15} /></span>, 'Green check: the snapshot is on your laptop and on GitHub.'],
    [<span className="sw" style={{ color: 'var(--warn)' }}><CloudArrowUp size={16} /></span>, 'Amber: only on your laptop. Not uploaded yet.'],
    [<span className="sw" style={{ color: 'var(--pr)' }}><GitMerge size={16} /></span>, 'Purple: only on GitHub, like a merged pull request you haven’t pulled. The GitHub band itself is tinted purple too.'],
    [<span className="sw"><Plus size={16} /></span>, 'Dashed tile: a branch with no snapshots of its own yet.'],
    [<span className="sw" style={{ color: 'var(--info)' }}><Tag size={16} /></span>, 'Blue chip under a tile: a version name (tag), like v1.0.'],
    [<span className="sw" style={{ color: 'var(--danger)' }}><Warning size={16} /></span>, 'Red marker under You are here: a merge conflict is waiting for a decision.'],
    [<span className="sw" style={{ color: 'var(--danger)' }}><HandPalm size={16} /></span>, 'Red in the agent panel: GitFlux paused a command that would lose work.']
  ];
  const kinds: [ReactNode, string][] = [
    [<Plant size={16} />, 'First snapshot'], [<Sparkle size={16} />, 'New feature'], [<Wrench size={16} />, 'Fix'], [<GitPullRequest size={16} />, 'Merged pull request']
  ];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="helpdlg">
        <DialogHeader>
          <DialogTitle>{tab === 'map' ? 'How to read the map' : 'Git basics, in plain words'}</DialogTitle>
          <DialogDescription>{tab === 'map' ? 'Top band is your laptop (Local), bottom band is GitHub (Cloud). Each row is a branch, and time flows left to right.' : 'Never used git or GitHub? This is everything you need to follow what your agent does.'}</DialogDescription>
        </DialogHeader>
        <ToggleGroup type="single" value={tab} onValueChange={v => v && onTab(v as HelpTab)} aria-label="Help topics" className="justify-self-start">
          <ToggleGroupItem value="map">Map legend</ToggleGroupItem>
          <ToggleGroupItem value="basics">Git basics</ToggleGroupItem>
        </ToggleGroup>
        <div className="helpbody">
          {tab === 'map' ? (
            <>
              <ul className="legend-list">
                {rows.map(([icon, text], i) => <li key={i}>{icon}{text}</li>)}
              </ul>
              <div style={{ marginTop: 14 }}>
                <p className="legend-sub">Each tile’s icon says what the snapshot was about, read from its message:</p>
                <div className="legend-kinds">{kinds.map(([icon, text]) => <span key={text}>{icon}{text}</span>)}</div>
              </div>
              <p className="legend-sub" style={{ marginTop: 14 }}>Hover anything for details. Drag to move around, Ctrl + scroll to zoom.</p>
            </>
          ) : <RuleBook />}
        </div>
        <Button onClick={onTour} className="justify-self-start"><Signpost size={17} />Take the one-minute tour</Button>
      </DialogContent>
    </Dialog>
  );
}

const emptyState = {
  version: '', repo: null, snapshot: null, events: [], alerts: [], agent: [], agentConnected: false, agentName: null, guard: 'ask' as const, dismissed: [],
  github: { available: false, prs: [] }, updatedAt: 0
};
