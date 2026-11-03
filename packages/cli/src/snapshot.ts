import path from 'node:path';
import { git, gitSafe } from './git.js';
import { redact } from './redact.js';
import type { Commit, ReflogEntry, Ref, Snapshot, WorkStatus } from './types.js';

const US = '\x1f';
const RS = '\x1e';
export const COMMIT_LIMIT = 300;

export async function findRepo(cwd: string): Promise<{ root: string; gitDir: string } | null> {
  try {
    const out = await git(cwd, ['rev-parse', '--show-toplevel', '--absolute-git-dir']);
    const [root, gitDir] = out.trim().split(/\r?\n/);
    return { root: path.resolve(root), gitDir: path.resolve(gitDir) };
  } catch {
    return null;
  }
}

export async function takeSnapshot(root: string, gitDir: string): Promise<Snapshot> {
  const [headRef, headSha, refsOut, reflogOut, statusOut, wtOut, remoteOut, originHead] = await Promise.all([
    gitSafe(root, ['symbolic-ref', '-q', '--short', 'HEAD']),
    gitSafe(root, ['rev-parse', '-q', '--verify', 'HEAD']),
    gitSafe(root, ['for-each-ref', `--format=%(refname)${US}%(objectname)${US}%(upstream:short)${US}%(upstream:track,nobracket)`, 'refs/heads', 'refs/remotes', 'refs/tags']),
    gitSafe(root, ['log', '-g', '-n40', '--date=unix', `--format=%H${US}%gs${US}%gd${RS}`, 'HEAD']),
    gitSafe(root, ['status', '--porcelain=v2']),
    gitSafe(root, ['worktree', 'list', '--porcelain']),
    gitSafe(root, ['remote', '-v']),
    gitSafe(root, ['symbolic-ref', '-q', '--short', 'refs/remotes/origin/HEAD'])
  ]);
  // History is read after the branch list, never alongside it: a fetch landing between the two
  // would leave a branch pointing at a commit missing from the history, which looks like a rewrite.
  const logOut = await gitSafe(root, ['log', '--all', '--topo-order', `-n${COMMIT_LIMIT}`, `--format=%H${US}%P${US}%s${US}%an${US}%ct${RS}`]);

  const refs = parseRefs(refsOut);
  const branch = headRef.trim() || null;
  return {
    root,
    gitDir,
    takenAt: Date.now(),
    head: { branch, sha: headSha.trim() || null },
    defaultBranch: pickDefault(originHead.trim(), refs, branch),
    refs,
    commits: parseCommits(logOut),
    reflog: parseReflog(reflogOut),
    status: parseStatus(statusOut),
    worktrees: parseWorktrees(wtOut),
    remotes: parseRemotes(remoteOut)
  };
}

export function parseRefs(out: string): Ref[] {
  const refs: Ref[] = [];
  for (const line of out.split(/\r?\n/)) {
    if (!line) continue;
    const [name, sha, upstream, track] = line.split(US);
    if (name.startsWith('refs/heads/')) {
      const short = name.slice(11);
      const ahead = /ahead (\d+)/.exec(track ?? '');
      const behind = /behind (\d+)/.exec(track ?? '');
      refs.push({
        name, short, kind: 'local', sha, branch: short,
        upstream: upstream || undefined,
        ahead: ahead ? +ahead[1] : 0,
        behind: behind ? +behind[1] : 0,
        gone: track === 'gone' || undefined
      });
    } else if (name.startsWith('refs/remotes/')) {
      const short = name.slice(13);
      if (short.endsWith('/HEAD')) continue;
      const slash = short.indexOf('/');
      refs.push({ name, short, kind: 'remote', sha, remote: short.slice(0, slash), branch: short.slice(slash + 1) });
    } else if (name.startsWith('refs/tags/')) {
      refs.push({ name, short: name.slice(10), kind: 'tag', sha });
    }
  }
  return refs;
}

