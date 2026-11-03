import { describe, it, expect } from 'vitest';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { assess, decide, hookOutput, splitCommands } from '../src/guard.js';
import { makeRepo, sh } from './helpers.js';

const high = async (cmd: string, cwd: string) => (await assess(cmd, cwd)).filter(v => v.risk === 'high');

/** A repo whose origin/main has one snapshot the laptop doesn't. */
function diverged() {
  const r = makeRepo(true);
  r.commit('first');
  r.git('push', '-q', '-u', 'origin', 'main');
  const other = path.join(r.base, 'other');
  sh(r.base, 'clone', '-q', path.join(r.base, 'origin.git'), other);
  writeFileSync(path.join(other, 'x.txt'), 'x');
  sh(other, 'add', '-A'); sh(other, '-c', 'user.name=T', '-c', 'user.email=t@t.dev', 'commit', '-q', '-m', 'teammate');
  sh(other, 'push', '-q');
  r.git('fetch', '-q');
  r.commit('mine');
  return r;
}

describe('guard', () => {
  it('splits chained shell commands', () => {
    expect(splitCommands('cd app && git push -f origin "main" ; echo ok | cat')).toEqual([['cd', 'app'], ['git', 'push', '-f', 'origin', 'main'], ['echo', 'ok'], ['cat']]);
  });

  it('pauses a force push that would erase work on GitHub, with the count', async () => {
    const r = diverged();
    const [v] = await high('git push --force origin main', r.root);
    expect(v.rule).toBe('force-push');
    expect(v.loses).toContain('1 snapshot');
    expect(decide([v], 'ask')?.decision).toBe('ask');
    expect(decide([v], 'block')?.decision).toBe('deny');
    expect(decide([v], 'off')).toBeNull();
    expect(JSON.parse(hookOutput(decide([v], 'ask')!)).hookSpecificOutput.permissionDecision).toBe('ask');
  });

  it('lets --force-with-lease through when GitHub has nothing extra', async () => {
    const r = makeRepo(true);
    r.commit('a'); r.git('push', '-q', '-u', 'origin', 'main');
    r.commit('b');
    expect(await high('git push --force-with-lease', r.root)).toEqual([]);
    expect(await high('git push -f', r.root)).toHaveLength(1); // plain --force can't be sure
  });

  it('catches +refspec force pushes and remote branch deletes', async () => {
    const r = diverged();
    expect((await high('git push origin +main', r.root))[0]?.rule).toBe('force-push');
    r.git('push', '-q', 'origin', 'main:feature');
    expect(await high('git push origin --delete feature', r.root)).toEqual([]); // its snapshots live on elsewhere
  });

  it('weighs a hard reset by what it really drops', async () => {
    const r = makeRepo();
    r.commit('a'); r.commit('b');
    expect(await high('git reset --hard', r.root)).toEqual([]);
    writeFileSync(path.join(r.root, 'f0.txt'), 'edited');
    expect((await high('git reset --hard', r.root))[0].loses).toContain('1 file');
    r.git('checkout', '-q', '--', '.');
    const [v] = await high('git reset --hard HEAD~1', r.root);
    expect(v.loses).toContain('1 snapshot');
    r.git('branch', 'backup');
    expect(await high('git reset --hard HEAD~1', r.root)).toEqual([]);
  });

  it('only flags force-deleting a branch with unmerged work', async () => {
    const r = makeRepo();
    r.commit('a');
    r.git('branch', 'merged');
    r.git('checkout', '-q', '-b', 'wip'); r.commit('w'); r.git('checkout', '-q', 'main');
    expect(await high('git branch -D merged', r.root)).toEqual([]);
    expect((await high('git branch -D wip', r.root))[0].loses).toContain('1 snapshot');
  });

  it('counts untracked files for git clean and edits for checkout .', async () => {
    const r = makeRepo();
    r.commit('a');
    expect(await high('git clean -fd', r.root)).toEqual([]);
    writeFileSync(path.join(r.root, 'new.txt'), 'n');
    expect((await high('git clean -fd', r.root))[0].rule).toBe('clean');
    expect(await high('git checkout -- .', r.root)).toEqual([]);
    writeFileSync(path.join(r.root, 'f0.txt'), 'edited');
    expect((await high('git checkout -- .', r.root))[0].rule).toBe('discard');
    expect((await high('git restore .', r.root))[0].rule).toBe('discard');
    expect(await high('git restore --staged .', r.root)).toEqual([]);
    expect(await high('git checkout main', r.root)).toEqual([]);
  });

  it('flags a rebase only when it rewrites pushed snapshots', async () => {
    const r = makeRepo(true);
    r.commit('a'); r.git('push', '-q', '-u', 'origin', 'main');
    r.git('checkout', '-q', '-b', 'feat'); r.commit('f1');
    r.git('push', '-q', '-u', 'origin', 'feat');
    r.git('checkout', '-q', 'main'); r.commit('m'); r.git('checkout', '-q', 'feat');
    expect((await high('git rebase main', r.root))[0]?.rule).toBe('rebase');
    r.commit('f2');
    r.git('push', '-q'); r.git('checkout', '-q', '-b', 'local-only', 'main'); r.git('branch', '-q', '--set-upstream-to', 'origin/main');
    r.commit('l1');
    expect(await high('git rebase origin/main', r.root)).toEqual([]);
    expect(await high('git rebase --continue', r.root)).toEqual([]);
  });

  it('always flags deleting the GitHub repo', async () => {
    const r = makeRepo();
    expect((await high('gh repo delete me/app --yes', r.root))[0].rule).toBe('repo-delete');
  });

  it('answers Claude Code from the hook client', () => {
    const r = diverged();
    const cli = path.resolve(__dirname, '../src/cli.ts');
    const payload = JSON.stringify({ hook_event_name: 'PreToolUse', cwd: r.root, tool_name: 'Bash', tool_input: { command: 'git push --force' } });
    const out = execFileSync(process.execPath, ['--import', 'tsx', cli, 'hook'], { input: payload, cwd: path.resolve(__dirname, '..') }).toString();
    expect(JSON.parse(out).hookSpecificOutput).toMatchObject({ hookEventName: 'PreToolUse', permissionDecision: 'ask' });
    const safe = execFileSync(process.execPath, ['--import', 'tsx', cli, 'hook'], { input: payload.replace('push --force', 'status'), cwd: path.resolve(__dirname, '..') }).toString();
    expect(safe).toBe('');
  }, 20000);
});
