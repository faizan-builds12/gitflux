import { Easing, interpolate, useCurrentFrame } from "remotion";
import { C, mono, tl } from "../theme";

// What a real agent session prints while it works: far too fast to read.
const SESSION: { t: "cmd" | "out" | "you"; s: string }[] = [
  { t: "you", s: "› Build the checkout page and ship it" },
  { t: "cmd", s: "● Bash(git switch -c feature/checkout)" },
  { t: "out", s: "  Switched to a new branch 'feature/checkout'" },
  { t: "cmd", s: "● Bash(git add . && git commit -m \"feat: cart summary\")" },
  { t: "out", s: "  [feature/checkout 3f9a1c2] feat: cart summary" },
  { t: "out", s: "   4 files changed, 212 insertions(+)" },
  { t: "cmd", s: "● Bash(git commit -am \"feat: payment form\")" },
  { t: "out", s: "  [feature/checkout 8d21e07] feat: payment form" },
  { t: "cmd", s: "● Bash(git push -u origin feature/checkout)" },
  { t: "out", s: "  * [new branch] feature/checkout -> feature/checkout" },
  { t: "cmd", s: "● Bash(git switch main && git merge feature/checkout)" },
  { t: "out", s: "  Updating 51c0d4e..8d21e07  Fast-forward" },
  { t: "cmd", s: "● Bash(git stash && git pull --rebase)" },
  { t: "out", s: "  Saved working directory and index state WIP on main" },
  { t: "cmd", s: "● Bash(git reset --soft HEAD~1)" },
  { t: "cmd", s: "● Bash(git commit -m \"fix: totals rounding\")" },
  { t: "out", s: "  [main a1b2c3d] fix: totals rounding" },
  { t: "cmd", s: "● Bash(git rebase -i HEAD~3)" },
  { t: "out", s: "  Successfully rebased and updated refs/heads/main." },
  { t: "cmd", s: "● Bash(git branch -d feature/checkout)" },
  { t: "out", s: "  Deleted branch feature/checkout (was 8d21e07)." },
  { t: "cmd", s: "● Bash(git tag v0.4.0 && git push --tags)" },
  { t: "cmd", s: "● Bash(git cherry-pick 4e5f6a7)" },
  { t: "out", s: "  [main 9c8b7a6] chore: bump deps" },
  { t: "cmd", s: "● Bash(git restore --staged .env.local)" },
  { t: "cmd", s: "● Bash(git commit -am \"style: buttons\")" },
  { t: "out", s: "  [main 77aa11b] style: buttons" },
  { t: "cmd", s: "● Bash(git push origin main)" },
  { t: "out", s: "  ! [rejected]  main -> main (fetch first)" },
  { t: "out", s: "  error: failed to push some refs" },
  { t: "cmd", s: "● Bash(git fetch origin)" },
  { t: "out", s: "  51c0d4e..e4d3c2b  main -> origin/main" },
];
const DANGER = "● Bash(git push --force origin main)";
const LINES = [...SESSION, { t: "cmd" as const, s: DANGER }, { t: "out" as const, s: "" }, { t: "out" as const, s: "" }];
export const DANGER_INDEX = SESSION.length;
const LH = 44;

/**
 * The opening terminal. The stream races, then slows to a stop with the force push centred,
 * and everything except that line falls back into blur.
 */
export const TerminalStream: React.FC<{ height: number; focusFrom: number; stopAt: number }> = ({ height, focusFrom, stopAt }) => {
  const frame = useCurrentFrame();
  const end = DANGER_INDEX * LH - (height / 2 - LH / 2) + 20;
  const scroll = interpolate(frame, [0, stopAt], [-height * 0.6, end], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.2, 0.55, 0.25, 1),
  });
  const focus = tl(frame, [focusFrom, focusFrom + 24], [0, 1]);
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", fontFamily: mono, fontSize: 25 }}>
      {LINES.map((l, i) => {
        const y = i * LH - scroll;
        if (y < -LH * 2 || y > height + LH) return null;
        const isDanger = l.s === DANGER;
        // speed streaks: lines smear vertically while the stream is fast
        const speed = Math.max(0, 1 - frame / (stopAt * 0.85));
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: 40,
              right: 40,
              top: y,
              height: LH,
              display: "flex",
              alignItems: "center",
              whiteSpace: "pre",
              color: l.t === "cmd" ? C.termText : l.t === "you" ? "#6EE787" : C.termMuted,
              opacity: isDanger ? 1 : 1 - focus * 0.78,
              filter: `blur(${isDanger ? 0 : focus * 2.2 + speed * 1.4}px)`,
            }}
          >
            {isDanger ? (
              <span
                style={{
                  marginLeft: -14,
                  padding: "4px 14px",
                  borderRadius: 10,
                  color: "#fff",
                  background: `rgba(229,72,77,${0.22 * focus})`,
                  boxShadow: `0 0 0 ${2 * focus}px rgba(229,72,77,${0.8 * focus}), 0 0 ${40 * focus}px rgba(229,72,77,${0.45 * focus})`,
                  scale: `${1 + focus * 0.12}`,
                  transformOrigin: "left center",
                  display: "inline-block",
                }}
              >
                <span style={{ color: C.termCmd }}>● Bash</span>(git push <b style={{ color: "#FF8A8D" }}>--force</b> origin main)
                {/* the cursor waits: the command hasn't run yet */}
                <span style={{ display: "inline-block", width: 12, height: 26, marginLeft: 8, verticalAlign: -4, background: "#fff", opacity: Math.floor(frame / 15) % 2 ? 0.15 : 0.9 }} />
              </span>
            ) : (
              <>
                {l.t === "cmd" ? <><span style={{ color: C.termCmd }}>● Bash</span>{l.s.slice(6)}</> : l.s}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
};
