import { CheckFat, CloudArrowUp, FolderSimple, GitCommit, GitMerge, GitPullRequest, GithubLogo, HandPalm, Laptop, Plant, Question, ShieldCheck, ShieldWarning, Sparkle, Sun, Terminal, User, Wrench, CloudArrowDown, NotePencil, Warning, ArrowsDownUp } from "@phosphor-icons/react";
import { useCurrentFrame } from "remotion";
import { C, mono, sans, tl } from "../theme";
import { Logo } from "./Logo";

// Window layout, in its own 1600 × 900 coordinates (the scene scales it).
export const WIN = { w: 1600, h: 900 };
export const AGENT = { x: 12, y: 72, w: 330, h: 816 };
const MAP = { x: 354, y: 72, w: 860, h: 816 };
const SIDE = { x: 1226, y: 72, w: 362, h: 816 };

const panel: React.CSSProperties = { position: "absolute", background: C.panel, borderRadius: 18, border: `1px solid ${C.line}`, boxShadow: "0 1px 2px rgba(17,20,28,.05), 0 10px 28px -14px rgba(17,20,28,.22)" };

/**
 * The story the window tells, in frames since the "how to read it" beat began (`build`):
 *   0–30    three snapshots land on the laptop (amber: not uploaded)
 *   44–78   an upload pill carries them down; GitHub's copies land, badges turn green
 *   104     a fix lands on the laptop, not uploaded
 *   118     a teammate's snapshot appears on GitHub only
 * Then `danger` / `safe` drive the force-push catch.
 */
export const B = { land: [0, 12, 24], upload: [44, 76], cloud: [74, 79, 84], fix: 104, mate: 118 };

type State = { danger: number; safe: number; build: number };

export const GitFluxWindow: React.FC<State & { reveal: number }> = ({ danger, safe, build, reveal }) => {
  const part = (i: number): React.CSSProperties => {
    const p = Math.min(1, Math.max(0, reveal * 1.6 - i * 0.18));
    return { opacity: p, translate: `0 ${(1 - p) * 28}px` };
  };
  return (
    <div style={{ position: "absolute", width: WIN.w, height: WIN.h, borderRadius: 26, background: "#ECEEF1", overflow: "hidden", fontFamily: sans, color: C.ink, boxShadow: "0 60px 140px -30px rgba(0,0,0,.75), 0 0 0 1px rgba(255,255,255,.08)" }}>
      <TopBar style={part(0)} />
      {/* agent panel slot: the terminal flies into this exact rectangle */}
      <div style={{ ...panel, left: AGENT.x, top: AGENT.y, width: AGENT.w, height: AGENT.h, background: C.term, border: 0, opacity: reveal > 0.98 ? 1 : 0 }} />
      <Map danger={danger} safe={safe} build={build} style={part(1)} />
      <Side danger={danger} safe={safe} build={build} style={part(2)} />
    </div>
  );
};

const TopBar: React.FC<{ style: React.CSSProperties }> = ({ style }) => (
  <div style={{ position: "absolute", left: 12, right: 12, top: 10, height: 52, display: "flex", gap: 10, ...style }}>
    <div style={{ ...panel, position: "relative", display: "flex", alignItems: "center", gap: 10, padding: "0 16px 0 8px" }}>
      <Logo size={36} />
      <b style={{ fontSize: 18 }}>Git<span style={{ color: "#1F9D4F" }}>Flux</span></b>
      <span style={{ width: 1, height: 22, background: "rgba(17,20,28,.15)", margin: "0 4px" }} />
      <FolderSimple size={19} weight="duotone" color={C.muted} />
      <span style={{ fontSize: 15, fontWeight: 600 }}>recipe-app</span>
    </div>
    <div style={{ ...panel, position: "relative", flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 16, fontSize: 15, color: C.muted }}>
      <span style={{ color: C.ok, fontWeight: 700, display: "flex", alignItems: "center", gap: 7 }}><i style={{ width: 8, height: 8, borderRadius: 4, background: C.ok }} />Watching</span>
      <span>You are on <b style={{ fontFamily: mono, fontWeight: 500, background: C.raised, padding: "2px 9px", borderRadius: 99, color: C.ink }}>● main</b></span>
    </div>
    <div style={{ ...panel, position: "relative", display: "flex", alignItems: "center", gap: 14, padding: "0 16px" }}>
      <Question size={21} weight="duotone" /><Sun size={21} weight="duotone" />
    </div>
  </div>
);

