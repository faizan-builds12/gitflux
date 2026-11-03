import type { Alert, Commit, GitEvent, Ref, Snapshot, Tone, EventKind } from './types.js';

export interface ClassifyContext {
  /** latest reflog subject for each changed remote-tracking ref, e.g. "update by push" */
  remoteReflog?: Record<string, string>;
  now?: number;
}

export interface Classified {
  events: GitEvent[];
  alerts: Alert[];
}

let seq = 0;
const uid = (p: string) => `${p}-${Date.now().toString(36)}-${(seq++).toString(36)}`;
export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const q = (s: string) => `“${s}”`;
const short = (sha: string) => sha.slice(0, 7);

type Graph = Map<string, Commit>;
const graphOf = (...snaps: Snapshot[]): Graph => {
  const g: Graph = new Map();
  for (const s of snaps) for (const c of s.commits) g.set(c.sha, c);
  return g;
};

export function reachable(g: Graph, starts: (string | null | undefined)[]): Set<string> {
  const seen = new Set<string>();
  const stack = starts.filter(Boolean) as string[];
  while (stack.length) {
    const sha = stack.pop()!;
    if (seen.has(sha)) continue;
    seen.add(sha);
    const c = g.get(sha);
    if (c) for (const p of c.parents) stack.push(p);
  }
  return seen;
}

const allTips = (s: Snapshot) => [...s.refs.map(r => r.sha), s.head.sha];

/** HEAD reflog entries that are new in `next`, oldest first. */
export function newReflogEntries(prev: Snapshot, next: Snapshot) {
  if (!prev.reflog.length) return next.reflog.slice(0, 20).reverse();
  const top = prev.reflog[0];
  const i = next.reflog.findIndex(e => e.sha === top.sha && e.subject === top.subject && e.time === top.time);
  if (i === -1) return next.reflog.slice(0, 20).reverse();
  return next.reflog.slice(0, i).reverse();
}

