import { useState, type ReactNode } from 'react';
import {
  ArrowCounterClockwise, ArrowUUpLeft, Check, CloudArrowDown, CloudArrowUp, Copy, EyeSlash, FolderSimple, GitBranch, GitCommit,
  GitMerge, GitPullRequest, Key, Lifebuoy, ShieldWarning, Tag, Warning, MagnifyingGlass, HandPalm
} from '@phosphor-icons/react';
import { Tip } from '@/components/ui/tooltip';

/**
 * Git and GitHub for people who have never used them: the words, the few rules that keep work safe,
 * and the exact things to ask your agent. Written for vibecoders, not developers.
 */

const WORDS: [ReactNode, string, string][] = [
  [<FolderSimple size={17} />, 'Repository (repo)', 'Your project folder, plus git’s record of every saved version of it.'],
  [<GitCommit size={17} />, 'Commit (snapshot)', 'A saved version of all your files at one moment, with a short note saying what changed. You can always go back to it.'],
  [<GitBranch size={17} />, 'Branch', 'A separate line of work. Try an idea on a branch; the main version stays untouched until you decide to combine them.'],
  [<GitCommit size={17} weight="fill" />, 'main', 'The main branch: the version of your project that counts.'],
  [<CloudArrowUp size={17} />, 'Push (upload)', 'Copy your snapshots from your laptop to GitHub. Until you push, your work exists only on your computer.'],
  [<CloudArrowDown size={17} />, 'Pull (download)', 'Bring GitHub’s newer snapshots onto your laptop and combine them with yours.'],
  [<MagnifyingGlass size={17} />, 'Fetch', 'Check GitHub for new snapshots without changing your files.'],
  [<GitMerge size={17} />, 'Merge', 'Combine two branches into one, keeping the work from both.'],
  [<GitPullRequest size={17} />, 'Pull request (PR)', 'A page on GitHub that says “please merge my branch into main”, so the change can be reviewed first.'],
  [<Warning size={17} />, 'Conflict', 'Two changes touched the same lines, so git asks which one to keep.'],
  [<Tag size={17} />, 'Tag', 'A name pinned to one snapshot, like “v1.0”, so you can find it later.'],
  [<ArrowUUpLeft size={17} />, 'Revert', 'Undo a snapshot by adding a new one that reverses it. Safe: nothing is erased.'],
  [<ArrowCounterClockwise size={17} />, 'Reset', 'Move a branch back to an earlier snapshot. Can throw away work.'],
  [<ShieldWarning size={17} />, 'Force push', 'An upload that overwrites GitHub’s copy instead of adding to it. Anything only GitHub had is lost.'],
  [<EyeSlash size={17} />, '.gitignore', 'A list of files git should never save, like passwords and big generated folders.'],
  [<Key size={17} />, 'Secrets', 'Passwords and keys, usually in a .env file. They must never go into a snapshot.']
];

const RULES: { title: string; body: string; tone: 'ok' | 'warn' | 'danger' }[] = [
  { tone: 'ok', title: 'Save often, in small steps', body: 'A snapshot after each working change means you can always step back to the last good version. GitFlux’s Unsaved count tells you when it’s time.' },
  { tone: 'ok', title: 'Pushing is your backup', body: 'Work that isn’t on GitHub can be lost with your laptop. End each session with nothing under “Not on GitHub”.' },
  { tone: 'ok', title: 'Experiment on a branch', body: 'Keep main working. Try new things on a branch, then merge it, ideally through a pull request.' },
  { tone: 'warn', title: 'Download before you upload', body: 'If someone else (or you, on github.com) changed things, pull first. A push that gets refused is git protecting you, not an error to force past.' },
  { tone: 'danger', title: 'Don’t force push', body: 'It overwrites GitHub. When GitFlux pauses one, read the “Loses …” line. If anything would be lost, say no and use the safer way it suggests.' },
  { tone: 'danger', title: 'Never save secrets', body: 'Keys and passwords go in .env, and .env goes in .gitignore. If one was ever pushed, change the key: deleting the file later isn’t enough.' },
  { tone: 'warn', title: 'Read before you approve', body: 'When your agent asks permission for a git command, GitFlux’s note says in plain words what it would destroy. Ten seconds of reading saves hours.' },
  { tone: 'ok', title: 'Most mistakes can be undone', body: 'Dropped a snapshot or deleted a branch? GitFlux’s alert includes the exact request to get it back. Ask soon: git keeps lost work for a while, not forever.' }
];

const ASKS: [string, string][] = [
  ['Save my work', 'Commit my current changes with a short, clear message describing what changed.'],
  ['Back it up', 'Push my current branch to GitHub.'],
  ['Try an idea safely', 'Create a new branch called idea/my-change and switch to it.'],
  ['Finish a feature', 'Open a pull request from this branch into main with a summary of the changes.'],
  ['Get the latest', 'Pull the latest changes from GitHub into my current branch. Don’t use --force.'],
  ['Undo the last snapshot safely', 'Revert the last commit so the change is undone but history is kept. Don’t use reset --hard.'],
  ['What did you change?', 'Summarise, in plain words, what changed in my last 3 commits and which files they touched.'],
  ['Remove a secret', 'Remove .env from git’s tracking (keep the file on disk), add it to .gitignore, and commit that.']
];

export function RuleBook() {
  const [copied, setCopied] = useState<number | null>(null);
  return (
    <div className="rulebook">
      <section>
        <h3>The words, in plain English</h3>
        <dl className="rb-words">
          {WORDS.map(([icon, word, meaning]) => (
            <div key={word}><dt><span className="rb-ic">{icon}</span>{word}</dt><dd>{meaning}</dd></div>
          ))}
        </dl>
      </section>

      <section>
        <h3>Eight rules that keep your work safe</h3>
        <ol className="rb-rules">
          {RULES.map((r, i) => (
            <li key={r.title} className={r.tone}>
              <span className="rb-n">{i + 1}</span>
              <div><b>{r.title}</b><p>{r.body}</p></div>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h3>What to say to your agent</h3>
        <p className="legend-sub">Click one to copy it, then paste it to your agent.</p>
        <div className="rb-asks">
          {ASKS.map(([label, prompt], i) => (
            <Tip key={label} tip={copied === i ? 'Copied' : 'Copy this request'}>
              <button type="button" className="rb-ask" onClick={() => navigator.clipboard?.writeText(prompt).then(() => { setCopied(i); setTimeout(() => setCopied(c => (c === i ? null : c)), 1500); }).catch(() => {})}>
                <span><b>{label}</b>“{prompt}”</span>{copied === i ? <Check size={15} weight="bold" /> : <Copy size={15} />}
              </button>
            </Tip>
          ))}
        </div>
      </section>

      <p className="rb-foot"><Lifebuoy size={15} /> Stuck? Ask your agent “Explain what just happened to my git history in plain words”, and watch the map while it answers. <HandPalm size={15} /> If GitFlux ever pauses a command, nothing has changed yet.</p>
    </div>
  );
}
