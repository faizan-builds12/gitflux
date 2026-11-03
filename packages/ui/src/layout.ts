import type { AppState, Commit, PullRequest } from '../../cli/src/types';

// Geometry (world units = CSS px at zoom 1)
export const COL = 136;          // horizontal distance between snapshots
export const X0 = 236;           // first snapshot centre (lane labels live to the left)
export const LANE_GAP = 112;     // vertical distance between branch lanes
export const HEAD_H = 84;        // band header height
export const SYNC_GAP = 76;      // space between the two bands
export const MAX_COMMITS = 40;   // newest snapshots shown
export const OTHER = '(no branch)';

export type Band = 'local' | 'remote';
export interface Pt { x: number; y: number }
export interface LNode {
  key: string; band: Band; sha: string; x: number; y: number; color: string;
  commit?: Commit; ghost?: string; synced: boolean; lane: string;
  tags?: string[];   // version names (git tags) on this snapshot
}
export interface LEdge { key: string; d: string; color: string; sprout?: boolean }
export interface LAnno { key: string; x: number; y: number; badge?: { text: string; tone: 'pending' | 'gh' }; prs: PullRequest[] }
export interface LPill { key: string; band: Band; name: string; y: number; color: string }
export interface Layout {
  width: number; height: number;
  bands: { local: { y: number; h: number }; remote: { y: number; h: number; on: boolean } };
  syncY: number;
  pills: LPill[];
  nodes: LNode[];
  edges: LEdge[];
  annos: LAnno[];
  head: Pt | null;
  truncated: boolean;
  laneColor: (name: string) => string;
  pos: Map<string, Pt>; // `${band}:${sha}` -> position
}

const laneVar = (i: number) => (i === 0 ? 'var(--lane-0)' : `var(--lane-${((i - 1) % 5) + 1})`);

/** Lay out the newest snapshots in two bands (laptop above, GitHub below), one lane per branch. */
export type Design = 'soft' | 'blueprint';

