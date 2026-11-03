import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import chokidar, { type FSWatcher } from 'chokidar';
import { findRepo, takeSnapshot, fingerprint, changedRemoteRefs, refReflogSubjects } from './snapshot.js';
import { classify, stateAlerts, isSecretPath, plural } from './classify.js';
import { GitHubPoller } from './github.js';
import { hooksInstalled, isGitCommand } from './hooks.js';
import { assess, decide, readGuardMode, userApproved, writeGuardMode } from './guard.js';
import { gitSafe } from './git.js';
import { redact } from './redact.js';
import { AGENT_NAMES } from './types.js';
import type { AgentEntry, AgentId, Alert, AppState, GitEvent, GuardMode, GuardVerdict, Snapshot } from './types.js';

export const VERSION = '0.2.0';
const MAX_EVENTS = 300;
const MAX_AGENT = 200;
const ATTRIBUTE_MS = 6000;
const lower = (s: string) => s[0].toLowerCase() + s.slice(1);
/** `GITFLUX_ALLOW=1 git push …` → `git push …`, to match a re-run with the command it approves. */
const stripAllow = (cmd: string) => cmd.replace(/(^|\s)GITFLUX_ALLOW=1\s+/, '$1').trim();

/** Which event kinds a git/gh command can explain, so attribution never guesses across commands. */
const VERBS: [RegExp, GitEvent['kind'][]][] = [
  [/\bcommit\b/, ['commit', 'amend', 'revert']],
  [/\b(checkout|switch)\b/, ['checkout', 'branch-create']],
  [/\bbranch\b/, ['branch-create', 'branch-delete', 'other']],
  [/\bpush\b|\bgh\s+repo\s+create\b/, ['push', 'push-new', 'force-push', 'remote-delete', 'other']],
  [/\bpull\b/, ['pull', 'fetch', 'merge']],
  [/\bfetch\b/, ['fetch', 'remote-delete']],
  [/\bmerge\b/, ['merge']],
  [/\breset\b/, ['reset']],
  [/\brebase\b/, ['rebase']],
  [/\b(cherry-pick|revert)\b/, ['cherry-pick', 'revert', 'commit']],
  [/\btag\b/, ['tag']],
  [/\binit\b/, ['init']],
  [/\bremote\s+add\b/, ['other']]
];
export const explains = (cmd: string, kind: GitEvent['kind']) => VERBS.some(([re, kinds]) => re.test(cmd) && kinds.includes(kind));

let n = 0;
const uid = (p: string) => `${p}-${Date.now().toString(36)}-${(n++).toString(36)}`;

/**
 * Owns the live state for one folder: watches .git, classifies changes,
 * merges in agent hook reports and GitHub data, and emits 'change'.
 */
export class Engine extends EventEmitter {
  state: AppState;
  private gitDir: string | null = null;
  private snap: Snapshot | null = null;
  private watcher?: FSWatcher;
  private folderWatcher?: FSWatcher;
  private timer?: NodeJS.Timeout;
  private poll?: NodeJS.Timeout;
  private running = false;
  private queued = false;
  private dismissed = new Set<string>();
  private lastCmd: { command: string; time: number } | null = null;
  private github: GitHubPoller;

  /** `agent`: started by an agent plugin, so its hooks are already connected. */
  constructor(private folder: string, private opts: { agent?: AgentId } = {}) {
    super();
    this.state = {
      version: VERSION, repo: null, snapshot: null, events: [], alerts: [], agent: [],
      agentConnected: Boolean(opts.agent), agentName: opts.agent ? AGENT_NAMES[opts.agent] : null, guard: 'ask', dismissed: [], github: { available: false, prs: [] }, updatedAt: Date.now()
    };
    this.github = new GitHubPoller(folder, (info, events) => {
      this.state.github = info;
      for (const e of events) this.addEvent(e);
      this.changed();
    });
  }

  get repoGitDir() { return this.gitDir; }

