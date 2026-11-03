import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { CloudArrowUp, Key, ShieldCheck, ChatText } from "@phosphor-icons/react";
import { C, mono, sans, tl, easeInOut } from "../theme";
import { Backdrop } from "./Backdrop";
import { Headline } from "./Headline";
import { TerminalStream } from "./Terminal";
import { AGENT, AgentContent, GitFluxWindow, WIN } from "./GitFluxWindow";
import { Logo } from "./Logo";
import { SoundTrack } from "./SoundTrack";
import { T } from "./timing";

export { T };

/**
 * GitFlux explainer, 31 s at 30 fps. Every timing lives in T so beats can be re-cut in one place.
 *   0–5      the problem: an agent's git commands stream by, too fast to read
 *   5–7.5    the threat: the stream stops on a force push
 *   7.5–10   enter GitFlux: the terminal flies into its agent panel
 *   10–15.5  how to read it: snapshots land on the laptop, an upload carries them to GitHub
 *   15.5–21.5 the catch: the guard pauses the force push; you say no; nothing is lost
 *   21.5–26  the safety net: what else it catches
 *   26–31    end card with the install command
 */


const S = 0.86;
const WX = (1920 - WIN.w * S) / 2;
const WY = 78;
const AGENT_RECT = { x: WX + AGENT.x * S, y: WY + AGENT.y * S, w: AGENT.w * S, h: AGENT.h * S };
const TERM_RECT = { x: 960, y: 176, w: 840, h: 728 };

export const Explainer: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const fly = spring({ frame: frame - T.fly, fps, config: { damping: 200, mass: 1.1, stiffness: 90 } });
  const lerp = (a: number, b: number) => a + (b - a) * fly;
  const card = { x: lerp(TERM_RECT.x, AGENT_RECT.x), y: lerp(TERM_RECT.y, AGENT_RECT.y), w: lerp(TERM_RECT.w, AGENT_RECT.w), h: lerp(TERM_RECT.h, AGENT_RECT.h) };
  const tilt = 1 - fly;

  const reveal = tl(frame, T.reveal as [number, number], [0, 1]);
  const build = frame - T.build;
  const force = tl(frame, T.force as [number, number], [0, 1]);
  const guardIn = tl(frame, [T.guard, T.guard + 28], [0, 1]);
  const safe = tl(frame, [T.safe, T.safe + 14], [0, 1]);
  const danger = tl(frame, [T.danger, T.danger + 28], [0, 1]) * (1 - safe);
  const alarm = Math.max(tl(frame, [T.threat[0] + 6, T.threat[0] + 36], [0, 0.85]) * (1 - tl(frame, [T.fly, T.fly + 34], [0, 1])), danger * 0.45);

  // camera: drift in on the catch, pull back and soften for the safety net and end card
  const push = tl(frame, T.push as [number, number], [1, 1.045], easeInOut);
  const outro = tl(frame, [T.net, T.net + 34], [0, 1]);
  const camScale = push * (1 - outro * 0.1);

  return (
    <AbsoluteFill style={{ fontFamily: sans }}>
      <Backdrop alarm={alarm} />

      {/* ---------- the problem ---------- */}
      <div style={{ position: "absolute", left: 130, top: 250, width: 780 }}>
        <Headline text="Your AI agent runs dozens of git commands." from={T.problem[0]} to={T.problem[1]} size={92} />
        <Headline text="You never see them." from={T.problem[0] + 46} to={T.problem[1]} size={92} color="rgba(244,245,247,.42)" style={{ marginTop: 18 }} />
      </div>
      <div style={{ position: "absolute", left: 130, top: 300, width: 780 }}>
        <Headline text="One of them can quietly erase your work." from={T.threat[0]} to={T.threat[1]} size={92} accent={{ word: "erase", color: "#FF6B6F" }} />
      </div>

      {/* ---------- GitFlux, plus the card that flies into it ---------- */}
      <AbsoluteFill style={{ scale: `${camScale}`, transformOrigin: "50% 46%", filter: `blur(${outro * 12}px)`, opacity: 1 - outro * 0.6 }}>
        <div style={{ position: "absolute", left: WX, top: WY, width: WIN.w, height: WIN.h, scale: `${S}`, transformOrigin: "0 0", opacity: reveal, translate: `0 ${(1 - reveal) * 40}px` }}>
          <GitFluxWindow danger={danger} safe={safe} build={build} reveal={reveal} />
        </div>
        <div
          style={{
            position: "absolute", left: card.x, top: card.y, width: card.w, height: card.h,
            borderRadius: lerp(22, 18 * S), background: C.term, overflow: "hidden",
            boxShadow: `0 ${50 * tilt + 10}px ${120 * tilt + 30}px -20px rgba(0,0,0,${0.7 * tilt + 0.25}), 0 0 0 1px rgba(255,255,255,${0.08 * tilt + 0.02})`,
            transform: `perspective(1600px) rotateY(${-9 * tilt}deg) rotateX(${4 * tilt}deg)`,
            opacity: tl(frame, [0, 14], [0, 1]),
          }}
        >
          <div style={{ position: "absolute", inset: 0, opacity: 1 - tl(frame, [T.fly + 4, T.fly + 34], [0, 1]) }}>
            <div style={{ height: 52, display: "flex", alignItems: "center", gap: 9, padding: "0 20px", borderBottom: "1px solid rgba(255,255,255,.07)" }}>
              {["#FF5F57", "#FEBC2E", "#28C840"].map(c => <i key={c} style={{ width: 13, height: 13, borderRadius: 7, background: c }} />)}
              <span style={{ marginLeft: 14, fontFamily: mono, fontSize: 16, color: C.termMuted }}>agent — recipe-app</span>
            </div>
            <div style={{ position: "absolute", top: 52, left: 0, right: 0, bottom: 0 }}>
              <TerminalStream height={TERM_RECT.h - 52} focusFrom={T.threat[0] + 2} stopAt={T.threat[0] + 15} />
            </div>
          </div>
          <div style={{ position: "absolute", left: 0, top: 0, width: AGENT.w, height: AGENT.h, scale: `${card.w / AGENT.w}`, transformOrigin: "0 0", opacity: tl(frame, [T.fly + 24, T.fly + 52], [0, 1]) }}>
            <AgentContent build={build} force={force} guardIn={guardIn} safe={safe} />
          </div>
        </div>
        <PermissionPrompt />
      </AbsoluteFill>

      {/* ---------- captions: one plain sentence per beat ---------- */}
      <Caption from={T.reveal[0] + 8} to={T.build - 4} text="GitFlux shows every git step, live." />
      <Caption from={T.build + 2} to={T.build + 78} text="Your laptop on top. GitHub below." />
      <Caption from={T.build + 82} to={T.force[0] + 14} text="Every save and upload, drawn as it happens." />
      <Caption from={T.guard + 4} to={T.prompt + 4} text="Before a risky command runs, GitFlux checks what it would erase." />
      <Caption from={T.prompt + 8} to={T.safe - 4} text="Your agent asks you. GitFlux shows what’s at stake." />
      <Caption from={T.safe} to={T.net - 2} text="You say no. Nothing is lost." color="#86EFAC" />

      <SafetyNet />
      <EndCard />
      <SoundTrack />
    </AbsoluteFill>
  );
};