export function computeLayout(state: AppState, laneOrder: string[], design: Design = 'soft'): Layout {
  const s = state.snapshot;
  const commits = s ? s.commits.slice(0, MAX_COMMITS).reverse() : [];
  const byId = new Map(commits.map(c => [c.sha, c] as const));
  const colOf = new Map(commits.map((c, i) => [c.sha, i] as const));
  const remoteName = s ? (s.remotes.find(r => r.name === 'origin') ?? s.remotes[0])?.name : undefined;
  const locals = s?.refs.filter(r => r.kind === 'local') ?? [];
  const remotes = s?.refs.filter(r => r.kind === 'remote' && r.remote === remoteName) ?? [];
  const localTip = new Map(locals.map(r => [r.branch!, r.sha] as const));
  const tagsAt = new Map<string, string[]>();
  for (const r of s?.refs ?? []) if (r.kind === 'tag') tagsAt.set(r.sha, [...(tagsAt.get(r.sha) ?? []), r.short]);
  const remoteTip = new Map(remotes.map(r => [r.branch!, r.sha] as const));

  // stable lane order: default branch first, then branches in the order we first saw them
  const names = new Set<string>([...localTip.keys(), ...remoteTip.keys()]);
  if (s?.head.branch) names.add(s.head.branch);
  for (const n of names) if (!laneOrder.includes(n)) laneOrder.push(n);
  const def = s?.defaultBranch ?? 'main';
  const order = [def, ...laneOrder.filter(n => n !== def)].filter(n => names.has(n));

  // each snapshot belongs to the first branch (in lane order) whose first-parent chain reaches it
  const laneOf = new Map<string, string>();
  for (const b of order) {
    for (const tip of [localTip.get(b), remoteTip.get(b)]) {
      let sha = tip;
      while (sha && byId.has(sha) && !laneOf.has(sha)) { laneOf.set(sha, b); sha = byId.get(sha)!.parents[0]; }
    }
  }
  let other = false;
  for (const c of commits) if (!laneOf.has(c.sha)) { laneOf.set(c.sha, OTHER); other = true; }
  const lanes = other ? [...order, OTHER] : order;
  const laneIdx = new Map(lanes.map((n, i) => [n, i] as const));
  const colorIdx = (n: string) => (n === def ? 0 : laneOrder.indexOf(n) + 1);
  const laneColor = (n: string) => (n === OTHER ? 'var(--faint)' : laneVar(colorIdx(n)));

  const reach = (starts: (string | null | undefined)[]) => {
    const seen = new Set<string>(); const stack = starts.filter(Boolean) as string[];
    while (stack.length) { const x = stack.pop()!; if (seen.has(x) || !byId.has(x)) continue; seen.add(x); stack.push(...byId.get(x)!.parents); }
    return seen;
  };
  const localSet = reach([...localTip.values(), s?.head.sha]);
  const remoteSet = reach([...remoteTip.values()]);

  const L = Math.max(lanes.length, 1);
  const bandH = HEAD_H + 30 + (L - 1) * LANE_GAP + 30 + 62;
  const bands = { local: { y: 0, h: bandH }, remote: { y: bandH + SYNC_GAP, h: bandH, on: Boolean(remoteName) } };
  const X = (col: number) => X0 + col * COL;
  const Y = (band: Band, lane: string) => bands[band].y + HEAD_H + 30 + (laneIdx.get(lane) ?? 0) * LANE_GAP;

  const nodes: LNode[] = [], edges: LEdge[] = [], annos: LAnno[] = [], pills: LPill[] = [];
  const pos = new Map<string, Pt>();
  const lanesUsed: Record<Band, Set<string>> = { local: new Set(), remote: new Set() };
  const R = design === 'blueprint' ? 18 : 30; // node radius
  const edgePath = (a: Pt, b: Pt, early = true) => {
    const ax = a.x + R, bx = b.x - R;
    if (design === 'blueprint' && a.y !== b.y) {
      // metro style: straight runs with one rounded turn
      const r = 12, sy = Math.sign(b.y - a.y);
      const mx = early ? Math.min(ax + 30, bx - r) : Math.max(bx - 30, ax + r);
      return `M ${ax} ${a.y} H ${mx - r} Q ${mx} ${a.y} ${mx} ${a.y + sy * r} V ${b.y - sy * r} Q ${mx} ${b.y} ${mx + r} ${b.y} H ${bx}`;
    }
    if (a.y === b.y) return `M ${ax} ${a.y} L ${bx} ${b.y}`;
    const m = Math.max((bx - ax) / 2, 24);
    return `M ${ax} ${a.y} C ${ax + m} ${a.y} ${bx - m} ${b.y} ${bx} ${b.y}`;
  };

  for (const band of ['local', 'remote'] as Band[]) {
    const set = band === 'local' ? localSet : remoteSet;
    const otherSet = band === 'local' ? remoteSet : localSet;
    for (const c of commits) {
      if (!set.has(c.sha)) continue;
      const lane = laneOf.get(c.sha)!;
      const p = { x: X(colOf.get(c.sha)!), y: Y(band, lane) };
      pos.set(`${band}:${c.sha}`, p);
      lanesUsed[band].add(lane);
      nodes.push({ key: `${band}:${c.sha}`, band, sha: c.sha, ...p, color: laneColor(lane), commit: c, synced: otherSet.has(c.sha), lane, tags: band === 'local' ? tagsAt.get(c.sha) : undefined });
    }
    for (const c of commits) {
      if (!set.has(c.sha)) continue;
      c.parents.forEach((par, i) => {
        if (!set.has(par)) return;
        const color = laneColor(i === 0 ? laneOf.get(c.sha)! : laneOf.get(par)!);
        edges.push({ key: `${band}:${par}>${c.sha}`, d: edgePath(pos.get(`${band}:${par}`)!, pos.get(`${band}:${c.sha}`)!, i === 0), color });
      });
    }
    // branches whose tip is a snapshot owned by another lane get a ghost "no new snapshots" node
    const tips = band === 'local' ? localTip : remoteTip;
    for (const [b, tip] of tips) {
      if (laneOf.get(tip) === b) continue;
      const at = pos.get(`${band}:${tip}`);
      const p = { x: (at?.x ?? X(-0.6)) + COL, y: Y(band, b) };
      pos.set(`${band}:ghost:${b}`, p);
      lanesUsed[band].add(b);
      nodes.push({ key: `${band}:ghost:${b}`, band, sha: tip, ...p, color: laneColor(b), ghost: band === 'local' ? 'New branch, nothing new yet' : 'Nothing new on this branch', synced: false, lane: b });
      if (at) edges.push({ key: `${band}:sprout:${b}`, d: edgePath(at, p), color: laneColor(b), sprout: true });
    }
  }

  // unborn branch (git init, no commits yet)
  if (s && s.head.branch && !s.head.sha) {
    const b = s.head.branch;
    const p = { x: X(0), y: Y('local', b) };
    pos.set(`local:ghost:${b}`, p);
    lanesUsed.local.add(b);
    nodes.push({ key: `local:ghost:${b}`, band: 'local', sha: '', ...p, color: laneColor(b), ghost: 'Empty, no snapshots yet', synced: false, lane: b });
  }

  // where you are
  let head: Pt | null = null;
  if (s?.head.branch) head = pos.get(`local:ghost:${s.head.branch}`) ?? (s.head.sha ? pos.get(`local:${s.head.sha}`) ?? null : null);
  else if (s?.head.sha) head = pos.get(`local:${s.head.sha}`) ?? null;

  // lane labels
  for (const band of ['local', 'remote'] as Band[]) {
    for (const lane of lanes) if (lanesUsed[band].has(lane)) pills.push({ key: `${band}:${lane}`, band, name: lane, y: Y(band, lane), color: laneColor(lane) });
  }

  // badges + pull requests, placed right after each branch tip
  const tipX = (band: Band, b: string, sha?: string) => (pos.get(`${band}:ghost:${b}`) ?? (sha ? pos.get(`${band}:${sha}`) : undefined))?.x;
  if (remoteName) {
    for (const r of locals) {
      const b = r.branch!;
      const x = tipX('local', b, r.sha); if (x === undefined) continue;
      const up = r.upstream === `${remoteName}/${b}`;
      const n = up ? r.ahead ?? 0 : [...reach([r.sha])].filter(x2 => !remoteSet.has(x2)).length;
      if (n) annos.push({ key: `local:${b}`, x: x + 52, y: Y('local', b), badge: { text: `${n} not on GitHub`, tone: 'pending' }, prs: [] });
    }
    for (const r of remotes) {
      const b = r.branch!;
      const x = tipX('remote', b, r.sha); if (x === undefined) continue;
      const loc = locals.find(l => l.branch === b && l.upstream === `${remoteName}/${b}`);
      const n = loc ? loc.behind ?? 0 : 0;
      const prs = state.github.prs.filter(p => p.state === 'OPEN' && p.head === b);
      if (n || prs.length) annos.push({ key: `remote:${b}`, x: x + 52, y: Y('remote', b), badge: n ? { text: `${n} not on your laptop`, tone: 'gh' } : undefined, prs });
    }
  }

  const lastX = Math.max(0, ...nodes.map(n => n.x), X(0));
  return {
    width: lastX + 230, // room for the tip badge
    height: bands.remote.y + bandH,
    bands, syncY: bandH + SYNC_GAP / 2, pills, nodes, edges, annos, head,
    truncated: (s?.commits.length ?? 0) > MAX_COMMITS,
    laneColor, pos
  };
}