  /** The folder's own repo. A folder that an enclosing repo ignores (e.g. a scratch dir) is not part of it. */
  private async ownRepo() {
    const repo = await findRepo(this.folder);
    if (repo && path.resolve(repo.root) !== path.resolve(this.folder)) {
      const ignored = await gitSafe(repo.root, ['check-ignore', path.resolve(this.folder)]);
      if (ignored.trim()) return null;
    }
    return repo;
  }

  async start() {
    const repo = await this.ownRepo();
    if (!repo) {
      // Not a repo yet: wait for `git init`.
      this.state.repo = { root: this.folder, name: path.basename(this.folder) };
      this.folderWatcher = chokidar.watch(this.folder, { depth: 0, ignoreInitial: true });
      this.folderWatcher.on('addDir', p => { if (path.basename(p) === '.git') this.attach(true); });
      this.changed();
      return;
    }
    await this.attach(false);
  }

  private async attach(fresh: boolean) {
    const repo = await this.ownRepo();
    if (!repo) return;
    await this.folderWatcher?.close();
    this.folder = repo.root;
    this.gitDir = repo.gitDir;
    this.state.repo = { root: repo.root, name: path.basename(repo.root) };
    this.loadHistory();
    this.snap = await takeSnapshot(repo.root, repo.gitDir);
    this.state.snapshot = this.snap;
    const installed = hooksInstalled(repo.root);
    this.state.agentConnected = Boolean(this.opts.agent) || Boolean(installed);
    if (!this.state.agentName && installed) this.state.agentName = AGENT_NAMES[installed];
    this.state.guard = readGuardMode(repo.gitDir);
    if (fresh) this.addEvent({ id: uid('ev'), time: Date.now(), kind: 'init', tone: 'info', title: 'Git started tracking this folder. Snapshots will appear here as they are saved.', source: 'git' });
    else this.addEvent({ id: uid('ev'), time: Date.now(), kind: 'watch', tone: 'neutral', title: `GitFlux started watching ${this.state.repo.name}.`, source: 'gitflux' });
    this.syncStateAlerts();
    this.watcher = chokidar.watch(repo.gitDir, {
      ignoreInitial: true,
      ignored: (p: string) => /[\\/](objects|gitflux|hooks|lfs|modules)([\\/]|$)/.test(p) || p.endsWith('.lock'),
      depth: 8
    });
    this.watcher.on('all', () => this.schedule());
    this.poll = setInterval(() => this.schedule(), 3000); // working-tree edits don't touch .git
    this.github.setRemote(this.snap.remotes.find(r => r.name === 'origin')?.url ?? '');
    this.github.start();
    this.changed();
  }

  async stop() {
    clearInterval(this.poll); clearTimeout(this.timer);
    this.github.stop();
    await this.watcher?.close(); await this.folderWatcher?.close();
  }

