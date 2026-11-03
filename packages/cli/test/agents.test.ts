import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { assess, decide, userApproved } from '../src/guard.js';
import { agentOf, hooksInstalled, installHooks } from '../src/hooks.js';
import { Engine } from '../src/engine.js';
import { makeRepo, sh } from './helpers.js';

process.env.GITFLUX_NO_OPEN = '1';

/** origin/main has a snapshot the laptop doesn't: a force push would erase it. */
function diverged() {
  const r = makeRepo(true);
  r.commit('first');
  r.git('push', '-q', '-u', 'origin', 'main');
  const other = path.join(r.base, 'other');
  sh(r.base, 'clone', '-q', path.join(r.base, 'origin.git'), other);
  sh(other, '-c', 'user.name=T', '-c', 'user.email=t@t.dev', 'commit', '-q', '--allow-empty', '-m', 'teammate');
  sh(other, 'push', '-q');
  r.git('fetch', '-q');
  return r;
}

const CLI = path.resolve(__dirname, '../src/cli.ts');
/** Run the real hook client the way an agent does: payload on stdin, decision on stdout. */
const runHook = (payload: object, agent?: string) => {
  const args = ['--import', 'tsx', CLI, 'hook', ...(agent ? ['--agent', agent] : [])];
  const out = execFileSync(process.execPath, args, { input: JSON.stringify(payload), cwd: path.resolve(__dirname, '..'), env: { ...process.env, GITFLUX_NO_OPEN: '1' } }).toString();
  return out ? JSON.parse(out).hookSpecificOutput : null;
};

describe('guard decisions per agent', async () => {
  const r = diverged();
  const v = await assess('git push --force', r.root);

  it('Claude Code gets a real permission question', () => {
    expect(decide(v, 'ask', 'claude-code', 'git push --force')?.decision).toBe('ask');
  });

  it('Codex can’t ask, so the command is stopped and Codex is told to ask in the chat', () => {
    const d = decide(v, 'ask', 'codex', 'git push --force');
    expect(d?.decision).toBe('deny');
    expect(d?.reason).toContain('ask whether to go ahead');
    expect(d?.reason).toContain('GITFLUX_ALLOW=1 git push --force');
  });

  it('a yes in the chat (GITFLUX_ALLOW=1) lets it through in Ask mode, never in Block mode', () => {
    expect(userApproved('GITFLUX_ALLOW=1 git push --force')).toBe(true);
    expect(userApproved('git push --force')).toBe(false);
    expect(decide(v, 'ask', 'codex', 'GITFLUX_ALLOW=1 git push --force')).toBeNull();
    expect(decide(v, 'block', 'codex', 'GITFLUX_ALLOW=1 git push --force')?.decision).toBe('deny');
    expect(decide(v, 'off', 'codex', 'git push --force')).toBeNull();
  });

  it('the risk itself is still found inside the approved command', async () => {
    expect((await assess('GITFLUX_ALLOW=1 git push --force', r.root)).filter(x => x.risk === 'high')).toHaveLength(1);
  });
});

describe('finding the server from any spelling of the folder', () => {
  it('a server registered by git’s path is found from the agent’s path (Windows short names, subfolders)', async () => {
    const { writeRegistry, findServer, clearRegistry } = await import('../src/launcher.js');
    const { realpathSync, mkdirSync } = await import('node:fs');
    const r = makeRepo();
    const long = realpathSync.native(r.root);      // what git reports
    writeRegistry([long], { port: 1, pid: process.pid, root: long });
    mkdirSync(path.join(r.root, 'src'), { recursive: true });
    expect(findServer(r.root)?.root).toBe(long);   // r.root comes from os.tmpdir(), a short name on some Windows setups
    expect(findServer(path.join(r.root, 'src'))?.root).toBe(long);
    clearRegistry([long], process.pid);
  });
});

describe('which agent is calling', () => {
  it('reads --agent, then falls back to the payload', () => {
    expect(agentOf(['hook', '--agent', 'codex'], {})).toBe('codex');
    expect(agentOf(['hook'], { transcript_path: 'C:\\Users\\me\\.codex\\sessions\\x.jsonl' })).toBe('codex');
    expect(agentOf(['hook'], { transcript_path: '/home/me/.claude/projects/x.jsonl' })).toBe('claude-code');
    expect(agentOf([], {})).toBe('claude-code');
  });
});