export function parseCommits(out: string): Commit[] {
  return out.split(RS).map(s => s.replace(/^\r?\n/, '')).filter(Boolean).map(rec => {
    const [sha, parents, subject, author, time] = rec.split(US);
    return { sha, parents: parents ? parents.split(' ') : [], subject: redact(subject), author, time: +time };
  });
}

export function parseReflog(out: string): ReflogEntry[] {
  return out.split(RS).map(s => s.replace(/^\r?\n/, '')).filter(Boolean).map(rec => {
    const [sha, subject, sel] = rec.split(US);
    const t = /\{(\d+)\}/.exec(sel ?? '');
    return { sha, subject: redact(subject), time: t ? +t[1] : 0 };
  });
}

export function parseStatus(out: string): WorkStatus {
  const s: WorkStatus = { staged: 0, unstaged: 0, untracked: 0, conflicted: 0, files: [] };
  const add = (path: string, state: WorkStatus['files'][number]['state']) => { if (s.files.length < 40) s.files.push({ path, state }); };
  for (const line of out.split(/\r?\n/)) {
    const f = line.split(' ');
    if (line.startsWith('? ')) { s.untracked++; add(line.slice(2), 'untracked'); }
    else if (line.startsWith('u ')) { s.conflicted++; add(f.slice(10).join(' '), 'conflict'); }
    else if (line.startsWith('1 ') || line.startsWith('2 ')) {
      const xy = line.slice(2, 4);
      if (xy[0] !== '.') s.staged++;
      if (xy[1] !== '.') s.unstaged++;
      const renamed = line[0] === '2';
      const path = renamed ? f.slice(9).join(' ').split('\t')[0] : f.slice(8).join(' ');
      add(path, renamed ? 'renamed' : xy.includes('D') ? 'deleted' : xy.includes('A') ? 'added' : 'modified');
    }
  }
  return s;
}

function parseWorktrees(out: string) {
  const list: { path: string; branch: string | null }[] = [];
  let cur: { path: string; branch: string | null } | null = null;
  for (const line of out.split(/\r?\n/)) {
    if (line.startsWith('worktree ')) { cur = { path: line.slice(9), branch: null }; list.push(cur); }
    else if (line.startsWith('branch ') && cur) cur.branch = line.slice(7).replace('refs/heads/', '');
  }
  return list;
}

function parseRemotes(out: string) {
  const seen = new Map<string, string>();
  for (const line of out.split(/\r?\n/)) {
    const m = /^(\S+)\s+(\S+)\s+\(fetch\)/.exec(line);
    if (m) seen.set(m[1], m[2]);
  }
  return [...seen].map(([name, url]) => ({ name, url: redact(url) }));
}

function pickDefault(originHead: string, refs: Ref[], current: string | null) {
  if (originHead) return originHead.replace(/^origin\//, '');
  const locals = new Set(refs.filter(r => r.kind === 'local').map(r => r.short));
  for (const b of ['main', 'master', 'trunk', 'develop']) if (locals.has(b)) return b;
  return current ?? 'main';
}

/** Cheap fingerprint so we only diff when something git-visible changed. */
export function fingerprint(s: Snapshot): string {
  return JSON.stringify([s.head, s.refs.map(r => r.name + r.sha + (r.ahead ?? '') + (r.behind ?? '')), s.reflog[0], s.status, s.worktrees.length, s.remotes]);
}

/** Remote-tracking refs that changed between two snapshots. */
export function changedRemoteRefs(prev: Snapshot, next: Snapshot): string[] {
  const before = new Map(prev.refs.filter(r => r.kind === 'remote').map(r => [r.name, r.sha] as const));
  return next.refs.filter(r => r.kind === 'remote' && before.get(r.name) !== r.sha).map(r => r.name);
}

/** Latest reflog message per ref ("update by push", "fetch: fast-forward", ...). */
export async function refReflogSubjects(root: string, names: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  await Promise.all(names.map(async n => { out[n] = (await gitSafe(root, ['log', '-g', '-n1', '--format=%gs', n])).trim(); }));
  return out;
}
