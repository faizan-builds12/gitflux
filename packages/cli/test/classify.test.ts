import { describe, it, expect } from 'vitest';
import { makeRepo } from './helpers.js';
import { isSecretPath, stateAlerts } from '../src/classify.js';

const kinds = (r: { events: { kind: string }[] }) => r.events.map(e => e.kind);

describe('classify', () => {
  it('describes the first commit and later commits', async () => {
    const r = makeRepo();
    const a = await r.step(() => r.commit('Scaffold todo app'));
    expect(kinds(a)).toEqual(['commit']);
    expect(a.events[0].title).toContain('first snapshot on [[main]]');
    const b = await r.step(() => r.commit('Add list UI'));
    expect(b.events[0].title).toBe('Saved a snapshot on [[main]]: “Add list UI”.');
  });

  it('merges checkout -b into one branch event', async () => {
    const r = makeRepo();
    r.commit('init');
    const res = await r.step(() => r.git('checkout', '-q', '-b', 'feature/login'));
    expect(kinds(res)).toEqual(['branch-create']);
    expect(res.events[0].title).toContain('[[feature/login]] from [[main]]');
  });

  it('warns about committing straight to main when branches exist', async () => {
    const r = makeRepo();
    r.commit('init');
    r.git('branch', 'feature/x');
    const res = await r.step(() => r.commit('Fix typo in title'));
    expect(res.alerts.map(a => a.title)).toContain('Committed straight to main');
  });

  it('detects a push and a new pushed branch', async () => {
    const r = makeRepo(true);
    r.commit('one'); r.commit('two');
    const first = await r.step(() => r.git('push', '-q', '-u', 'origin', 'main'));
    expect(kinds(first)).toContain('push-new');
    expect(first.events.find(e => e.kind === 'push-new')!.title).toContain('2 snapshots');
    r.commit('three');
    const again = await r.step(() => r.git('push', '-q'));
    expect(again.events.find(e => e.kind === 'push')!.title).toBe('Uploaded 1 snapshot on [[main]] to GitHub.');
  });

  it('flags a force push that erased work on GitHub', async () => {
    const r = makeRepo(true);
    r.commit('one'); r.commit('two');
    r.git('push', '-q', '-u', 'origin', 'main');
    r.git('reset', '-q', '--hard', 'HEAD~1');
    r.commit('different');
    const res = await r.step(() => r.git('push', '-q', '--force', 'origin', 'main'));
    expect(kinds(res)).toContain('force-push');
    expect(res.alerts[0].title).toBe('Force push erased work on GitHub');
    expect(res.alerts[0].body).toContain('“two”');
  });

  it('flags a hard reset that drops commits', async () => {
    const r = makeRepo();
    r.commit('one'); r.commit('two'); r.commit('three');
    const res = await r.step(() => r.git('reset', '-q', '--hard', 'HEAD~2'));
    expect(kinds(res)).toEqual(['reset']);
    expect(res.alerts[0].title).toBe('Reset threw away 2 snapshots');
  });

  it('flags deleting a branch with unmerged work', async () => {
    const r = makeRepo();
    r.commit('base');
    r.git('checkout', '-q', '-b', 'spike');
    r.commit('experiment');
    r.git('checkout', '-q', 'main');
    const res = await r.step(() => r.git('branch', '-q', '-D', 'spike'));
    expect(kinds(res)).toEqual(['branch-delete']);
    expect(res.events[0].tone).toBe('danger');
  });

  it('describes a merge', async () => {
    const r = makeRepo();
    r.commit('base');
    r.git('checkout', '-q', '-b', 'feat');
    r.commit('feature work');
    r.git('checkout', '-q', 'main');
    r.commit('main work');
    const res = await r.step(() => r.git('merge', '-q', '--no-edit', 'feat'));
    expect(kinds(res)).toEqual(['merge']);
  });

  it('reports detached HEAD as a state alert', async () => {
    const r = makeRepo();
    r.commit('one'); r.commit('two');
    r.git('checkout', '-q', 'HEAD~1');
    expect(stateAlerts(await r.snap()).map(a => a.id)).toContain('state:detached');
  });

  it('recognises secret files but not templates', () => {
    expect(isSecretPath('.env')).toBe(true);
    expect(isSecretPath('config/.env.local')).toBe(true);
    expect(isSecretPath('.env.example')).toBe(false);
    expect(isSecretPath('keys/server.pem')).toBe(true);
    expect(isSecretPath('src/env.ts')).toBe(false);
  });
});