export function classify(prev: Snapshot, next: Snapshot, ctx: ClassifyContext = {}): Classified {
  const now = ctx.now ?? Date.now();
  const events: GitEvent[] = [];
  const alerts: Alert[] = [];
  const g = graphOf(prev, next);
  const ev = (kind: EventKind, tone: Tone, title: string, extra: Partial<GitEvent> = {}) =>
    events.push({ id: uid('ev'), time: now, kind, tone, title, source: 'git', ...extra });
  const alert = (tone: Alert['tone'], title: string, body: string, fix?: string, id = uid('al')) =>
    alerts.push({ id, time: now, tone, title, body, fix, kind: 'event' });

  const locals = (s: Snapshot) => new Map(s.refs.filter(r => r.kind === 'local').map(r => [r.short, r] as const));
  const remotes = (s: Snapshot) => new Map(s.refs.filter(r => r.kind === 'remote').map(r => [r.name, r] as const));
  const prevLocal = locals(prev), nextLocal = locals(next);
  const prevRemote = remotes(prev), nextRemote = remotes(next);

  const created = new Set([...nextLocal.keys()].filter(b => !prevLocal.has(b)));
  const deleted = [...prevLocal.keys()].filter(b => !nextLocal.has(b));
  const nextReach = reachable(g, allTips(next));

  // ---- 1. walk new HEAD reflog entries in order ----
  let cur = prev.head.branch;
  let headSha = prev.head.sha;
  let warnedMain = false;
  for (const e of newReflogEntries(prev, next)) {
    const s = e.subject;
    let m: RegExpExecArray | null;
    const b = cur ?? 'a detached snapshot';
    if ((m = /^commit \(initial\): (.*)$/.exec(s))) {
      ev('commit', 'neutral', `Saved the first snapshot on [[${b}]]: ${q(m[1])}.`, { branch: cur ?? undefined, shas: [e.sha] });
      if (cur) created.delete(cur); // the first commit is what makes the branch exist
    } else if ((m = /^commit \(amend\): (.*)$/.exec(s))) {
      ev('amend', 'info', `Rewrote the last snapshot on [[${b}]]: ${q(m[1])}.`, { branch: cur ?? undefined, shas: [e.sha] });
      const pl = cur ? prevLocal.get(cur) : undefined;
      const up = pl?.upstream ? prev.refs.find(r => r.kind === 'remote' && r.short === pl.upstream) : undefined;
      if (pl && up && up.sha === headSha) {
        alert('warn', 'Rewrote a snapshot that is already on GitHub',
          `The agent amended ${q(m[1])} after it was uploaded. GitHub still has the old version, so the next normal push will be refused.`,
          'Ask your agent to make a new commit instead of amending pushed work.');
      }
    } else if ((m = /^commit \(merge\): (.*)$/.exec(s))) {
      ev('merge', 'ok', `Merged into [[${b}]]: ${q(m[1])}.`, { branch: cur ?? undefined, shas: [e.sha] });
    } else if ((m = /^commit: (.*)$/.exec(s))) {
      const isRevert = /^Revert /.test(m[1]);
      ev(isRevert ? 'revert' : 'commit', 'neutral', `${isRevert ? 'Undid an earlier change' : 'Saved a snapshot'} on [[${b}]]: ${q(m[1])}.`, { branch: cur ?? undefined, shas: [e.sha] });
      if (cur && cur === next.defaultBranch && nextLocal.size > 1 && !warnedMain) {
        warnedMain = true;
        alert('warn', `Committed straight to ${cur}`,
          `The agent saved ${q(m[1])} directly on ${cur} instead of on a branch. Fine for a tiny fix, but it skips review and can clash with newer work on GitHub.`,
          `Ask your agent to put changes on a branch, then merge through a pull request.`, `direct-commit:${cur}`);
      }
    } else if ((m = /^(cherry-pick|revert): (.*)$/.exec(s))) {
      const kind = m[1] === 'revert' ? 'revert' : 'cherry-pick';
      ev(kind, 'neutral', `${kind === 'revert' ? 'Undid an earlier change' : 'Copied a snapshot'} onto [[${b}]]: ${q(m[2])}.`, { branch: cur ?? undefined, shas: [e.sha] });
    } else if ((m = /^checkout: moving from (.+) to (.+)$/.exec(s))) {
      const [, from, to] = m;
      if (created.has(to)) {
        created.delete(to);
        ev('branch-create', 'info', `Made a new branch [[${to}]] from [[${from}]] and moved you onto it. New work goes there now.`, { branch: to });
        cur = to;
      } else if (nextLocal.has(to) || prevLocal.has(to)) {
        ev('checkout', 'neutral', `Moved you to [[${to}]].`, { branch: to });
        cur = to;
      } else {
        ev('checkout', 'warn', `Moved you to a specific snapshot (${short(e.sha)}), not a branch.`, { shas: [e.sha] });
        cur = null;
      }
    } else if ((m = /^merge (.+?): (.*)$/.exec(s))) {
      ev('merge', 'ok', /Fast-forward/i.test(m[2]) ? `Brought [[${b}]] up to date with [[${m[1]}]].` : `Merged [[${m[1]}]] into [[${b}]].`, { branch: cur ?? undefined, shas: [e.sha] });
    } else if (/^pull\b/.test(s)) {
      ev('pull', 'ok', `Pulled the latest work from GitHub into [[${b}]].`, { branch: cur ?? undefined, shas: [e.sha] });
    } else if ((m = /^reset: moving to (.*)$/.exec(s))) {
      const lost = headSha ? [...reachable(g, [headSha])].filter(x => !nextReach.has(x)) : [];
      if (lost.length) {
        ev('reset', 'danger', `Moved [[${b}]] back. ${plural(lost.length, 'snapshot')} no longer belong to any branch.`, { branch: cur ?? undefined, shas: lost });
        const subj = g.get(lost[0])?.subject;
        alert('danger', `Reset threw away ${plural(lost.length, 'snapshot')}`,
          `The agent moved ${b} backwards${subj ? `, dropping ${q(subj)}` : ''}. Those snapshots are no longer on any branch.`,
          `They can still be recovered for a while. Ask your agent: “git reset --hard ${short(headSha!)}”.`);
      } else {
        ev('reset', 'neutral', `Moved [[${b}]] to ${short(e.sha)}.`, { branch: cur ?? undefined });
      }
    } else if (/^rebase( -i)? \(finish\)/.test(s)) {
      ev('rebase', 'info', `Rebased [[${b}]]: its snapshots were replayed on top of newer work and got new IDs.`, { branch: cur ?? undefined });
    } else if (/^rebase( -i)? \(abort\)/.test(s)) {
      ev('rebase', 'neutral', `Cancelled a rebase on [[${b}]].`, { branch: cur ?? undefined });
    } else if (/^rebase/.test(s)) {
      // start / pick / continue: summarised by the finish entry
    } else if ((m = /^Branch: renamed refs\/heads\/(.+) to refs\/heads\/(.+)$/.exec(s))) {
      created.delete(m[2]);
      const i = deleted.indexOf(m[1]); if (i >= 0) deleted.splice(i, 1);
      ev('other', 'neutral', `Renamed branch [[${m[1]}]] to [[${m[2]}]].`, { branch: m[2] });
      cur = m[2];
    } else {
      ev('other', 'neutral', `Git moved HEAD: ${s}.`);
    }
    headSha = e.sha;
  }

  // ---- 2. local branches created / deleted without a checkout ----
  for (const b of created) {
    const r = nextLocal.get(b)!;
    const from = [...nextLocal.values()].find(o => o.short !== b && o.sha === r.sha);
    ev('branch-create', 'info', from ? `Created branch [[${b}]] from [[${from.short}]].` : `Created branch [[${b}]].`, { branch: b });
  }
  for (const b of deleted) {
    const old = prevLocal.get(b)!;
    const lost = [...reachable(g, [old.sha])].filter(x => !nextReach.has(x));
    if (lost.length) {
      ev('branch-delete', 'danger', `Deleted branch [[${b}]]. ${plural(lost.length, 'snapshot')} on it are not on any other branch.`, { branch: b, shas: lost });
      alert('danger', `Deleted ${b} with unsaved work`,
        `${plural(lost.length, 'snapshot')} existed only on ${b}.`,
        `Recover it: ask your agent to run “git branch ${b} ${short(old.sha)}”.`);
    } else {
      ev('branch-delete', 'neutral', `Deleted branch [[${b}]]. Its work is safe on other branches.`, { branch: b });
    }
  }

  // ---- 3. remote-tracking refs: pushes, fetches, force pushes ----
  for (const [name, r] of nextRemote) {
    const before = prevRemote.get(name);
    const msg = ctx.remoteReflog?.[name] ?? '';
    const local = nextLocal.get(r.branch!);
    const pushLike = /push/.test(msg) || (!/fetch|pull/.test(msg) && local?.sha === r.sha);
    const label = `[[${r.branch}]]`;
    if (!before) {
      if (pushLike) {
        const others = reachable(g, prev.refs.filter(x => x.kind === 'remote').map(x => x.sha));
        const n = [...reachable(g, [r.sha])].filter(x => !others.has(x)).length;
        ev('push-new', 'ok', `Uploaded new branch ${label} to GitHub${n ? ` (${plural(n, 'snapshot')})` : ''}.`, { branch: r.branch });
      } else {
        ev('fetch', 'info', `Downloaded branch ${label} from GitHub.`, { branch: r.branch });
      }
      continue;
    }
    if (before.sha === r.sha) continue;
    const newSet = reachable(g, [r.sha]);
    // a tip missing from the history we read can't be judged; never call that a rewrite
    const ff = newSet.has(before.sha) || !g.has(r.sha);
    const oldSet = reachable(g, [before.sha]);
    if (ff) {
      const n = [...newSet].filter(x => !oldSet.has(x)).length;
      if (pushLike) ev('push', 'ok', `Uploaded ${plural(n, 'snapshot')} on ${label} to GitHub.`, { branch: r.branch });
      else ev('fetch', 'info', `Downloaded ${plural(n, 'new snapshot')} on ${label} from GitHub.`, { branch: r.branch });
    } else {
      const lost = [...oldSet].filter(x => !newSet.has(x));
      if (pushLike) {
        const subj = g.get(before.sha)?.subject;
        ev('force-push', 'danger', `Force push replaced ${label} on GitHub. ${plural(lost.length, 'snapshot')} that ${lost.length === 1 ? 'was there is' : 'were there are'} gone from it.`, { branch: r.branch, shas: lost });
        alert('danger', 'Force push erased work on GitHub',
          `GitHub’s ${r.branch} was overwritten with your laptop’s copy. ${plural(lost.length, 'snapshot')} ${lost.length === 1 ? 'is' : 'are'} no longer on it${subj ? `, including ${q(subj)}` : ''}.`,
          `The old version was ${short(before.sha)}. Ask your agent to merge ${short(before.sha)} back into ${r.branch} and push without --force.`);
      } else {
        ev('fetch', 'warn', `Someone rewrote ${label} on GitHub (force update). ${plural(lost.length, 'snapshot')} you had seen are gone from it.`, { branch: r.branch });
      }
    }
  }
  for (const [name, r] of prevRemote) {
    if (!nextRemote.has(name)) ev('remote-delete', 'neutral', `Branch [[${r.branch}]] was removed from GitHub.`, { branch: r.branch });
  }

  // ---- 4. tags ----
  const prevTags = new Set(prev.refs.filter(r => r.kind === 'tag').map(r => r.short));
  for (const t of next.refs.filter(r => r.kind === 'tag' && !prevTags.has(r.short))) {
    ev('tag', 'info', `Marked snapshot ${short(t.sha)} as version ${t.short}.`, { shas: [t.sha] });
  }

  // ---- 5. a new remote appeared (first connection to GitHub) ----
  const prevRemotes = new Set(prev.remotes.map(r => r.name));
  for (const r of next.remotes.filter(r => !prevRemotes.has(r.name))) {
    ev('other', 'info', `Connected this folder to ${describeRemote(r.url)} as “${r.name}”.`);
  }

  return { events, alerts };
}

