import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { takeSnapshot, changedRemoteRefs, refReflogSubjects } from '../src/snapshot.js';
import { classify } from '../src/classify.js';
import type { Snapshot } from '../src/types.js';

export function sh(cwd: string, ...args: string[]) {
  return execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 't@t.dev', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 't@t.dev' } }).toString();
}

export function makeRepo(withRemote = false) {
  const base = mkdtempSync(path.join(tmpdir(), 'gitflux-'));
  const root = path.join(base, 'work');
  mkdirSync(root);
  sh(root, 'init', '-q', '-b', 'main');
  sh(root, 'config', 'user.name', 'Test');
  sh(root, 'config', 'user.email', 't@t.dev');
  sh(root, 'config', 'commit.gpgsign', 'false');
  if (withRemote) {
    const origin = path.join(base, 'origin.git');
    sh(base, 'init', '-q', '--bare', '-b', 'main', origin);
    sh(root, 'remote', 'add', 'origin', origin);
  }
  let n = 0;
  const commit = (msg: string, file = `f${n++}.txt`) => {
    writeFileSync(path.join(root, file), `${msg}\n${n}`);
    sh(root, 'add', '-A');
    sh(root, 'commit', '-q', '-m', msg);
  };
  const snap = async () => {
    const gitDir = sh(root, 'rev-parse', '--absolute-git-dir').trim();
    return takeSnapshot(root, gitDir);
  };
  /** run fn between two snapshots and classify the change */
  const step = async (fn: () => void, prev?: Snapshot) => {
    const a = prev ?? await snap();
    fn();
    const b = await snap();
    const remoteReflog = await refReflogSubjects(root, changedRemoteRefs(a, b));
    return { ...classify(a, b, { remoteReflog }), after: b };
  };
  return { base, root, commit, snap, step, git: (...a: string[]) => sh(root, ...a) };
}