describe('init-hooks for each agent', () => {
  it('writes Claude Code hooks to .claude/settings.json and Codex hooks to .codex/hooks.json', () => {
    const r = makeRepo();
    expect(hooksInstalled(r.root)).toBeNull();
    const codex = installHooks(r.root, '/x/gitflux.mjs', 'codex');
    expect(codex.replace(/\\/g, '/')).toMatch(/\.codex\/hooks\.json$/);
    const cfg = JSON.parse(readFileSync(codex, 'utf8'));
    expect(Object.keys(cfg.hooks)).toEqual(['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse']);
    expect(cfg.hooks.PreToolUse[0]).toMatchObject({ matcher: 'Bash' });
    expect(cfg.hooks.PreToolUse[0].hooks[0].command).toContain('hook --agent codex');
    expect(cfg.hooks.SessionStart[0].hooks[0].command).toContain('session-start --agent codex');
    expect(hooksInstalled(r.root)).toBe('codex');
    // running it again replaces GitFlux's entries instead of adding duplicates
    installHooks(r.root, '/x/gitflux.mjs', 'codex');
    expect(JSON.parse(readFileSync(codex, 'utf8')).hooks.PreToolUse).toHaveLength(1);
  });

  it('keeps hooks someone already had', () => {
    const r = makeRepo();
    sh(r.root, 'config', 'core.autocrlf', 'false');
    const f = path.join(r.root, '.claude', 'settings.json');
    installHooks(r.root, '/x/gitflux.mjs', 'claude-code');
    const cfg = JSON.parse(readFileSync(f, 'utf8'));
    cfg.hooks.PreToolUse.push({ matcher: 'Write', hooks: [{ type: 'command', command: 'my-linter' }] });
    writeFileSync(f, JSON.stringify(cfg));
    installHooks(r.root, '/x/gitflux.mjs', 'claude-code');
    const again = JSON.parse(readFileSync(f, 'utf8'));
    expect(again.hooks.PreToolUse.map((h: any) => h.matcher)).toEqual(['Bash', 'Write']);
    expect(hooksInstalled(r.root)).toBe('claude-code');
  });
});

describe('the real hook client', () => {
  it('Codex: a force push is stopped with instructions to ask; the approved re-run passes', () => {
    const r = diverged();
    const base = { hook_event_name: 'PreToolUse', cwd: r.root, tool_name: 'Bash', session_id: 's', turn_id: 't', model: 'gpt-5', transcript_path: path.join(r.base, '.codex', 'sessions', 'x.jsonl') };
    const stop = runHook({ ...base, tool_input: { command: 'git push --force origin main' } }, 'codex');
    expect(stop).toMatchObject({ hookEventName: 'PreToolUse', permissionDecision: 'deny' });
    expect(stop.permissionDecisionReason).toContain('GITFLUX_ALLOW=1');
    expect(runHook({ ...base, tool_input: { command: 'GITFLUX_ALLOW=1 git push --force origin main' } }, 'codex')).toBeNull();
    expect(runHook({ ...base, tool_input: { command: 'git status' } }, 'codex')).toBeNull();
  }, 60000);

  it('Claude Code: the same force push gets a permission question', () => {
    const r = diverged();
    const out = runHook({ hook_event_name: 'PreToolUse', cwd: r.root, tool_name: 'Bash', tool_input: { command: 'git push --force origin main' } }, 'claude-code');
    expect(out).toMatchObject({ permissionDecision: 'ask' });
  }, 60000);
});

describe('the engine with each kind of user', () => {
  it('by hand: no agent, every git change still becomes plain-English activity', async () => {
    const r = makeRepo();
    r.commit('first');
    const engine = new Engine(r.root);
    await engine.start();
    expect(engine.state.agentConnected).toBe(false);
    expect(engine.state.agentName).toBeNull();
    r.git('checkout', '-q', '-b', 'feature');
    r.commit('feat: by hand');
    for (let i = 0; i < 40 && !engine.state.events.some(e => e.kind === 'commit'); i++) await new Promise(res => setTimeout(res, 250));
    await engine.stop();
    const kinds = engine.state.events.map(e => e.kind);
    expect(kinds).toContain('branch-create');
    expect(kinds).toContain('commit');
    expect(engine.state.events.every(e => !e.via)).toBe(true); // nothing is credited to an agent
  }, 30000);

  it('Codex: names the agent, and a stopped command shows as paused until the approved re-run', async () => {
    const r = diverged();
    const engine = new Engine(r.root);
    await engine.start();
    const pre = (command: string) => engine.onHook({ hook_event_name: 'PreToolUse', gitflux_agent: 'codex', cwd: r.root, tool_name: 'Bash', tool_input: { command } });
    await engine.onHook({ hook_event_name: 'SessionStart', gitflux_agent: 'codex', cwd: r.root, source: 'startup' });
    expect(engine.state.agentName).toBe('Codex');
    expect(engine.state.agentConnected).toBe(true);
    await pre('git push --force origin main');
    const held = engine.state.agent.filter(a => a.kind === 'guard').pop()!;
    expect(held.guard).toBe('held');
    expect(held.agent).toBe('Codex');
    expect(engine.state.alerts.find(a => a.id === 'guard')?.fix).toContain('Codex will ask you in the chat');
    await pre('GITFLUX_ALLOW=1 git push --force origin main');
    expect(engine.state.agent.filter(a => a.kind === 'guard').pop()!.guard).toBe('approved');
    expect(engine.state.alerts.find(a => a.id === 'guard')).toBeUndefined();
    await engine.stop();
  }, 30000);
});
