import { useCurrentFrame } from "remotion";
import { sans, tl } from "../theme";

/**
 * Big type that arrives word by word: each word rises, sharpens from a blur and fades in,
 * 3 frames after the one before. Leaves the same way, all together.
 */
export const Headline: React.FC<{
  text: string;
  from: number;
  to: number;
  size?: number;
  color?: string;
  accent?: { word: string; color: string };
  weight?: number;
  style?: React.CSSProperties;
}> = ({ text, from, to, size = 112, color = "#F4F5F7", accent, weight = 700, style }) => {
  const frame = useCurrentFrame();
  const words = text.split(" ");
  const out = tl(frame, [to - 12, to], [0, 1]);
  return (
    <div
      style={{
        fontFamily: sans,
        fontSize: size,
        fontWeight: weight,
        lineHeight: 1.04,
        letterSpacing: "-0.035em",
        color,
        textWrap: "balance",
        opacity: 1 - out,
        translate: `0 ${-24 * out}px`,
        filter: `blur(${8 * out}px)`,
        ...style,
      }}
    >
      {words.map((w, i) => {
        const p = tl(frame, [from + i * 3, from + i * 3 + 22], [0, 1]);
        const isAccent = accent && w.replace(/[.,]/g, "") === accent.word;
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              marginRight: "0.24em",
              opacity: p,
              translate: `0 ${(1 - p) * 0.45}em`,
              filter: `blur(${(1 - p) * 10}px)`,
              color: isAccent ? accent!.color : undefined,
            }}
          >
            {w}
          </span>
        );
      })}
    </div>
  );
};
