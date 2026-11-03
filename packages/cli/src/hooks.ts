import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { assess, decide, hookOutput, readGuardMode, userApproved } from './guard.js';
import { agentOf, ensureServer, findServer, post, projectRoot, readStdin, worthWatching } from './launcher.js';
export { agentOf };
import type { AgentId } from './types.js';

// also inside quotes and after NAME=value: `bash -c "git push -f"`, `GIT_TRACE=1 git …`, `git.exe …`
export const isGitCommand = (cmd: string) => /(^|[\s;&|("'`=\\/])(git|gh)(\.exe)?\s/i.test(cmd);

const MARK = 'gitflux';

// Claude Code keeps project hooks in .claude/settings.json; Codex in .codex/hooks.json (same shape)
const HOOK_FILES: Record<AgentId, string> = { 'claude-code': path.join('.claude', 'settings.json'), codex: path.join('.codex', 'hooks.json') };

/** The agent whose project hooks call GitFlux, if any. */
export function hooksInstalled(root: string): AgentId | null {
  const places: [AgentId, string[]][] = [['claude-code', ['.claude/settings.json', '.claude/settings.local.json']], ['codex', ['.codex/hooks.json']]];
  for (const [agent, files] of places) {
    for (const f of files) {
      try { const s = readFileSync(path.join(root, f), 'utf8'); if (s.includes(`${MARK} hook`) || ((s.includes('gitflux.mjs') || s.includes('cli.js')) && (s.includes(' hook') || s.includes(' session-start')))) return agent; } catch {}
    }
  }
  return null;
}

/** Add GitFlux's hooks to the agent's project hook file, keeping everything already there. */
export function installHooks(root: string, cliFile: string, agent: AgentId = 'claude-code') {
  const file = path.join(root, HOOK_FILES[agent]);
  mkdirSync(path.dirname(file), { recursive: true });
  let cfg: any = {};
  if (existsSync(file)) {
    copyFileSync(file, file + '.bak');
    cfg = JSON.parse(readFileSync(file, 'utf8') || '{}');
  }
  const cli = `node "${cliFile.replace(/\\/g, '/')}"`;
  const command = `${cli} hook --agent ${agent}`;
  // the guard reads git before answering; leave room for slow disks so a timeout never waves a risky command through
  const entry = (matcher?: string) => ({ ...(matcher ? { matcher } : {}), hooks: [{ type: 'command', command, timeout: matcher ? 20 : 5 }] });
  cfg.hooks ??= {};
  for (const [event, matcher] of [['SessionStart', undefined], ['UserPromptSubmit', undefined], ['PreToolUse', 'Bash'], ['PostToolUse', 'Bash']] as const) {
    const list: any[] = (cfg.hooks[event] ??= []);
    const mine = (h: any) => /" (hook|session-start)/.test(JSON.stringify(h));
    const i = list.findIndex(mine);
    const e = event === 'SessionStart' ? { hooks: [{ type: 'command', command: `${cli} session-start --agent ${agent}`, timeout: 20 }] } : entry(matcher);
    if (i >= 0) list[i] = e; else list.push(e);
  }
  writeFileSync(file, JSON.stringify(cfg, null, 2) + '\n');
  return file;
}

/**
 * `gitflux hook`: called by Claude Code or Codex with the hook payload on stdin.
 * Before a risky git command it answers Claude Code itself (ask/deny), so the guard
 * works even when the GitFlux page is closed. Then it forwards the payload to this
 * project's GitFlux server, restarting it on a new prompt if it had stopped.
 * Any failure stays silent and lets the agent continue.
 */
export async function runHookClient(cliFile: string, argv: string[] = []) {
  let payload: any;
  try { payload = JSON.parse((await readStdin()) || '{}'); } catch { process.exit(0); }
  const cwd = payload.cwd || process.cwd();
  const agent = agentOf(argv, payload);
  payload.gitflux_agent = agent;
  try {
    const cmd: string = payload.tool_input?.command ?? '';
    if (payload.hook_event_name === 'PreToolUse' && isGitCommand(cmd)) {
      const gitDir = execFileSync('git', ['rev-parse', '--absolute-git-dir'], { cwd, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }).toString().trim();
      const mode = readGuardMode(gitDir);
      const verdicts = mode === 'off' ? [] : await assess(cmd, cwd);
      const d = decide(verdicts, mode, agent, cmd);
      payload.gitflux_guard = { mode, verdicts, decision: d?.decision ?? 'allow', approved: userApproved(cmd) && mode !== 'block' };
      if (d) process.stdout.write(hookOutput(d));
    }
  } catch {
    // not a repo yet (or git missing): nothing to guard
  }
  try {
    let s = findServer(cwd);
    if (!s && payload.hook_event_name === 'UserPromptSubmit') {
      const root = projectRoot(cwd);
      if (worthWatching(root)) s = await ensureServer(root, cliFile, agent);
    }
    if (s) await post(s.port, '/api/hook', JSON.stringify(payload));
  } catch {
    // GitFlux not running: the guard above still applied.
  }
  process.exit(0);
}
