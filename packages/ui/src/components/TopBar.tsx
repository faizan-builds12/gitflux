import { FolderSimple, Moon, Question, Sun } from '@phosphor-icons/react';
import type { AppState } from '../../../cli/src/types';
import { Chip } from './Rich';
import { Logo } from './Logo';
import { ago } from '../live';
import { Button } from '@/components/ui/button';
import { Tip } from '@/components/ui/tooltip';

interface Props {
  state: AppState | null;
  connected: boolean;
  now: number;
  theme: 'light' | 'dark';
  onTheme: () => void;
  onLegend: () => void;
  colorOf: (b: string) => string;
}

export function TopBar({ state, connected, now, theme, onTheme, onLegend, colorOf }: Props) {
  const snap = state?.snapshot;
  const st = snap?.status;
  const unsaved = st ? st.staged + st.unstaged + st.untracked : 0;
  return (
    <header className="topbar">
      <div className="cluster panel">
        <Logo size={34} className="logo" />
        <span className="brand">Git<span className="flux">Flux</span></span>
        <span className="sep" />
        <Tip tip={state?.repo ? <>Watching this folder:<br /><code>{state.repo.root}</code></> : 'Waiting for the GitFlux server'}>
          <span className="repo" tabIndex={0}>
            <FolderSimple size={19} aria-hidden="true" />
            <b>{state?.repo?.name ?? 'Connecting…'}</b>
          </span>
        </Tip>
      </div>

      <div className="cluster panel grow" role="status" aria-live="polite" data-tour="status">
        <div className="status">
          <Tip tip={connected ? 'Live: every git change shows up here within a second.' : 'Lost contact with GitFlux. Trying again…'}>
            <span className={`live ${connected ? '' : 'off'}`} tabIndex={0}><i />{connected ? 'Watching' : 'Reconnecting'}</span>
          </Tip>
          <span className="sep" />
          {snap ? (
            snap.head.branch
              ? <Tip tip="The branch your files come from right now. New snapshots are added to it."><span tabIndex={0}>You are on <Chip name={snap.head.branch} color={colorOf(snap.head.branch)} /></span></Tip>
              : snap.head.sha ? <Tip tip="Detached: new snapshots here belong to no branch and are easy to lose."><span className="pending" tabIndex={0}>Not on a branch</span></Tip> : null
          ) : <span>{state?.repo ? 'Waiting for git init' : 'Starting'}</span>}
          {unsaved > 0 && <><span className="sep" /><Tip tip="Edited files that are not in a snapshot yet. Ask your agent to commit them."><span className="pending" tabIndex={0}>{unsaved} unsaved {unsaved === 1 ? 'change' : 'changes'}</span></Tip></>}
          {state && <><span className="sep" /><Tip tip={new Date(state.updatedAt).toLocaleString()}><span tabIndex={0}>Updated {ago(state.updatedAt, now)}</span></Tip></>}
        </div>
      </div>

      <div className="cluster panel">
        <Tip tip="Help: how to read the map, and the tour">
          <Button variant="ghost" size="icon" onClick={onLegend} aria-label="Help: how to read the map, and the tour" data-tour="help"><Question size={20} /></Button>
        </Tip>
        <Tip tip={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
          <Button variant="ghost" size="icon" onClick={onTheme} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
            {theme === 'dark' ? <Moon size={20} /> : <Sun size={20} />}
          </Button>
        </Tip>
      </div>
    </header>
  );
}