/** The agent's permission question, answered "No". */
const PermissionPrompt: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame: frame - T.prompt, fps, config: { damping: 18, stiffness: 140 } });
  const leave = tl(frame, [T.safe + 10, T.safe + 26], [0, 1]);
  const onNo = frame >= T.choose;
  const press = frame >= T.press && frame < T.press + 8 ? 0.97 : 1;
  if (frame < T.prompt - 6 || frame > T.safe + 28) return null;
  return (
    <div style={{ position: "absolute", left: 610, top: 250, width: 560, padding: "22px 24px", borderRadius: 20, background: "rgba(17,19,24,.94)", border: "1px solid rgba(255,255,255,.1)", boxShadow: "0 40px 90px -20px rgba(0,0,0,.8)", fontFamily: sans, color: C.termText, opacity: enter * (1 - leave), scale: `${(0.92 + enter * 0.08) * press}`, translate: `0 ${(1 - enter) * 30 + leave * 14}px` }}>
      <div style={{ fontSize: 15, color: C.termMuted, fontWeight: 600 }}>Your agent wants to run</div>
      <div style={{ fontFamily: mono, fontSize: 21, margin: "8px 0 16px", color: "#fff" }}>git push <span style={{ color: "#FF8A8D" }}>--force</span> origin main</div>
      <div style={{ fontSize: 17, marginBottom: 10 }}>Do you want to proceed?</div>
      {["Yes", "No, and tell it what to do instead"].map((o, i) => {
        const sel = onNo ? i === 1 : i === 0;
        return (
          <div key={o} style={{ display: "flex", gap: 10, alignItems: "center", padding: "10px 14px", borderRadius: 12, marginTop: 6, background: sel ? (i === 1 ? "rgba(134,239,172,.12)" : "rgba(255,255,255,.07)") : "transparent", border: `1px solid ${sel ? (i === 1 ? "rgba(134,239,172,.35)" : "rgba(255,255,255,.14)") : "transparent"}`, fontSize: 17, color: sel ? "#fff" : C.termMuted }}>
            <span style={{ fontFamily: mono, opacity: 0.7 }}>{sel ? "›" : " "}</span>{i + 1}. {o}
          </div>
        );
      })}
    </div>
  );
};