// ---------- the map ----------
const COLS = [210, 370, 530, 690];
const LOCAL_Y = 200, CLOUD_Y = 620;

/** A tile drops 16 px, grows from 88 % and fades in over 16 frames, like the product's own landing. */
const landStyle = (build: number, at: number): React.CSSProperties => {
  const p = tl(build, [at, at + 16], [0, 1]);
  return { opacity: p, translate: `0 ${(1 - p) * -16}px`, scale: `${0.88 + 0.12 * p}` };
};

const Tile: React.FC<{ x: number; y: number; icon: React.ReactNode; label: string; badge: "ok" | "pending" | "gh"; color?: string; style?: React.CSSProperties }> = ({ x, y, icon, label, badge, color = C.ink, style }) => (
  <div style={{ position: "absolute", left: x - 60, top: y - 33, width: 120, display: "flex", flexDirection: "column", alignItems: "center", ...style }}>
    <div style={{ position: "relative", width: 66, height: 66, borderRadius: 20, background: C.panel, border: `1px solid ${C.line}`, boxShadow: "0 1px 2px rgba(17,20,28,.05), 0 10px 24px -12px rgba(17,20,28,.3)", display: "grid", placeItems: "center", color }}>
      {icon}
      <span style={{ position: "absolute", top: -8, right: -8, width: 24, height: 24, borderRadius: 12, border: `2.5px solid ${C.frame}`, display: "grid", placeItems: "center", color: "#fff", background: badge === "ok" ? C.ok : badge === "pending" ? C.warnBright : C.pr }}>
        {badge === "ok" ? <CheckFat size={12} weight="fill" /> : badge === "pending" ? <CloudArrowUp size={13} weight="bold" /> : <GitMerge size={13} weight="bold" />}
      </span>
    </div>
    <span style={{ marginTop: 9, fontSize: 13.5, fontWeight: 600, textAlign: "center", lineHeight: 1.2 }}>{label}</span>
  </div>
);

