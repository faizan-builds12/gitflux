// Shared between the watcher (cli) and the UI. Keep it plain data.

export interface Commit {
  sha: string;
  parents: string[];
  subject: string;
  author: string;
  time: number; // unix seconds
}

export interface Ref {
  name: string;          // full name, e.g. refs/heads/main
  short: string;         // main, origin/main, v1.0
  kind: 'local' | 'remote' | 'tag';
  sha: string;
  remote?: string;       // origin (remote refs only)
  branch?: string;       // main (local + remote refs)
  upstream?: string;     // origin/main (local refs only)
  ahead?: number;
  behind?: number;
  gone?: boolean;        // upstream was deleted
}

export interface ReflogEntry {
  sha: string;
  subject: string;
  time: number;
}

export interface WorkStatus {
  staged: number;
  unstaged: number;
  untracked: number;
  conflicted: number;
  /** changed files not yet in a snapshot (capped) */
  files: { path: string; state: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked' | 'conflict' }[];
}

export interface Snapshot {
  root: string;
  gitDir: string;
  takenAt: number;
  head: { branch: string | null; sha: string | null };
  defaultBranch: string;
  refs: Ref[];
  commits: Commit[];          // newest first, topo order, capped
  reflog: ReflogEntry[];      // HEAD reflog, newest first
  status: WorkStatus;
  worktrees: { path: string; branch: string | null }[];
  remotes: { name: string; url: string }[];
}

export type Tone = 'neutral' | 'ok' | 'info' | 'warn' | 'danger' | 'pr';

export type EventKind =
  | 'watch' | 'init' | 'commit' | 'amend' | 'merge' | 'checkout' | 'branch-create' | 'branch-delete'
  | 'reset' | 'rebase' | 'pull' | 'fetch' | 'push' | 'push-new' | 'force-push' | 'remote-delete'
  | 'tag' | 'cherry-pick' | 'revert' | 'pr-open' | 'pr-merged' | 'pr-closed' | 'checks-pass' | 'checks-fail'
  | 'conflict' | 'secret' | 'refused' | 'other';

export interface Via {
  agent: string;     // "Claude Code"
  command: string;   // the shell command the agent ran
}

export interface GitEvent {
  id: string;
  time: number;      // ms
  kind: EventKind;
  tone: Tone;
  /** Plain-English sentence. Branch names are wrapped like [[main]] so the UI can render chips. */
  title: string;
  detail?: string;
  branch?: string;
  shas?: string[];
  via?: Via;
  source: 'git' | 'github' | 'gitflux';
}

export interface Alert {
  id: string;
  time: number;
  tone: 'warn' | 'danger' | 'info';
  title: string;
  body: string;
  fix?: string;
  /** state alerts disappear when the condition clears; event alerts stay until dismissed */
  kind: 'state' | 'event';
}

export interface PullRequest {
  number: number;
  title: string;
  state: 'OPEN' | 'MERGED' | 'CLOSED';
  head: string;
  base: string;
  url: string;
  checks: 'pending' | 'pass' | 'fail' | 'none';
}

export interface GitHubInfo {
  available: boolean;          // gh installed and signed in
  reason?: string;             // why not
  nameWithOwner?: string;
  url?: string;
  visibility?: string;
  prs: PullRequest[];
}

export type GuardMode = 'ask' | 'block' | 'off';

/** The coding agents GitFlux connects to. Without one, GitFlux still maps every git change. */
export type AgentId = 'claude-code' | 'codex';
export const AGENT_NAMES: Record<AgentId, string> = { 'claude-code': 'Claude Code', codex: 'Codex' };

/** What one git operation would destroy right now, from the risky command guard. */
export interface GuardVerdict {
  command: string;
  rule: 'force-push' | 'reset-hard' | 'branch-delete' | 'clean' | 'discard' | 'rebase' | 'remote-delete' | 'repo-delete' | 'stash-drop' | 'history-rewrite';
  risk: 'high' | 'low';  // low = nothing would be lost, so it runs without a pause
  title: string;          // "Force push to main on GitHub"
  loses: string;          // "2 snapshots on GitHub's main that your laptop doesn't have"
  safer?: string;
}

export interface AgentEntry {
  id: string;
  time: number;
  kind: 'prompt' | 'command' | 'guard';
  agent: string;
  text: string;
  output?: string;
  failed?: boolean;
  /** guard entries: what was found and what happened */
  verdicts?: GuardVerdict[];
  // held: the agent can't show a permission prompt (Codex), so GitFlux stopped it and told it to ask you in the chat
  guard?: 'waiting' | 'held' | 'approved' | 'declined' | 'blocked' | 'passed' | 'unguarded';
}

export interface AppState {
  version: string;
  repo: { root: string; name: string } | null;
  snapshot: Snapshot | null;
  events: GitEvent[];       // newest first
  alerts: Alert[];
  agent: AgentEntry[];      // oldest first
  agentConnected: boolean;  // hooks installed for this repo
  agentName: string | null; // the connected agent's name, e.g. "Codex"; null when you work by hand
  guard: GuardMode;
  dismissed: Alert[];       // alerts the person closed, newest first, so they can bring them back
  github: GitHubInfo;
  updatedAt: number;
}

export type ServerMessage =
  | { type: 'state'; state: AppState }
  | { type: 'patch'; patch: Partial<AppState> };
