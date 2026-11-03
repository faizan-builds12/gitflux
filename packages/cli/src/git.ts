import { execFile } from 'node:child_process';

const ENV = { ...process.env, GIT_OPTIONAL_LOCKS: '0', LC_ALL: 'C', GIT_TERMINAL_PROMPT: '0' };

/** Run git and resolve stdout. GIT_OPTIONAL_LOCKS=0 keeps `git status` from touching the index (and our watcher). */
export function git(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd, env: ENV, maxBuffer: 32 << 20, windowsHide: true }, (err, stdout, stderr) => {
      if (err) reject(Object.assign(err, { stderr: String(stderr) }));
      else resolve(String(stdout));
    });
  });
}

export const gitSafe = (cwd: string, args: string[]) => git(cwd, args).catch(() => '');

export function run(cmd: string, args: string[], cwd: string, timeout = 15000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { cwd, timeout, windowsHide: true, maxBuffer: 8 << 20 }, (err, stdout) => (err ? reject(err) : resolve(String(stdout))));
  });
}