  schedule(ms = 150) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.tick(), ms);
  }

  private async tick() {
    if (!this.gitDir || !this.snap) return;
    if (this.running) { this.queued = true; return; }
    this.running = true;
    try {
      const next = await takeSnapshot(this.folder, this.gitDir);
      if (fingerprint(next) !== fingerprint(this.snap)) {
        const prev = this.snap;
        const remoteReflog = await refReflogSubjects(this.folder, changedRemoteRefs(prev, next));
        const { events, alerts } = classify(prev, next, { remoteReflog });
        this.snap = next;
        this.state.snapshot = next;
        for (const e of events) this.addEvent(e);
        for (const a of alerts) this.addAlert(a);
        await this.checkSecrets(events, next);
        this.syncStateAlerts();
        if (events.some(e => /push|fetch|pull|remote/.test(e.kind))) this.github.refreshSoon();
        const origin = next.remotes.find(r => r.name === 'origin')?.url ?? '';
        this.github.setRemote(origin);
        this.changed();
      }
    } catch (e) {
      // a git command raced with a write; try again shortly
      this.schedule(400);
    } finally {
      this.running = false;
      if (this.queued) { this.queued = false; this.schedule(50); }
    }
  }

  private async checkSecrets(events: GitEvent[], snap: Snapshot) {
    const shas = events.filter(e => ['commit', 'amend', 'merge', 'cherry-pick'].includes(e.kind)).flatMap(e => e.shas ?? []);
    for (const sha of shas) {
      const files = (await gitSafe(this.folder, ['show', '--name-only', '--format=', sha])).split(/\r?\n/).filter(isSecretPath);
      if (!files.length) continue;
      this.addEvent({ id: uid('ev'), time: Date.now(), kind: 'secret', tone: 'danger', title: `Saved ${files.join(', ')} in a snapshot. It may contain passwords or keys.`, shas: [sha], source: 'gitflux' });
      this.addAlert({ id: uid('al'), time: Date.now(), kind: 'event', tone: 'danger', title: 'A secrets file was committed',
        body: `${plural(files.length, 'file')} (${files.join(', ')}) ${files.length === 1 ? 'was' : 'were'} saved in snapshot ${sha.slice(0, 7)}. Anyone who can see the repo can read ${files.length === 1 ? 'it' : 'them'} once pushed.`,
        fix: 'Ask your agent to remove it from the commit and add it to .gitignore. If it was already pushed, change the keys inside it.' });
    }
  }

  // ---------- agent hooks ----------
  /** Handle one agent hook payload (the guard's answer to the agent is given by the hook client itself). */
  async onHook(p: any) {
    const evName = p?.hook_event_name;
    // the hook client says which agent called; payloads without it (the demo, older hooks) are Claude Code
    const agentId: AgentId = p?.gitflux_agent === 'codex' ? 'codex' : 'claude-code';
    const agent = AGENT_NAMES[agentId];
    if (evName === 'SessionStart' || evName === 'UserPromptSubmit' || evName === 'PreToolUse' || evName === 'PostToolUse') this.state.agentName = agent;
    if (evName === 'SessionStart') {
      this.state.agentConnected = true;
      this.changed();
      return;
    }
    if (evName === 'UserPromptSubmit' && p.prompt) {
      this.settleGuard();
      this.addAgent({ id: uid('ag'), time: Date.now(), kind: 'prompt', agent, text: String(p.prompt).slice(0, 2000) });
      this.state.agentConnected = true;
      this.changed();
      return;
    }
    const cmd: string = p?.tool_input?.command ?? '';
    if (!cmd || !isGitCommand(cmd)) return;
    this.state.agentConnected = true;
    if (evName === 'PreToolUse') {
      // the hook client already assessed it; payloads from elsewhere (the demo) are assessed here
      let g: { mode: GuardMode; verdicts: GuardVerdict[]; decision: string; approved?: boolean } | undefined = p.gitflux_guard;
      if (!g) {
        const verdicts = await assess(cmd, p.cwd || this.folder);
        g = { mode: this.state.guard, verdicts, decision: decide(verdicts, this.state.guard, agentId, cmd)?.decision ?? 'allow', approved: userApproved(cmd) && this.state.guard !== 'block' };
      }
      // the approved re-run of a command the guard paused is one event: that entry becomes "You let it run"
      const paused = this.waitingGuard();
      if (g.approved && paused && paused.text === stripAllow(cmd)) {
        paused.guard = 'approved';
        this.state.alerts = this.state.alerts.filter(a => a.id !== 'guard');
        this.changed();
        return;
      }
      this.settleGuard();
      if (g.verdicts.length) this.onGuard(cmd, g.verdicts, g.decision, g.mode, agent, Boolean(g.approved));
      this.changed();
      return;
    }
    if (evName === 'PostToolUse') {
      const waiting = this.waitingGuard();
      if (waiting && (waiting.text === cmd || waiting.text === cmd.replace(/(^|\s)GITFLUX_ALLOW=1\s+/, '$1').trim())) {
        waiting.guard = 'approved';
        this.state.alerts = this.state.alerts.filter(a => a.id !== 'guard');
      }
      const r = p.tool_response ?? {};
      // drop git's Windows line-ending notices: they mean nothing to the person reading the log
      const out = [r.stdout, r.stderr].filter(Boolean).join('\n').split(/\r?\n/)
        .filter((l: string) => !/(LF will be replaced by CRLF|CRLF will be replaced by LF)/.test(l)).join('\n').trim();
      const failed = Boolean(r.interrupted) || /(^|\n)(error|fatal):|\[rejected\]/i.test(out);
      this.addAgent({ id: uid('ag'), time: Date.now(), kind: 'command', agent, text: cmd, output: out.slice(0, 1200), failed });
      this.lastCmd = { command: cmd, time: Date.now() };
      // attribute recent un-attributed git events to this command
      for (const e of this.state.events) {
        if (Date.now() - e.time > ATTRIBUTE_MS) break;
        if (!e.via && e.source === 'git' && explains(cmd, e.kind)) e.via = { agent, command: cmd };
      }
      if (/\[rejected\]/.test(out)) {
        this.addEvent({ id: uid('ev'), time: Date.now(), kind: 'refused', tone: 'warn', title: 'GitHub refused the upload because it has work your laptop doesn’t. This is git protecting you.', source: 'git', via: { agent, command: cmd } });
      }
      if (/\bgh\s/.test(cmd)) this.github.refreshSoon(1500);
      this.schedule(50);
      this.changed();
    }
  }

  private onGuard(cmd: string, verdicts: GuardVerdict[], decision: string, mode: GuardMode, agent: string, approved: boolean) {
    const high = verdicts.filter(v => v.risk === 'high');
    const guard: AgentEntry['guard'] = !high.length ? 'passed' : approved ? 'approved' : decision === 'ask' ? 'waiting'
      : decision === 'deny' ? (mode === 'ask' ? 'held' : 'blocked') : 'unguarded';
    this.addAgent({ id: uid('ag'), time: Date.now(), kind: 'guard', agent, text: cmd, verdicts, guard });
    if (!high.length) return;
    const v = high[0];
    const body = `${cmd}\nThis loses ${v.loses}.${high.length > 1 ? ` (+${high.length - 1} more)` : ''}`;
    this.dismissed.delete('guard');
    if (guard === 'approved') { this.state.alerts = this.state.alerts.filter(a => a.id !== 'guard'); return; }
    if (guard === 'waiting') this.addAlert({ id: 'guard', time: Date.now(), kind: 'event', tone: 'danger', title: `Paused: ${lower(v.title)}`, body, fix: `Your agent is waiting for your OK in ${agent}. ${v.safer ? `Safer: ${v.safer}` : 'Say no unless you are sure.'}` });
    else if (guard === 'held') this.addAlert({ id: 'guard', time: Date.now(), kind: 'event', tone: 'danger', title: `Paused: ${lower(v.title)}`, body, fix: `GitFlux stopped it. ${agent} will ask you in the chat first; it only runs if you say yes. ${v.safer ? `Safer: ${v.safer}` : 'Say no unless you are sure.'}` });
    else if (guard === 'blocked') this.addAlert({ id: 'guard', time: Date.now(), kind: 'event', tone: 'warn', title: `Blocked: ${lower(v.title)}`, body, fix: `GitFlux stopped it and told your agent to use a safer way.${v.safer ? ` ${v.safer}` : ''}` });
    else this.addAlert({ id: 'guard', time: Date.now(), kind: 'event', tone: 'warn', title: `Your agent is running: ${lower(v.title)}`, body, fix: 'The guard is off, so it was not paused. If something disappears, GitFlux will show how to get it back.' });
  }

  private waitingGuard() {
    for (let i = this.state.agent.length - 1; i >= 0; i--) {
      const e = this.state.agent[i];
      if (e.kind === 'guard') return e.guard === 'waiting' || e.guard === 'held' ? e : undefined;
      if (e.kind === 'prompt') return undefined;
    }
  }

  /** A paused command that never ran before the agent moved on was turned down. */
  private settleGuard() {
    const w = this.waitingGuard();
    if (!w) return;
    w.guard = 'declined';
    this.state.alerts = this.state.alerts.filter(a => a.id !== 'guard');
  }

  setGuard(mode: GuardMode) {
    if (!this.gitDir) return;
    writeGuardMode(this.gitDir, mode);
    this.state.guard = mode;
    this.changed();
  }

  /** Hide an alert, but keep it so the person can bring it back. */
  dismiss(id: string) {
    const a = this.state.alerts.find(x => x.id === id);
    this.dismissed.add(id);
    this.state.alerts = this.state.alerts.filter(x => x.id !== id);
    if (a) this.state.dismissed = [a, ...this.state.dismissed.filter(x => x.id !== id)].slice(0, 20);
    this.changed();
  }

  restore(id: string) {
    const a = this.state.dismissed.find(x => x.id === id);
    this.dismissed.delete(id);
    this.state.dismissed = this.state.dismissed.filter(x => x.id !== id);
    if (a && a.kind === 'event') this.addAlert(a);
    this.syncStateAlerts(); // state alerts (detached, diverged…) come back if still true
    this.changed();
  }

  // ---------- store ----------
  private addEvent(e: GitEvent) {
    if (!e.via && e.source === 'git' && this.lastCmd && Date.now() - this.lastCmd.time < ATTRIBUTE_MS && explains(this.lastCmd.command, e.kind)) e.via = { agent: this.state.agentName ?? 'your agent', command: this.lastCmd.command };
    e.title = redact(e.title);
    if (e.via) e.via = { ...e.via, command: redact(e.via.command) };
    this.state.events.unshift(e);
    if (this.state.events.length > MAX_EVENTS) this.state.events.length = MAX_EVENTS;
  }
  private addAlert(a: Alert) {
    if (this.dismissed.has(a.id)) return;
    a = { ...a, title: redact(a.title), body: redact(a.body), fix: redact(a.fix) };
    this.state.alerts = [a, ...this.state.alerts.filter(x => x.id !== a.id)].slice(0, 12);
  }
  private addAgent(a: AgentEntry) {
    a.text = redact(a.text);
    a.output = redact(a.output);
    a.verdicts = a.verdicts?.map(v => ({ ...v, command: redact(v.command), loses: redact(v.loses) }));
    this.state.agent.push(a);
    if (this.state.agent.length > MAX_AGENT) this.state.agent.splice(0, this.state.agent.length - MAX_AGENT);
  }
  private syncStateAlerts() {
    if (!this.snap) return;
    const now = stateAlerts(this.snap).filter(a => !this.dismissed.has(a.id));
    const ids = new Set(now.map(a => a.id));
    const kept = this.state.alerts.filter(a => a.kind === 'event' || ids.has(a.id));
    const existing = new Set(kept.map(a => a.id));
    this.state.alerts = [...now.filter(a => !existing.has(a.id)), ...kept];
  }

  private saveTimer?: NodeJS.Timeout;
  private changed() {
    this.state.updatedAt = Date.now();
    this.emit('change', this.state);
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.saveHistory(), 1000);
  }
  private historyFile() { return this.gitDir ? path.join(this.gitDir, 'gitflux', 'history.json') : null; }
  private loadHistory() {
    const f = this.historyFile();
    if (!f || !existsSync(f)) return;
    try {
      const h = JSON.parse(readFileSync(f, 'utf8'));
      // history saved by older versions may hold unredacted text
      this.state.events = (h.events ?? []).map((e: GitEvent) => ({ ...e, title: redact(e.title), via: e.via && { ...e.via, command: redact(e.via.command) } }));
      this.state.agent = (h.agent ?? []).map((a: AgentEntry) => ({ ...a, text: redact(a.text), output: redact(a.output) }));
    } catch {}
  }
  private saveHistory() {
    const f = this.historyFile();
    if (!f) return;
    try {
      mkdirSync(path.dirname(f), { recursive: true });
      writeFileSync(f, JSON.stringify({ events: this.state.events.slice(0, 150), agent: this.state.agent.slice(-100) }));
    } catch {}
  }
}
