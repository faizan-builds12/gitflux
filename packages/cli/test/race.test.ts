// A fetch landing between GitFlux's reads of branches and history used to look like someone rewriting GitHub.
import { it, expect } from 'vitest';
import path from 'node:path';
import { classify } from '../src/classify.js';
import { changedRemoteRefs, refReflogSubjects } from '../src/snapshot.js';
import { makeRepo, sh } from './helpers.js';

it('a download caught mid-read is never reported as a rewrite', async () => {
  const r = makeRepo(true);
  r.commit('Scaffold'); r.commit('feat: list');
  r.git('push', '-q', '-u', 'origin', 'main');
  const web = path.join(r.base, 'web');
  sh(r.base, 'clone', '-q', path.join(r.base, 'origin.git'), web);
  sh(web, '-c', 'user.name=T', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'Add login (#1)');
  sh(web, 'push', '-q');

  const before = await r.snap();
  r.git('fetch', '-q');
  const after = await r.snap();
  // the race: branch list read after the fetch, history read before it
  const torn = { ...after, commits: before.commits };

  const reflog = await refReflogSubjects(r.root, changedRemoteRefs(before, torn));
  const good = classify(before, after, { remoteReflog: reflog }).events.map(e => e.title);
  const bad = classify(before, torn, { remoteReflog: reflog }).events.map(e => e.title);
  expect(good.join()).toContain('Downloaded 1 new snapshot');
  expect(bad.join()).not.toContain('rewrote');
  expect(bad.join()).toContain('Downloaded');
});
