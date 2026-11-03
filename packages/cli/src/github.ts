import { run } from './git.js';
import type { GitEvent, GitHubInfo, PullRequest } from './types.js';

let n = 0;
const uid = () => `gh-${Date.now().toString(36)}-${(n++).toString(36)}`;

/** Polls GitHub through the `gh` CLI. Without gh it reports why, and the map still works from remote-tracking refs. */
export class GitHubPoller {
  info: GitHubInfo = { available: false, reason: 'Checking for the GitHub CLI…', prs: [] };
  private timer?: NodeJS.Timeout;
  private soon?: NodeJS.Timeout;
  private loaded = false;
  private remoteUrl = '';

  constructor(private root: string, private onChange: (info: GitHubInfo, events: GitEvent[]) => void) {}

  setRemote(url: string) {
    if (url === this.remoteUrl) return;
    this.remoteUrl = url;
    const m = /github\.com[:/]([^/]+\/[^/]+?)(\.git)?$/.exec(url);
    if (m) { this.info.nameWithOwner = m[1]; this.info.url = `https://github.com/${m[1]}`; }
    this.refreshSoon(0);
  }

  start() {
    this.refreshSoon(0);
    this.timer = setInterval(() => this.refresh(), 30_000);
  }
  stop() { clearInterval(this.timer); clearTimeout(this.soon); }

  /** debounce: after a push or a gh command, look again shortly */
  refreshSoon(ms = 2500) {
    clearTimeout(this.soon);
    this.soon = setTimeout(() => this.refresh(), ms);
  }

  private async refresh() {
    if (!/github\.com/.test(this.remoteUrl)) {
      this.update({ ...this.info, available: false, reason: this.remoteUrl ? 'This remote is not on GitHub.' : 'Not connected to GitHub yet.', prs: [] }, []);
      return;
    }
    try {
      await run('gh', ['--version'], this.root, 5000);
    } catch {
      this.update({ ...this.info, available: false, reason: 'Install the GitHub CLI (gh) to see pull requests.' }, []);
      return;
    }
    try {
      const repo = JSON.parse(await run('gh', ['repo', 'view', '--json', 'nameWithOwner,url,visibility'], this.root));
      const raw = JSON.parse(await run('gh', ['pr', 'list', '--state', 'all', '--limit', '15', '--json', 'number,title,state,headRefName,baseRefName,url,statusCheckRollup'], this.root));
      const prs: PullRequest[] = raw.map((p: any) => ({
        number: p.number, title: p.title, state: p.state, head: p.headRefName, base: p.baseRefName, url: p.url, checks: checksOf(p.statusCheckRollup)
      }));
      const events = this.loaded ? diffPRs(this.info.prs, prs) : [];
      this.loaded = true;
      this.update({ available: true, nameWithOwner: repo.nameWithOwner, url: repo.url, visibility: String(repo.visibility ?? '').toLowerCase(), prs }, events);
    } catch (e: any) {
      const msg = String(e?.stderr ?? e?.message ?? '');
      this.update({ ...this.info, available: false, reason: /auth|login/i.test(msg) ? 'Sign in with “gh auth login” to see pull requests.' : 'Could not reach GitHub just now.' }, []);
    }
  }

  private update(info: GitHubInfo, events: GitEvent[]) {
    const changed = JSON.stringify(info) !== JSON.stringify(this.info);
    this.info = info;
    if (changed || events.length) this.onChange(info, events);
  }
}

function checksOf(rollup: any[] | undefined): PullRequest['checks'] {
  if (!rollup?.length) return 'none';
  const bad = rollup.some(c => /FAILURE|ERROR|CANCELLED|TIMED_OUT|ACTION_REQUIRED/.test(String(c.conclusion ?? c.state)));
  if (bad) return 'fail';
  const pending = rollup.some(c => (c.status && c.status !== 'COMPLETED') || c.state === 'PENDING');
  return pending ? 'pending' : 'pass';
}

export function diffPRs(before: PullRequest[], after: PullRequest[]): GitEvent[] {
  const out: GitEvent[] = [];
  const old = new Map(before.map(p => [p.number, p] as const));
  const ev = (kind: GitEvent['kind'], tone: GitEvent['tone'], title: string, branch?: string) =>
    out.push({ id: uid(), time: Date.now(), kind, tone, title, branch, source: 'github' });
  for (const p of after) {
    const o = old.get(p.number);
    if (!o) { if (p.state === 'OPEN') ev('pr-open', 'pr', `Opened pull request #${p.number} to merge [[${p.head}]] into [[${p.base}]].`, p.head); continue; }
    if (o.state !== p.state) {
      if (p.state === 'MERGED') ev('pr-merged', 'pr', `Pull request #${p.number} was merged. GitHub’s [[${p.base}]] now includes [[${p.head}]].`, p.base);
      else if (p.state === 'CLOSED') ev('pr-closed', 'neutral', `Pull request #${p.number} was closed without merging.`, p.head);
    }
    if (o.checks !== p.checks) {
      if (p.checks === 'pass') ev('checks-pass', 'ok', `Automated checks on pull request #${p.number} passed.`, p.head);
      if (p.checks === 'fail') ev('checks-fail', 'danger', `Automated checks on pull request #${p.number} failed.`, p.head);
    }
  }
  return out;
}