const Map: React.FC<State & { style: React.CSSProperties }> = ({ danger, safe, build, style }) => {
  const frame = useCurrentFrame();
  const pulse = (Math.sin(frame / 4.5) + 1) / 2;
  const ringColor = safe > 0.5 ? C.ok : C.danger;
  const ringOn = Math.max(danger, safe);
  const tx = COLS[3], ty = CLOUD_Y;
  const uploaded = build >= B.cloud[0];
  const firstThree: [React.ReactNode, string][] = [[<Plant key="p" size={28} weight="duotone" />, "Scaffold recipe app"], [<Sparkle key="s" size={28} weight="duotone" />, "Add recipe list"], [<GitPullRequest key="g" size={28} weight="duotone" />, "Add login (#1)"]];
  // the upload pill: rises off the laptop, travels down, fades into GitHub
  const trip = tl(build, B.upload as [number, number], [0, 1]);
  const tripOn = build >= B.upload[0] - 2 && build <= B.upload[1] + 6 ? Math.min(tl(build, [B.upload[0], B.upload[0] + 6], [0, 1]), 1 - tl(build, [B.upload[1], B.upload[1] + 6], [0, 1])) : 0;
  // "You are here" follows the newest snapshot on the laptop
  const hereCol = build >= B.fix ? 3 : build >= B.land[2] ? 2 : build >= B.land[1] ? 1 : 0;
  const hereX = COLS[hereCol];
  const localLineEnd = build >= B.fix ? COLS[3] : build >= B.land[2] ? COLS[2] : build >= B.land[1] ? COLS[1] : COLS[0];
  const cloudLineEnd = build >= B.mate ? COLS[3] : build >= B.cloud[2] ? COLS[2] : build >= B.cloud[1] ? COLS[1] : COLS[0];
  return (
    <div style={{ position: "absolute", left: MAP.x, top: MAP.y, width: MAP.w, height: MAP.h, borderRadius: 18, border: `1px solid ${C.line}`, background: "#ECEEF1", backgroundImage: "radial-gradient(rgba(17,20,28,.12) 1.1px, transparent 1.2px)", backgroundSize: "22px 22px", overflow: "hidden", ...style }}>
      <div style={{ position: "absolute", left: 16, top: 16, width: MAP.w - 32, height: 360, borderRadius: 26, background: C.frame, border: "1px solid rgba(17,20,28,.07)" }} />
      <div style={{ position: "absolute", left: 16, top: 432, width: MAP.w - 32, height: 368, borderRadius: 26, background: "#F1EFF8", border: "1px solid rgba(109,40,217,.2)" }} />
      <BandHead y={36} icon={<Laptop size={21} weight="duotone" />} title="Your laptop" tag="Local" />
      <BandHead y={452} icon={<GithubLogo size={21} weight="fill" color="#fff" />} dark title="GitHub" tag="Cloud" />
      <div style={{ position: "absolute", left: 40, right: 40, top: 404, borderTop: "2px dashed rgba(91,98,112,.5)" }} />
      <div style={{ position: "absolute", left: 300, top: 389, padding: "5px 14px", borderRadius: 99, background: C.panel, border: "1px solid rgba(17,20,28,.15)", fontSize: 13, display: "flex", gap: 7, alignItems: "center" }}><ArrowsDownUp size={15} />Down is an upload (push), up is a download (pull)</div>
      {[LOCAL_Y, CLOUD_Y].map(y => <div key={y} style={{ position: "absolute", left: 36, top: y - 15, height: 30, padding: "0 12px", borderRadius: 99, background: C.panel, border: `1px solid ${C.line}`, display: "flex", alignItems: "center", gap: 7, fontFamily: mono, fontSize: 13 }}><i style={{ width: 7, height: 7, borderRadius: 4, background: C.ink }} />main</div>)}
      <svg width={MAP.w} height={MAP.h} style={{ position: "absolute", inset: 0 }}>
        {localLineEnd > COLS[0] && <line x1={COLS[0]} x2={localLineEnd} y1={LOCAL_Y} y2={LOCAL_Y} stroke={C.ink} strokeWidth={2.5} />}
        {uploaded && cloudLineEnd > COLS[0] && <line x1={COLS[0]} x2={cloudLineEnd} y1={CLOUD_Y} y2={CLOUD_Y} stroke={C.ink} strokeWidth={2.5} />}
      </svg>
      {firstThree.map(([icon, label], i) => (
        <Tile key={`l${i}`} x={COLS[i]} y={LOCAL_Y} icon={icon} label={label} badge={uploaded ? "ok" : "pending"} style={landStyle(build, B.land[i])} />
      ))}
      <Tile x={COLS[3]} y={LOCAL_Y} icon={<Wrench size={28} weight="duotone" />} label="Fix title" badge="pending" style={landStyle(build, B.fix)} />
      <div style={{ position: "absolute", left: hereX - 44, top: LOCAL_Y - 44, width: 88, height: 88, borderRadius: 26, border: `2px solid ${C.ink}`, opacity: tl(build, [B.land[0] + 6, B.land[0] + 18], [0, 1]) }}>
        <span style={{ position: "absolute", left: "50%", bottom: "calc(100% + 7px)", translate: "-50% 0", whiteSpace: "nowrap", padding: "3px 11px", borderRadius: 99, background: C.ink, color: "#fff", fontSize: 12, fontWeight: 700 }}>You are here</span>
      </div>
      {firstThree.map(([icon, label], i) => (
        <Tile key={`c${i}`} x={COLS[i]} y={CLOUD_Y} icon={icon} label={label} badge="ok" style={landStyle(build, B.cloud[i])} />
      ))}
      <Tile x={tx} y={ty} icon={<GitCommit size={28} weight="duotone" />} label="Teammate’s work" badge="gh" color={C.pr} style={landStyle(build, B.mate)} />
      {/* the upload */}
      <div style={{ position: "absolute", left: COLS[1], top: LOCAL_Y + 60 + trip * (CLOUD_Y - LOCAL_Y - 120), translate: "-50% -50%", opacity: tripOn, padding: "7px 16px", borderRadius: 99, background: C.ok, color: "#fff", fontFamily: mono, fontSize: 15, fontWeight: 500, boxShadow: "0 0 0 6px rgba(19,138,68,.16), 0 10px 24px -8px rgba(19,138,68,.6)", whiteSpace: "nowrap" }}>↓ 3 snapshots</div>
      {/* the snapshot a force push would erase */}
      <div style={{ position: "absolute", left: tx - 44, top: ty - 44, width: 88, height: 88, borderRadius: 27, border: `3px solid ${ringColor}`, opacity: ringOn, boxShadow: `0 0 0 ${safe > 0.5 ? 6 : 6 + pulse * 10}px ${safe > 0.5 ? "rgba(19,138,68,.18)" : `rgba(229,72,77,${0.28 - pulse * 0.18})`}`, scale: `${0.9 + ringOn * 0.1}` }} />
      <div style={{ position: "absolute", left: tx, top: ty + 76, translate: "-50% 0", opacity: ringOn, whiteSpace: "nowrap", padding: "6px 14px", borderRadius: 99, background: ringColor, color: "#fff", fontSize: 14, fontWeight: 700, display: "flex", gap: 7, alignItems: "center", boxShadow: "0 8px 20px -8px rgba(0,0,0,.4)" }}>
        {safe > 0.5 ? <><ShieldCheck size={16} weight="fill" />Safe on GitHub</> : <><Warning size={16} weight="fill" />Would be erased</>}
      </div>
    </div>
  );
};

