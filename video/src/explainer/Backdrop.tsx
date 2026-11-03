import { AbsoluteFill, useCurrentFrame } from "remotion";
import { C } from "../theme";

/**
 * The stage: near-black with two slow-drifting coloured glows (GitHub green and the
 * product's GitHub purple) and fine grain, so flat UI sits in a lit space instead of on a void.
 */
export const Backdrop: React.FC<{ alarm?: number }> = ({ alarm = 0 }) => {
  const frame = useCurrentFrame();
  const t = frame / 30;
  return (
    <AbsoluteFill style={{ backgroundColor: C.night, overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          width: 1400,
          height: 1400,
          left: -300 + Math.sin(t * 0.35) * 80,
          top: -650 + Math.cos(t * 0.3) * 60,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(46,160,67,.22), rgba(46,160,67,0) 62%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          width: 1500,
          height: 1500,
          right: -500 + Math.cos(t * 0.28) * 90,
          bottom: -800 + Math.sin(t * 0.32) * 70,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(109,40,217,.26), rgba(109,40,217,0) 60%)",
        }}
      />
      {/* red wash while something dangerous is on screen */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: alarm,
          background: "radial-gradient(ellipse at 50% 55%, rgba(229,72,77,.20), rgba(229,72,77,0) 65%)",
        }}
      />
      {/* film grain keeps large gradients from banding and looking synthetic */}
      <svg width="100%" height="100%" style={{ position: "absolute", inset: 0, opacity: 0.07, mixBlendMode: "overlay" }}>
        <filter id="grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed={Math.floor(frame / 2) % 8} stitchTiles="stitch" />
        </filter>
        <rect width="100%" height="100%" filter="url(#grain)" />
      </svg>
      {/* vignette */}
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(0,0,0,.55) 100%)" }} />
    </AbsoluteFill>
  );
};
