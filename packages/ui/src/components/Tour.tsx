import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Check, X } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';

/**
 * The "Start here" walkthrough: dims the page, spotlights one area at a time and
 * explains it in plain words. Steps whose area isn't on screen (no GitHub yet,
 * nothing needing attention) are skipped, so the tour always matches what you see.
 */

export interface TourStep { target?: string; title: string; body: ReactNode }

export const STEPS: TourStep[] = [
  { title: 'Welcome to GitFlux', body: <>GitFlux shows what happens to your project’s history, live: whether you make the change by hand or your AI agent does. This takes about a minute. Use the arrow keys or the buttons, and press Esc to leave. New to git? The <b>?</b> button has a plain-words rule book.</> },
  { target: 'status', title: 'Where you are right now', body: <>The branch you’re working on, how many edits aren’t saved yet, and whether GitFlux is watching. A <b>branch</b> is a separate line of work, so experiments don’t touch the main version.</> },
  { target: 'agent', title: 'What you asked, what it ran', body: <>Your prompts are the green <b>YOU</b> cards. Under each one are the exact git commands your agent ran and what they printed. Working by hand? Everything else still shows your own git changes.</> },
  { target: 'prompts', title: 'Find your own messages', body: <>Long session? This bar counts your prompts. The arrows jump to your previous or next one, and <b>Latest</b> takes you back to the newest message.</> },
  { target: 'guard', title: 'The guard', body: <>Before your agent runs a command that could destroy work, like a force push, GitFlux checks what would actually be lost and pauses it. <b>Ask</b> lets you decide, <b>Block</b> refuses it, <b>Off</b> just watches.</> },
  { target: 'laptop', title: 'Your laptop (Local)', body: <>The top band is your computer. Each tile is a <b>snapshot</b> (a commit): a saved version of your files. Time runs left to right, each row is a branch, and the branch names stay pinned to the left edge.</> },
  { target: 'github', title: 'GitHub (Cloud)', body: <>The purple-tinted band is GitHub: your backup, and what others see. When your agent uploads (pushes), snapshots travel down here. Downloads (pulls) travel up.</> },
  { target: 'node', title: 'Read a snapshot', body: <>The icon says what it was about: a fix, a new feature, a merge. The badge says where it lives: <b>green check</b> is safe on GitHub, <b>amber cloud</b> is only on your laptop. A blue chip under a tile is a version name (tag). Hover any tile for details.</> },
  { target: 'work', title: 'Is my work safe?', body: <>The answer in one line, then three counts: <b>Unsaved</b> (click it to see the files), <b>Not on GitHub</b> and <b>Only on GitHub</b>. Under <b>Next step</b> there’s a ready-made request: click to copy, then paste it to your agent.</> },
  { target: 'attention', title: 'Needs attention', body: <>Things that could cost you work, most serious first. Click a row to see why and how to fix it. Closing one with ✕ isn’t final: press <b>Undo</b>, or find it later under <b>Hidden</b>.</> },
  { target: 'activity', title: 'Activity, in plain English', body: <>Every change explained in a sentence, with which command caused it. It scrolls on its own, so everything above stays in view. Hover an icon to learn what that kind of action means.</> },
  { target: 'help', title: 'That’s it', body: <>Hover anything you’re unsure about for a short explanation. The <b>?</b> button has the map legend, the git rule book, and this tour whenever you want it again.</> }
];

const PAD = 8;
const CARD_W = 340;

const find = (t?: string) => (t ? document.querySelector<HTMLElement>(`[data-tour="${t}"]`) : null);

export function Tour({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const card = useRef<HTMLDivElement>(null);

  // only the steps whose area is on screen right now
  const [steps, setSteps] = useState<TourStep[]>([]);
  useLayoutEffect(() => {
    if (!open) return;
    setSteps(STEPS.filter(s => !s.target || find(s.target)));
    setI(0);
  }, [open]);
  const step = steps[i];
  const last = i === steps.length - 1;

  const measure = useCallback(() => {
    const el = find(step?.target);
    if (!el) { setRect(null); return; }
    // only real scroll areas; scrolling the map's clipped container would shift the whole map
    if (el.closest('.side-top, .side-feed, .log')) el.scrollIntoView({ block: 'nearest' });
    setRect(el.getBoundingClientRect());
  }, [step]);

  useLayoutEffect(() => { if (open) measure(); }, [open, measure]);
  useEffect(() => {
    if (!open) return;
    addEventListener('resize', measure);
    const t = setInterval(measure, 500); // the map re-lays out as snapshots arrive
    return () => { removeEventListener('resize', measure); clearInterval(t); };
  }, [open, measure]);

  useEffect(() => { if (open) card.current?.focus(); }, [open, i]);

  const finish = useCallback(() => {
    try { localStorage.setItem('gitflux-tour-done', '1'); } catch {}
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish();
      else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); last ? finish() : setI(n => n + 1); }
      else if (e.key === 'ArrowLeft') setI(n => Math.max(0, n - 1));
    };
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, [open, last, finish]);

  if (!open || !step) return null;

  // place the card beside the spotlight where it fits, else centre it
  const vw = innerWidth, vh = innerHeight;
  let pos: { left: number; top: number };
  if (!rect) pos = { left: (vw - CARD_W) / 2, top: vh / 2 - 120 };
  else if (rect.right + PAD + 16 + CARD_W < vw) pos = { left: rect.right + PAD + 16, top: rect.top };
  else if (rect.left - PAD - 16 - CARD_W > 0) pos = { left: rect.left - PAD - 16 - CARD_W, top: rect.top };
  else if (rect.bottom + 220 < vh) pos = { left: rect.left + rect.width / 2 - CARD_W / 2, top: rect.bottom + PAD + 14 };
  else pos = { left: rect.left + rect.width / 2 - CARD_W / 2, top: rect.top - PAD - 14 - 230 };
  pos.left = Math.min(Math.max(12, pos.left), vw - CARD_W - 12);
  pos.top = Math.min(Math.max(12, pos.top), vh - 250);

  return (
    <div className="tour" role="presentation">
      {rect
        ? <div className="tour-hole" style={{ left: rect.left - PAD, top: rect.top - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }} />
        : <div className="tour-dim" />}
      <div className="tour-card" ref={card} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="tour-t" aria-describedby="tour-b" style={{ left: pos.left, top: pos.top, width: CARD_W }}>
        <div className="tour-head">
          <span className="tour-count">{i + 1} of {steps.length}</span>
          <button type="button" className="tour-x" onClick={finish} aria-label="Close the tour"><X size={15} weight="bold" /></button>
        </div>
        <h2 id="tour-t">{step.title}</h2>
        <p id="tour-b">{step.body}</p>
        <div className="tour-foot">
          <div className="tour-dots" aria-hidden="true">{steps.map((_, k) => <i key={k} className={k === i ? 'on' : k < i ? 'done' : ''} />)}</div>
          <div className="tour-btns">
            {i > 0 && <Button variant="ghost" size="sm" onClick={() => setI(n => n - 1)}><ArrowLeft size={15} weight="bold" />Back</Button>}
            {i === 0 && <Button variant="ghost" size="sm" onClick={finish}>Skip</Button>}
            <Button size="sm" onClick={() => (last ? finish() : setI(n => n + 1))}>
              {last ? <>Done<Check size={15} weight="bold" /></> : <>Next<ArrowRight size={15} weight="bold" /></>}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export const tourSeen = () => { try { return localStorage.getItem('gitflux-tour-done') === '1'; } catch { return true; } };