const BandHead: React.FC<{ y: number; icon: React.ReactNode; title: string; tag: string; dark?: boolean }> = ({ y, icon, title, tag, dark }) => (
  <div style={{ position: "absolute", left: 36, top: y, display: "flex", alignItems: "center", gap: 11 }}>
    <span style={{ width: 40, height: 40, borderRadius: 13, display: "grid", placeItems: "center", background: dark ? C.ink : C.panel, border: dark ? 0 : `1px solid ${C.line}` }}>{icon}</span>
    <b style={{ fontSize: 17 }}>{title}</b>
    <span style={{ padding: "2px 8px", borderRadius: 99, fontFamily: mono, fontSize: 11, letterSpacing: ".06em", textTransform: "uppercase", background: dark ? C.prSoft : C.raised, color: dark ? C.pr : C.muted, fontWeight: 500 }}>{tag}</span>
  </div>
);

// ---------- right panel ----------
const Side: React.FC<State & { style: React.CSSProperties }> = ({ danger, safe, build, style }) => {
  const isSafe = safe > 0.5;
  const isDanger = danger > 0.2 && !isSafe;
  const uploaded = build >= B.cloud[0];
  const notOn = build >= B.fix ? 1 : uploaded ? 0 : build >= B.land[2] ? 3 : build >= B.land[1] ? 2 : build >= B.land[0] ? 1 : 0;
  const onlyOn = build >= B.mate ? 1 : 0;
  const split = notOn > 0 && onlyOn > 0;
  const head = isSafe ? { t: "Nothing was lost.", tone: "ok" } : isDanger ? { t: "Paused: force push to main on GitHub.", tone: "danger" }
    : split ? { t: "Your main and GitHub’s have split.", tone: "warn" } : uploaded && notOn === 0 ? { t: "All work is saved and on GitHub.", tone: "ok" }
    : { t: `${notOn} snapshot${notOn === 1 ? " is" : "s are"} not on GitHub yet.`, tone: "warn" };
  const col = head.tone === "ok" ? C.ok : head.tone === "danger" ? C.danger : C.warn;
  const bg = head.tone === "ok" ? C.okSoft : head.tone === "danger" ? C.dangerSoft : C.raised;
  const activity: [React.ReactNode, string, string][] = [];
  if (build >= B.mate) activity.push([<CloudArrowDown key="d" size={18} weight="duotone" />, "Downloaded 1 new snapshot on main from GitHub.", "#2459E0"]);
  if (uploaded) activity.push([<CloudArrowUp key="u" size={18} weight="duotone" />, "Uploaded 3 snapshots on main to GitHub.", C.ok]);
  if (build >= B.land[0]) activity.push([<GitCommit key="c" size={18} weight="duotone" />, "Saved a snapshot on main: “Scaffold recipe app”.", C.ink]);
  return (
    <div style={{ ...panel, left: SIDE.x, top: SIDE.y, width: SIDE.w, height: SIDE.h, padding: 18, ...style }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: C.muted, marginBottom: 12 }}>Your work</div>
      <div style={{ display: "flex", gap: 11, alignItems: "center", padding: "13px 14px", borderRadius: 15, background: bg }}>
        <span style={{ width: 38, height: 38, borderRadius: 12, display: "grid", placeItems: "center", background: "rgba(255,255,255,.7)", color: col, flex: "none" }}>
          {head.tone === "ok" ? <ShieldCheck size={22} weight="duotone" /> : head.tone === "danger" ? <ShieldWarning size={22} weight="duotone" /> : <Warning size={22} weight="duotone" />}
        </span>
        <b style={{ fontSize: 16, lineHeight: 1.3, color: isDanger ? C.danger : C.ink }}>{head.t}</b>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 7, marginTop: 7 }}>
        {[[<NotePencil key="a" size={16} />, "Unsaved", "0", C.ink], [<CloudArrowUp key="b" size={16} />, "Not on GitHub", String(notOn), notOn ? C.warn : C.ink], [<CloudArrowDown key="c" size={16} />, "Only on GitHub", String(onlyOn), onlyOn ? C.pr : C.ink]].map(([ic, k, v, c], i) => (
          <div key={i} style={{ padding: "10px 11px", borderRadius: 14, background: C.raised }}>
            <div style={{ fontSize: 12, color: C.muted, display: "flex", gap: 5, alignItems: "center" }}>{ic}{k}</div>
            <div style={{ fontSize: 26, fontWeight: 600, color: c as string, marginTop: 2 }}>{v}</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, color: C.muted, margin: "22px 0 10px" }}>Needs attention</div>
      {isDanger ? <AlertRow tone="danger" text="Paused: force push to main on GitHub" /> : split ? <AlertRow tone="warn" text="Your main and GitHub’s have split" /> : <div style={{ fontSize: 14, color: C.faint }}>Nothing needs you right now.</div>}
      <div style={{ fontSize: 14, fontWeight: 600, color: C.muted, margin: "24px 0 8px" }}>Activity</div>
      {activity.map(([ic, t, c], i) => (
        <div key={t} style={{ display: "flex", gap: 11, padding: "9px 4px", fontSize: 14, lineHeight: 1.4, fontWeight: 500, opacity: i === 0 ? 1 : 0.85 }}>
          <span style={{ width: 36, height: 36, borderRadius: 11, flex: "none", display: "grid", placeItems: "center", background: C.raised, color: c }}>{ic}</span>
          {t}
        </div>
      ))}
    </div>
  );
};