export function describeRemote(url: string) {
  const m = /github\.com[:/]([^/]+\/[^/.]+)/.exec(url);
  return m ? `GitHub (${m[1]})` : 'a remote repository';
}

/** Alerts that describe the current state. Stable ids: they appear and clear with the condition. */
export function stateAlerts(s: Snapshot): Alert[] {
  const out: Alert[] = [];
  const t = s.takenAt;
  if (!s.head.branch && s.head.sha) {
    out.push({ id: 'state:detached', kind: 'state', time: t, tone: 'warn', title: 'You are not on a branch',
      body: `The agent checked out snapshot ${short(s.head.sha)} directly. New commits here won’t belong to any branch and are easy to lose.`,
      fix: 'Ask your agent to create a branch here: “git switch -c my-work”.' });
  }
  if (s.status.conflicted) {
    out.push({ id: 'state:conflict', kind: 'state', time: t, tone: 'danger', title: `Merge conflict in ${plural(s.status.conflicted, 'file')}`,
      body: 'Two changes touched the same lines and git needs a decision before it can continue.',
      fix: 'Ask your agent to resolve the conflicts and finish the merge, or abort with “git merge --abort”.' });
  }
  for (const r of s.refs) {
    if (r.kind !== 'local') continue;
    if (r.ahead && r.behind) {
      out.push({ id: `state:diverged:${r.short}`, kind: 'state', time: t, tone: 'warn', title: `Your ${r.short} and GitHub’s have split`,
        body: `Your laptop has ${plural(r.ahead, 'snapshot')} GitHub doesn’t, and GitHub has ${plural(r.behind, 'snapshot')} you don’t. A normal push will be refused.`,
        fix: 'Ask your agent to pull first (merge or rebase), then push. Avoid --force.' });
    }
  }
  return out;
}

/** Files that look like secrets. Example/sample templates are fine. */
export function isSecretPath(p: string) {
  const f = p.split('/').pop() ?? p;
  if (/\.(example|sample|template|dist)$/i.test(f)) return false;
  return /^\.env(\..+)?$/i.test(f) || /^(id_rsa|id_ed25519|id_ecdsa)$/.test(f) || /\.(pem|p12|pfx|key)$/i.test(f)
    || /^(credentials|service-account)\.json$/i.test(f) || f === '.npmrc';
}

export type { Ref };