const Caption: React.FC<{ from: number; to: number; text: string; color?: string }> = ({ from, to, text, color = "#F4F5F7" }) => {
  const frame = useCurrentFrame();
  if (frame < from - 2 || frame > to + 2) return null;
  return (
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 44, display: "flex", justifyContent: "center" }}>
      {/* the pill fades with its words, so an empty pill never lingers between captions */}
      <div style={{ padding: "14px 30px", borderRadius: 999, background: "rgba(7,8,11,.62)", backdropFilter: "blur(16px)", border: "1px solid rgba(255,255,255,.08)", opacity: Math.min(tl(frame, [from - 2, from + 10], [0, 1]), 1 - tl(frame, [to - 12, to], [0, 1])), scale: `${0.96 + 0.04 * tl(frame, [from - 2, from + 14], [0, 1])}` }}>
        <Headline text={text} from={from} to={to} size={44} weight={600} color={color} style={{ letterSpacing: "-0.02em", whiteSpace: "nowrap" }} />
      </div>
    </div>
  );
};

/** Three things it also catches, as cards that rise in one after another. */
const SafetyNet: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (frame < T.net || frame > T.end + 16) return null;
  const leave = tl(frame, [T.end - 8, T.end + 12], [0, 1]);
  const cards: [React.ReactNode, string, string, string][] = [
    [<Key key="k" size={34} weight="duotone" />, "Secrets caught", "A password file saved by mistake is flagged before it’s uploaded.", "#FF6B6F"],
    [<ChatText key="c" size={34} weight="duotone" />, "Plain English", "Every git action explained in a sentence, with the command that did it.", "#7AA2FF"],
    [<CloudArrowUp key="u" size={34} weight="duotone" />, "Always backed up?", "One glance says what isn’t on GitHub yet, and what to ask your agent.", "#4ADE80"],
  ];
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column", opacity: 1 - leave, filter: `blur(${leave * 10}px)` }}>
      <Headline text="It also catches the mistakes you can’t see." from={T.net + 6} to={T.end + 4} size={70} style={{ textAlign: "center", marginBottom: 54 }} />
      <div style={{ display: "flex", gap: 28 }}>
        {cards.map(([icon, title, body, color], i) => {
          const p = spring({ frame: frame - (T.net + 22 + i * 12), fps, config: { damping: 16, stiffness: 120 } });
          return (
            <div key={title} style={{ width: 440, padding: "30px 30px 32px", borderRadius: 28, background: "rgba(22,23,27,.78)", border: "1px solid rgba(255,255,255,.1)", boxShadow: "0 30px 70px -30px rgba(0,0,0,.8)", backdropFilter: "blur(14px)", opacity: p, translate: `0 ${(1 - p) * 60}px`, scale: `${0.94 + p * 0.06}` }}>
              <div style={{ width: 64, height: 64, borderRadius: 20, display: "grid", placeItems: "center", background: `${color}22`, color }}>{icon}</div>
              <div style={{ marginTop: 22, fontSize: 38, fontWeight: 700, color: "#fff", letterSpacing: "-0.02em" }}>{title}</div>
              <div style={{ marginTop: 10, fontSize: 26, lineHeight: 1.4, color: "rgba(244,245,247,.7)" }}>{body}</div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

const EndCard: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (frame < T.end) return null;
  const pop = spring({ frame: frame - (T.end + 4), fps, config: { damping: 14, stiffness: 120 } });
  const word = tl(frame, [T.end + 14, T.end + 44], [0, 1]);
  const tag = tl(frame, [T.end + 28, T.end + 58], [0, 1]);
  const cmd = tl(frame, [T.end + 46, T.end + 76], [0, 1]);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column", background: `rgba(7,8,11,${tl(frame, [T.end, T.end + 28], [0, 0.6])})` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 34 }}>
        <div style={{ scale: `${pop}`, rotate: `${interpolate(pop, [0, 1], [-14, 0])}deg`, filter: "drop-shadow(0 20px 40px rgba(46,160,67,.35))" }}><Logo size={150} /></div>
        <div style={{ fontSize: 168, fontWeight: 800, letterSpacing: "-0.045em", color: "#fff", opacity: word, translate: `${(1 - word) * -30}px 0`, filter: `blur(${(1 - word) * 12}px)` }}>Git<span style={{ color: "#3DDC6B" }}>Flux</span></div>
      </div>
      <div style={{ marginTop: 22, fontSize: 52, fontWeight: 500, color: "rgba(244,245,247,.78)", letterSpacing: "-0.02em", opacity: tag, translate: `0 ${(1 - tag) * 20}px` }}>See what happens to your git, live.</div>
      <div style={{ marginTop: 40, display: "flex", alignItems: "center", gap: 14, padding: "16px 26px", borderRadius: 18, background: "rgba(17,19,24,.9)", border: "1px solid rgba(255,255,255,.12)", fontFamily: mono, fontSize: 30, color: "#fff", opacity: cmd, translate: `0 ${(1 - cmd) * 16}px` }}>
        <span style={{ color: C.termCmd, fontFamily: sans, fontWeight: 600 }}>By hand or with your AI agent</span>
      </div>
      <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 8, fontSize: 24, color: "rgba(244,245,247,.6)", opacity: tl(frame, [T.end + 66, T.end + 92], [0, 1]) }}>
        <ShieldCheck size={22} weight="duotone" />Free and open source. Runs on your computer.
      </div>
    </AbsoluteFill>
  );
};