const AlertRow: React.FC<{ tone: "danger" | "warn"; text: string }> = ({ tone, text }) => (
  <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "9px 10px", borderRadius: 13, background: C.raised, marginBottom: 6, border: tone === "danger" ? "1px solid rgba(229,72,77,.35)" : "1px solid transparent" }}>
    <span style={{ width: 30, height: 30, borderRadius: 10, display: "grid", placeItems: "center", background: tone === "danger" ? C.dangerSoft : "rgba(234,138,0,.14)", color: tone === "danger" ? C.danger : C.warn }}>
      {tone === "danger" ? <ShieldWarning size={17} weight="duotone" /> : <Warning size={17} weight="duotone" />}
    </span>
    <span style={{ fontSize: 14, fontWeight: 600, color: tone === "danger" ? C.danger : C.ink }}>{text}</span>
  </div>
);

// ---------- agent panel contents (drawn inside the flying card) ----------
const Cmd: React.FC<{ cmd: string; out?: string; bad?: boolean; style?: React.CSSProperties }> = ({ cmd, out, bad, style }) => (
  <div style={{ fontFamily: mono, fontSize: 13.5, ...style }}>
    <div><Terminal size={14} color={C.termCmd} style={{ verticalAlign: -2, marginRight: 5 }} /><span style={{ color: C.termCmd }}>Bash</span> {cmd}</div>
    {out && <div style={{ marginTop: 5, paddingLeft: 12, borderLeft: "1px solid rgba(255,255,255,.12)", color: bad ? "#FF9A92" : C.termMuted, fontSize: 12.5 }}>{out}</div>}
  </div>
);

const You: React.FC<{ text: string; style?: React.CSSProperties }> = ({ text, style }) => (
  <div style={{ padding: "11px 13px", borderRadius: 14, background: "rgba(46,160,67,.10)", border: "1px solid rgba(46,160,67,.28)", boxShadow: `inset 3px 0 0 ${C.brand}`, ...style }}>
    <div style={{ fontSize: 12, fontWeight: 800, color: "#6EE787", letterSpacing: ".04em", display: "flex", gap: 5, alignItems: "center" }}><User size={13} weight="fill" />YOU</div>
    <div style={{ fontSize: 15.5, color: "#fff", marginTop: 3 }}>{text}</div>
  </div>
);

