import {
  ArrowCounterClockwise, ArrowUUpLeft, ArrowsLeftRight, BookOpen, CheckCircle, CloudArrowDown, CloudArrowUp, Eye, Flask,
  FolderSimplePlus, GitBranch, GitCommit, GitFork, GitMerge, GitPullRequest, Key, LinkSimple, MinusCircle, Package, Palette,
  PencilSimpleLine, Plant, Prohibit, ShieldWarning, Shuffle, Sparkle, Stack, Tag, Trash, Warning, Wrench, XCircle,
  type Icon
} from '@phosphor-icons/react';
import type { Commit, EventKind, GitEvent } from '../../cli/src/types';

export interface CommitKind { icon: Icon; label: string }

/** Pick an icon that says what a snapshot was about, from its message (conventional-commit style or plain words). */
export function commitKind(c: Commit): CommitKind {
  const s = c.subject.trim();
  if (c.parents.length > 1) return { icon: GitMerge, label: 'Merge' };
  if (/\(#\d+\)\s*$/.test(s)) return { icon: GitPullRequest, label: 'Merged pull request' };
  if (/^revert\b/i.test(s)) return { icon: ArrowUUpLeft, label: 'Undo' };
  if (c.parents.length === 0 || /^(init(ial)?|scaffold|bootstrap|setup|set up|first commit|create (the )?(project|app))\b/i.test(s)) return { icon: Plant, label: 'First snapshot' };
  if (/^(fix|bug|hotfix|patch)\b|\bfix(es|ed)?\b|\btypo\b/i.test(s)) return { icon: Wrench, label: 'Fix' };
  if (/^(docs?|readme)\b|\breadme\b/i.test(s)) return { icon: BookOpen, label: 'Docs' };
  if (/^(test|spec)s?\b|\btests?\b/i.test(s)) return { icon: Flask, label: 'Tests' };
  if (/^(style|ui|css|design|theme)\b/i.test(s)) return { icon: Palette, label: 'Look and feel' };
  if (/^(refactor|clean ?up|tidy|rename|move)\b/i.test(s)) return { icon: Shuffle, label: 'Restructure' };
  if (/^(chore|build|ci|deps?|bump|upgrade|config|update dependencies)\b/i.test(s)) return { icon: Package, label: 'Maintenance' };
  if (/^(wip|draft|temp)\b/i.test(s)) return { icon: PencilSimpleLine, label: 'Work in progress' };
  if (/\b(key|secret|token|password|\.env)\b/i.test(s)) return { icon: Key, label: 'Secrets or config' };
  if (/^(feat|add|create|implement|introduce|new|build|connect|wire|support)\b/i.test(s)) return { icon: Sparkle, label: 'New feature' };
  return { icon: GitCommit, label: 'Snapshot' };
}

const EVENT_ICONS: Record<EventKind, Icon> = {
  watch: Eye, init: FolderSimplePlus, commit: GitCommit, amend: PencilSimpleLine, merge: GitMerge, checkout: ArrowsLeftRight,
  'branch-create': GitBranch, 'branch-delete': Trash, reset: ArrowCounterClockwise, rebase: Stack, pull: CloudArrowDown, fetch: CloudArrowDown,
  push: CloudArrowUp, 'push-new': CloudArrowUp, 'force-push': ShieldWarning, 'remote-delete': Trash, tag: Tag, 'cherry-pick': GitFork,
  revert: ArrowUUpLeft, 'pr-open': GitPullRequest, 'pr-merged': GitMerge, 'pr-closed': MinusCircle, 'checks-pass': CheckCircle,
  'checks-fail': XCircle, conflict: Warning, secret: Key, refused: Prohibit, other: LinkSimple
};

export const eventIcon = (e: GitEvent): Icon => (e.tone === 'warn' && e.kind === 'commit' ? Warning : EVENT_ICONS[e.kind] ?? GitCommit);

/** One line on what each kind of activity means, for tooltips. */
export const EVENT_HELP: Partial<Record<EventKind, string>> = {
  commit: 'A snapshot: git saved the current state of the files.',
  push: 'An upload: snapshots copied from your laptop to GitHub.',
  'push-new': 'An upload of a branch GitHub did not have yet.',
  pull: 'A download: GitHub’s newer snapshots merged into your laptop.',
  fetch: 'A check of GitHub for new snapshots, without changing your files.',
  checkout: 'Switching which branch you are working on.',
  'branch-create': 'A new branch: a separate line of work.',
  merge: 'Two lines of work combined into one.',
  reset: 'A branch moved back to an earlier snapshot.',
  rebase: 'Snapshots replayed on top of a newer starting point.',
  'force-push': 'An upload that overwrote GitHub’s copy instead of adding to it.',
  refused: 'GitHub said no, usually because it has work your laptop doesn’t.',
  secret: 'A file that usually holds passwords or keys was saved.'
};
