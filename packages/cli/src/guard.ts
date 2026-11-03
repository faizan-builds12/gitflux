import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { gitSafe } from './git.js';
import { plural } from './classify.js';
import type { AgentId, GuardMode, GuardVerdict } from './types.js';

/**
 * The risky command guard. Before the agent runs a git command, work out what it
 * would actually destroy *in this repo right now*, so harmless cases pass silently
 * and dangerous ones pause with a specific reason ("erases 2 snapshots on GitHub").
 */

const guardFile = (gitDir: string) => path.join(gitDir, 'gitflux', 'guard.json');

export function readGuardMode(gitDir: string | null): GuardMode {
  if (!gitDir) return 'ask';
  try {
    const m = JSON.parse(readFileSync(guardFile(gitDir), 'utf8')).mode;
    return m === 'block' || m === 'off' ? m : 'ask';
  } catch { return 'ask'; }
}

export function writeGuardMode(gitDir: string, mode: GuardMode) {
  const f = guardFile(gitDir);
  if (!existsSync(path.dirname(f))) mkdirSync(path.dirname(f), { recursive: true });
  writeFileSync(f, JSON.stringify({ mode }));
}

// ---------- parsing ----------

/** Split a shell line into simple commands (on && || ; | and newlines), each tokenized with quotes respected. */
export function splitCommands(line: string): string[][] {
  const out: string[][] = [];
  let cur: string[] = [], tok = '', quote = '', has = false;
  const endTok = () => { if (has) cur.push(tok); tok = ''; has = false; };
  const endCmd = () => { endTok(); if (cur.length) out.push(cur); cur = []; };
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      if (c === quote) quote = '';
      else if (c === '\\' && quote === '"' && i + 1 < line.length) tok += line[++i];
      else tok += c;
      continue;
    }
    if (c === '"' || c === "'") { quote = c; has = true; continue; }
    if (c === '\\' && i + 1 < line.length) { tok += line[++i]; has = true; continue; }
    if (c === ' ' || c === '\t') { endTok(); continue; }
    if (c === '\n' || c === ';') { endCmd(); continue; }
    if (c === '&' || c === '|') { endCmd(); if (line[i + 1] === c) i++; continue; }
    if (c === '(' || c === ')') { endCmd(); continue; }
    tok += c; has = true;
  }
  endCmd();
  return out;
}

/** Strip git's global options (-C dir, -c k=v, --no-pager…); returns the subcommand args and any -C directory. */
function gitArgs(argv: string[]): { args: string[]; dir?: string; config: string[] } {
  let i = 1, dir: string | undefined;
  const config: string[] = [];
  while (i < argv.length && argv[i].startsWith('-')) {
    if (argv[i] === '-C') { dir = argv[i + 1]; i += 2; }
    else if (argv[i] === '-c') { config.push(argv[i + 1] ?? ''); i += 2; }
    else i++;
  }
  return { args: argv.slice(i), dir, config };
}

/** Programs that run the rest of the line as a command: `env X=1 git …`, `sudo git …`. */
const WRAPPERS = new Set(['env', 'command', 'exec', 'sudo', 'nohup', 'time', 'nice', 'builtin']);
const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh', 'fish', 'pwsh', 'powershell', 'cmd']);
const exeName = (t: string) => t.split(/[\\/]/).pop()!.toLowerCase().replace(/\.exe$/, '');

/** Drop `NAME=value` prefixes and wrappers so `GIT_TRACE=1 git push -f` is seen as `git push -f`. */
function unwrap(argv: string[]): string[] {
  let i = 0;
  while (i < argv.length) {
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(argv[i])) i++;
    else if (WRAPPERS.has(exeName(argv[i]))) { i++; while (i < argv.length && argv[i].startsWith('-')) i++; }
    else break;
  }
  return argv.slice(i);
}

/** The script given to a shell with -c (or /c, -Command), if any. */
function shellScript(argv: string[]): string | undefined {
  if (!SHELLS.has(exeName(argv[0] ?? ''))) return;
  const i = argv.findIndex((a, k) => k > 0 && /^(-c|\/c|-command|-lc|-ic)$/i.test(a));
  return i > 0 ? argv.slice(i + 1).join(' ') : undefined;
}