/** `build` tells the save-and-upload story; `force` (0..1) switches to the force-push story. */
export const AgentContent: React.FC<{ build: number; force: number; guardIn: number; safe: number }> = ({ build, force, guardIn, safe }) => {
  const frame = useCurrentFrame();
  const pulse = (Math.sin(frame / 4.5) + 1) / 2;
  const isSafe = safe > 0.5;
  const g = isSafe ? { c: "#86EFAC", bg: "rgba(134,239,172,.09)", bd: "rgba(134,239,172,.25)" } : { c: "#FCA5A5", bg: "rgba(252,165,165,.09)", bd: "rgba(252,165,165,.28)" };
  const show = (at: number): React.CSSProperties => { const p = tl(build, [at, at + 12], [0, 1]); return { opacity: p, translate: `0 ${(1 - p) * 10}px` }; };
  return (
    <div style={{ position: "absolute", inset: 0, fontFamily: sans, color: C.termText }}>
      <div style={{ padding: "18px 18px 12px", borderBottom: "1px solid rgba(255,255,255,.07)", display: "flex", justifyContent: "space-between", gap: 10 }}>
        <div style={{ minWidth: 0 }}><b style={{ fontSize: 17, color: "#fff", whiteSpace: "nowrap" }}>Your coding agent</b><div style={{ fontSize: 13, color: C.termMuted }}>Prompts and git commands</div></div>
        <span style={{ height: 24, padding: "0 10px", borderRadius: 99, background: "rgba(255,255,255,.06)", fontSize: 12, color: C.termMuted, display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap", flex: "none" }}><i style={{ width: 7, height: 7, borderRadius: 4, background: "#4ADE80" }} />AI agent</span>
      </div>
      {/* chapter 1: build and upload */}
      <div style={{ position: "absolute", left: 16, right: 16, top: 84, display: "flex", flexDirection: "column", gap: 12, opacity: 1 - force, translate: `0 ${force * -20}px` }}>
        <You text="Build a recipe app and put it on GitHub." />
        <Cmd cmd={'git commit -m "Scaffold recipe app"'} out="[main 3f9a1c2] Scaffold recipe app" style={show(B.land[0])} />
        <Cmd cmd={'git commit -am "Add recipe list"'} out="[main 8d21e07] Add recipe list" style={show(B.land[1])} />
        <Cmd cmd="git push -u origin main" out="main -> main" style={show(B.upload[0])} />
      </div>
      {/* chapter 2: the force push */}
      <div style={{ position: "absolute", left: 16, right: 16, top: 84, display: "flex", flexDirection: "column", gap: 12, opacity: force, translate: `0 ${(1 - force) * 20}px` }}>
        <You text="Ship the fix. Force it if you have to." />
        <Cmd cmd="git push origin main" out="! [rejected] main -> main (fetch first)" bad />
        <div style={{ opacity: guardIn, translate: `0 ${(1 - guardIn) * 24}px` }}>
          <div style={{ display: "flex", gap: 7, alignItems: "center", color: g.c, fontSize: 14, fontWeight: 700 }}>
            <span style={{ opacity: isSafe ? 1 : 0.65 + pulse * 0.35, display: "flex" }}>{isSafe ? <ShieldCheck size={18} weight="duotone" /> : <HandPalm size={18} weight="duotone" />}</span>
            {isSafe ? "Stopped. Nothing changed" : "Paused. Answer in your agent"}
          </div>
          <div style={{ fontFamily: mono, fontSize: 13.5, marginTop: 5 }}>git push --force origin main</div>
          <div style={{ marginTop: 8, padding: "10px 12px", borderRadius: 11, background: g.bg, border: `1px solid ${g.bd}`, fontSize: 13.5, lineHeight: 1.45 }}>
            <b style={{ color: "#fff" }}>Force push to main on GitHub.</b> Loses 1 snapshot on GitHub’s main that your laptop doesn’t have.
            <div style={{ color: C.termMuted, marginTop: 4 }}>Safer: pull main first and combine the work.</div>
          </div>
        </div>
      </div>
    </div>
  );
};
