import type { AppState } from '../../cli/src/types';

export interface Suggestion {
  tone: 'ok' | 'warn' | 'danger' | 'info';
  /** one-line status, e.g. "2 snapshots are not on GitHub yet" */
  headline: string;
  /** what to do, in plain words */
  next?: string;
  /** a prompt the user can paste to their agent */
  prompt?: string;
}

/** The single most useful thing to tell a vibecoder right now. Order = urgency. */
export function suggest(state: AppState): Suggestion {
  const s = state.snapshot;
  if (!s) return { tone: 'info', headline: 'This folder is not tracked by git yet.', next: 'Ask your agent to start version control here.', prompt: 'Initialize a git repository for this project and make a first commit.' };
  if (!s.head.sha) return { tone: 'info', headline: 'Git is set up, but nothing is saved yet.', next: 'Save a first snapshot of the project.', prompt: 'Commit the current project as the first commit with a clear message.' };

  const st = s.status;
  const unsaved = st.staged + st.unstaged + st.untracked;
  const branch = s.head.branch;
  const local = s.refs.find(r => r.kind === 'local' && r.short === branch);
  const hasRemote = s.remotes.length > 0;

  // an unresolved danger beats routine advice (e.g. never suggest pushing a commit that holds a secret)
  const secret = state.alerts.find(a => a.title === 'A secrets file was committed');
  if (secret) return { tone: 'danger', headline: 'A secrets file is saved in a snapshot.', next: 'Take it out before uploading anything.', prompt: 'Remove the secrets file from the last commit (keep it on disk), add it to .gitignore, and do not push until it is gone.' };
  const danger = state.alerts.find(a => a.tone === 'danger' && a.kind === 'event');
  if (danger?.fix) return { tone: 'danger', headline: danger.title + '.', next: danger.fix };

  if (st.conflicted) return { tone: 'danger', headline: `Git is stuck on a conflict in ${st.conflicted} file${st.conflicted > 1 ? 's' : ''}.`, next: 'The agent needs to choose which change to keep.', prompt: 'Resolve the merge conflicts, keeping both changes where it makes sense, then finish the merge.' };
  if (!branch) return { tone: 'warn', headline: 'You are not on a branch.', next: 'Put this work on a branch so it can’t get lost.', prompt: 'Create a new branch here so this work is not lost (git switch -c), and tell me its name.' };
  if (local?.ahead && local?.behind) return { tone: 'warn', headline: `Your ${branch} and GitHub’s have split.`, next: 'Combine both sides before uploading. Never force push.', prompt: `Pull the latest ${branch} from GitHub, combine it with my local work, then push. Do not use --force.` };
  if (unsaved) return { tone: 'warn', headline: `${unsaved} changed file${unsaved > 1 ? 's are' : ' is'} not saved in a snapshot.`, next: 'If the agent breaks something now, these edits are the easiest to lose.', prompt: 'Commit my current changes with a short, clear message describing what changed.' };
  if (hasRemote && local && !local.upstream) return { tone: 'warn', headline: `${branch} has never been uploaded to GitHub.`, next: 'Upload it so the work is backed up.', prompt: `Push the ${branch} branch to GitHub and set it to track origin.` };
  if (local?.ahead) return { tone: 'warn', headline: `${local.ahead} snapshot${local.ahead > 1 ? 's are' : ' is'} not on GitHub yet.`, next: `Upload ${branch} so it’s backed up.`, prompt: `Push ${branch} to GitHub.` };
  if (local?.behind) return { tone: 'info', headline: `GitHub has ${local.behind} newer snapshot${local.behind > 1 ? 's' : ''} on ${branch}.`, next: 'Download them before you change more.', prompt: `Pull the latest ${branch} from GitHub.` };
  if (!hasRemote) return { tone: 'info', headline: 'Everything is saved, but only on this laptop.', next: 'Put it on GitHub so it’s backed up.', prompt: 'Create a private GitHub repository for this project and push all branches.' };
  const pr = state.github.prs.find(p => p.head === branch && p.state === 'OPEN');
  if (branch !== s.defaultBranch && state.github.available && !pr) return { tone: 'ok', headline: `${branch} is saved and on GitHub.`, next: `When it’s ready, open a pull request into ${s.defaultBranch}.`, prompt: `Open a pull request from ${branch} into ${s.defaultBranch} with a summary of the changes.` };
  return { tone: 'ok', headline: 'All work is saved and on GitHub.' };
}