/** A name the agent supplied that git would read as an option ("--output=…") instead of a branch or snapshot. */
class OptionLikeName extends Error {}
function plainName<T extends string | undefined>(name: T): T {
  if (name && name.startsWith('-')) throw new OptionLikeName(name);
  return name;
}

const isExe = (t: string, name: string) => t === name || t.endsWith(`/${name}`) || t.endsWith(`\\${name}`) || t === `${name}.exe`;
const shortFlags = (args: string[]) => args.filter(a => /^-[a-zA-Z]+$/.test(a)).join('');
const positionals = (args: string[], withValue: string[] = []) => {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--') { out.push(...args.slice(i + 1)); break; }
    if (a.startsWith('-')) { if (withValue.includes(a)) i++; continue; }
    out.push(a);
  }
  return out;
};

// ---------- git facts ----------

const count = async (cwd: string, args: string[]) => Number((await gitSafe(cwd, ['rev-list', '--count', ...args])).trim()) || 0;
const exists = async (cwd: string, ref: string) => Boolean((await gitSafe(cwd, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`])).trim());
const currentBranch = async (cwd: string) => (await gitSafe(cwd, ['symbolic-ref', '--quiet', '--short', 'HEAD'])).trim();
const lines = (s: string) => s.split(/\r?\n/).filter(Boolean);
const snaps = (n: number) => plural(n, 'snapshot');

// ---------- rules ----------

type Facts = Omit<GuardVerdict, 'command'>;

async function forcePush(cwd: string, args: string[]): Promise<Facts[]> {
  const pos = positionals(args, ['--repo', '-o', '--push-option', '--receive-pack', '--exec']);
  const flags = shortFlags(args);
  const del = args.includes('--delete') || /d/.test(flags);
  const lease = args.some(a => a.startsWith('--force-with-lease'));
  const force = args.includes('--force') || /f/.test(flags) || lease;
  const cur = await currentBranch(cwd);
  const remote = pos[0] ?? ((await gitSafe(cwd, ['config', `branch.${cur}.remote`])).trim() || 'origin');
  const specs = pos.slice(1);
  if (!specs.length && cur) specs.push(cur);
  const out: Facts[] = [];

  for (const raw of specs) {
    const plus = raw.startsWith('+');
    const spec = plus ? raw.slice(1) : raw;
    const [src, dstRaw] = spec.includes(':') ? spec.split(':') : [spec, spec];
    const dst = (dstRaw || src).replace(/^refs\/heads\//, '');
    const tracking = `refs/remotes/${remote}/${dst}`;

    if (del || (spec.startsWith(':') && dst)) {
      const name = del ? spec : dst;
      const tr = `refs/remotes/${remote}/${name}`;
      if (!(await exists(cwd, tr))) continue;
      const only = await count(cwd, [tr, '--not', `--exclude=${remote}/${name}`, '--remotes', '--branches', '--tags']);
      out.push({ rule: 'remote-delete', risk: only ? 'high' : 'low', title: `Delete the ${name} branch on GitHub`,
        loses: only ? `${snaps(only)} that ${only === 1 ? 'exists' : 'exist'} only in GitHub’s ${name}` : 'nothing: every snapshot on it is kept elsewhere',
        safer: only ? `Merge ${name} first, or keep it.` : undefined });
      continue;
    }
    if (!force && !plus) continue;
    const srcRef = plainName(src === 'HEAD' || !src ? 'HEAD' : src);
    if (!(await exists(cwd, tracking))) {
      out.push({ rule: 'force-push', risk: lease ? 'low' : 'high', title: `Force push to ${dst} on GitHub`,
        loses: lease ? 'nothing yet: GitHub has no copy GitFlux knows of' : `anything on GitHub’s ${dst}; GitFlux hasn’t seen that branch, so it can’t tell what’s there`,
        safer: lease ? undefined : 'Fetch first, then use --force-with-lease, which refuses if GitHub has work you don’t.' });
      continue;
    }
    const lost = await count(cwd, [tracking, '--not', srcRef]);
    if (lease && !lost) {
      out.push({ rule: 'force-push', risk: 'low', title: `Force push to ${dst} on GitHub`, loses: 'nothing: GitHub has no snapshots your laptop is missing' });
      continue;
    }
    out.push({ rule: 'force-push', risk: 'high', title: `Force push to ${dst} on GitHub`,
      loses: lost ? `${snaps(lost)} on GitHub’s ${dst} that your laptop doesn’t have` : `possibly newer work on GitHub’s ${dst}; a plain --force overwrites whatever is there`,
      safer: lost ? `Pull ${dst} first and combine the work, then push without --force.` : 'Use --force-with-lease instead: it refuses if GitHub has work you haven’t seen.' });
  }
  return out;
}

async function resetHard(cwd: string, args: string[]): Promise<Facts[]> {
  if (!args.includes('--hard')) return [];
  const target = plainName(positionals(args)[0] ?? 'HEAD');
  const dirty = lines(await gitSafe(cwd, ['diff', 'HEAD', '--name-only'])).length;
  const cur = await currentBranch(cwd);
  const dropped = (await exists(cwd, target))
    ? await count(cwd, ['HEAD', '--not', target, ...(cur ? [`--exclude=${cur}`] : []), '--branches', '--remotes', '--tags'])
    : 0;
  const parts = [dirty && `unsaved edits in ${plural(dirty, 'file')}`, dropped && `${snaps(dropped)} that ${dropped === 1 ? 'is' : 'are'} on no other branch or on GitHub`].filter(Boolean);
  return [{ rule: 'reset-hard', risk: parts.length ? 'high' : 'low', title: target === 'HEAD' ? 'Throw away all unsaved changes' : `Move ${cur || 'HEAD'} back to ${target} and throw away changes`,
    loses: parts.length ? parts.join(' and ') : 'nothing: no unsaved edits and no unique snapshots',
    safer: parts.length ? (dirty ? 'Commit or stash the edits first (git stash), so they can be brought back.' : `Make a backup branch first: git branch backup-${Date.now().toString(36).slice(-4)}`) : undefined }];
}

async function branchDelete(cwd: string, args: string[]): Promise<Facts[]> {
  const flags = shortFlags(args);
  const forced = /D/.test(flags) || ((args.includes('--delete') || /d/.test(flags)) && (args.includes('--force') || /f/.test(flags)));
  if (!forced) return [];
  const out: Facts[] = [];
  for (const name of positionals(args)) {
    if (!(await exists(cwd, `refs/heads/${name}`))) continue;
    const only = await count(cwd, [`refs/heads/${name}`, '--not', `--exclude=${name}`, '--branches', '--remotes', '--tags']);
    out.push({ rule: 'branch-delete', risk: only ? 'high' : 'low', title: `Force-delete the ${name} branch`,
      loses: only ? `${snaps(only)} that ${only === 1 ? 'was' : 'were'} never merged or pushed` : 'nothing: all its snapshots are kept elsewhere',
      safer: only ? `Push it first (git push -u origin ${name}) or merge it.` : undefined });
  }
  return out;
}

async function clean(cwd: string, args: string[]): Promise<Facts[]> {
  const flags = shortFlags(args);
  if (!(args.includes('--force') || /f/.test(flags)) || /n/.test(flags) || args.includes('--dry-run')) return [];
  const dry = ['clean', '-n', ...(/d/.test(flags) ? ['-d'] : []), ...(/x/.test(flags) ? ['-x'] : []), ...(/X/.test(flags) ? ['-X'] : []), '--', ...positionals(args)];
  const n = lines(await gitSafe(cwd, dry)).length;
  return [{ rule: 'clean', risk: n ? 'high' : 'low', title: 'Delete untracked files',
    loses: n ? `${plural(n, 'file')} git has never saved, so they can’t be brought back` : 'nothing: there are no untracked files',
    safer: n ? 'Commit the files you want, or add them to .gitignore, then clean.' : undefined }];
}

async function discard(cwd: string, sub: string, args: string[]): Promise<Facts[]> {
  let paths: string[];
  if (sub === 'restore') {
    if (args.includes('--staged') && !args.includes('--worktree') && !args.includes('-W')) return [];
    paths = positionals(args, ['-s', '--source']);
  } else {
    const dd = args.indexOf('--');
    paths = dd >= 0 ? args.slice(dd + 1) : args.filter(a => a === '.');
  }
  if (!paths.length) return [];
  const n = lines(await gitSafe(cwd, ['diff', '--name-only', '--', ...paths])).length;
  return [{ rule: 'discard', risk: n ? 'high' : 'low', title: 'Discard unsaved edits',
    loses: n ? `unsaved edits in ${plural(n, 'file')}` : 'nothing: there are no unsaved edits there',
    safer: n ? 'Stash them instead (git stash) so they can be brought back.' : undefined }];
}

async function rebase(cwd: string, args: string[]): Promise<Facts[]> {
  if (args.some(a => ['--continue', '--abort', '--skip', '--quit', '--edit-todo', '--show-current-patch'].includes(a))) return [];
  const up = (await gitSafe(cwd, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'])).trim();
  if (!up) return [];
  const onto = plainName(positionals(args, ['--onto', '-s', '--strategy', '-X', '--strategy-option', '--exec', '-x'])[0] ?? up);
  if (!(await exists(cwd, onto))) return [];
  const pushed = (await count(cwd, ['HEAD', '--not', onto])) - (await count(cwd, ['HEAD', '--not', onto, up]));
  return [{ rule: 'rebase', risk: pushed > 0 ? 'high' : 'low', title: `Rewrite history onto ${onto}`,
    loses: pushed > 0 ? `the original ${snaps(pushed)} already on GitHub; uploading afterwards needs a force push` : 'nothing on GitHub: only local snapshots are rewritten',
    safer: pushed > 0 ? `Merge ${onto} instead (git merge ${onto}); it keeps history and uploads normally.` : undefined }];
}

async function stash(cwd: string, args: string[]): Promise<Facts[]> {
  const sub = args[0];
  if (sub !== 'drop' && sub !== 'clear') return [];
  const n = lines(await gitSafe(cwd, ['stash', 'list'])).length;
  const k = sub === 'clear' ? n : Math.min(n, 1);
  return [{ rule: 'stash-drop', risk: k ? 'high' : 'low', title: sub === 'clear' ? 'Delete every stash' : 'Delete a stash',
    loses: k ? `${plural(k, 'set')} of edits that were put aside` : 'nothing: there are no stashes',
    safer: k ? 'Apply the stash first (git stash pop) if any of it is still needed.' : undefined }];
}

/** Assess one shell line the agent wants to run. Returns every git operation in it that destroys something. */
export async function assess(line: string, cwd: string, depth = 0): Promise<GuardVerdict[]> {
  const out: GuardVerdict[] = [];
  if (depth > 3) return out; // aliases or shells nested this deep: stop rather than loop
  let dir = cwd;
  for (const raw of splitCommands(line)) {
    const argv = unwrap(raw);
    if (!argv.length) continue;
    if (argv[0] === 'cd' && argv[1]) { dir = path.resolve(dir, argv[1]); continue; }
    const script = shellScript(argv);
    if (script) { out.push(...await assess(script, dir, depth + 1)); continue; }
    const command = argv.join(' ');
    if (isExe(argv[0], 'gh')) {
      if (argv[1] === 'repo' && argv[2] === 'delete') out.push({ command, rule: 'repo-delete', risk: 'high', title: 'Delete the whole GitHub repository', loses: 'the repository on GitHub with its issues, pull requests and settings, for good', safer: 'Archive it instead (gh repo archive), which can be undone.' });
      continue;
    }
    if (!isExe(argv[0], 'git')) continue;
    const { args: [sub, ...rest], dir: cdir, config } = gitArgs(argv);
    const at = cdir ? path.resolve(dir, cdir) : dir;
    // every rule reads git; if git can't open the folder, say nothing rather than "nothing would be lost"
    if (!sub || !(await gitSafe(at, ['rev-parse', '--git-dir'])).trim()) continue;

    // git aliases: `git -c alias.p="push -f" p`, or one set in git config
    const alias = config.map(c => c.match(/^alias\.([^=]+)=(.*)$/i)).find(m => m && m[1] === sub)?.[2]
      ?? ((await gitSafe(at, ['config', '--get', `alias.${sub}`])).trim() || undefined);
    if (alias) {
      const expanded = alias.startsWith('!') ? alias.slice(1) : `git ${alias} ${rest.map(a => JSON.stringify(a)).join(' ')}`;
      out.push(...(await assess(expanded, at, depth + 1)).map(v => ({ ...v, command })));
      continue;
    }

    let found: Facts[] = [];
    try {
      if (sub === 'push') found = await forcePush(at, rest);
      else if (sub === 'reset') found = await resetHard(at, rest);
      else if (sub === 'branch') found = await branchDelete(at, rest);
      else if (sub === 'clean') found = await clean(at, rest);
      else if (sub === 'checkout' || sub === 'restore') found = await discard(at, sub, rest);
      else if (sub === 'rebase') found = await rebase(at, rest);
      else if (sub === 'stash') found = await stash(at, rest);
      else if (sub === 'filter-branch' || sub === 'filter-repo') found = [{ rule: 'history-rewrite', risk: 'high', title: 'Rewrite the entire history', loses: 'every snapshot’s identity; everyone with a copy must start over', safer: 'Make a backup copy of the repository folder first.' }];
    } catch (e) {
      if (!(e instanceof OptionLikeName)) throw e;
      // never hand such a name to git, even just to look: it could make git write files
      found = [{ rule: sub === 'push' ? 'force-push' : sub === 'rebase' ? 'rebase' : 'reset-hard', risk: 'high', title: `Run git ${sub} with an unusual name (${e.message})`,
        loses: 'unknown: a name starting with "-" makes git treat it as an option, which can do something else entirely', safer: 'Use the plain branch or snapshot name.' }];
    }
    out.push(...found.map(f => ({ ...f, command })));
  }
  return out;
}

/** What to tell Claude Code. `ask` shows the reason to the user; `deny` shows it to the agent so it can pick a safer path. */
/** The person agreed in the chat and the agent re-ran the command as `GITFLUX_ALLOW=1 git …`. */
export const userApproved = (cmd: string) => /(^|[\s;&|(])GITFLUX_ALLOW=1\s/.test(cmd);

/**
 * What to tell the agent. Claude Code can ask the person directly (`ask`). Codex can't
 * (it treats "ask" as a failed hook and runs the command), so there "Ask" means: stop the
 * command and have the agent ask in the chat; with a clear yes it re-runs it as
 * `GITFLUX_ALLOW=1 …`, which passes. "Block" always refuses.
 */
export function decide(verdicts: GuardVerdict[], mode: GuardMode, agent: AgentId = 'claude-code', cmd = ''): { decision: 'ask' | 'deny'; reason: string } | null {
  const high = verdicts.filter(v => v.risk === 'high');
  if (mode === 'off' || !high.length) return null;
  const what = high.map(v => `${v.title}: this loses ${v.loses}.${v.safer ? ` Safer: ${v.safer.replace(/\.?$/, '.')}` : ''}`).join(' ');
  if (mode === 'block') return { decision: 'deny', reason: `GitFlux blocked this git command. ${what} Tell the user what you wanted to do and why, and use the safer option. Only the user can allow it, by switching GitFlux's guard to "Ask".` };
  if (agent === 'codex') {
    if (userApproved(cmd)) return null;
    return { decision: 'deny', reason: `GitFlux paused this git command because it would lose work. ${what} Don't run it yet. Tell the user in plain words what would be lost and ask whether to go ahead. Only if they clearly say yes, run exactly the same command again starting with GITFLUX_ALLOW=1 (for example: GITFLUX_ALLOW=1 ${cmd || 'git …'}).` };
  }
  return { decision: 'ask', reason: `GitFlux: ${what}` };
}

export function hookOutput(d: { decision: 'ask' | 'deny'; reason: string }) {
  return JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: d.decision, permissionDecisionReason: d.reason } });
}
