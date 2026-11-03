import { Easing, interpolate } from "remotion";
import { loadFont as loadUrbanist } from "@remotion/google-fonts/Urbanist";
import { loadFont as loadGeistMono } from "@remotion/google-fonts/GeistMono";

// GitFlux's own typefaces and palette, so the video looks like the product, not a mock-up of it.
export const sans = loadUrbanist("normal", { weights: ["400", "500", "600", "700", "800"], subsets: ["latin"] }).fontFamily;
export const mono = loadGeistMono("normal", { weights: ["400", "500"], subsets: ["latin"] }).fontFamily;

export const C = {
  night: "#07080B",
  ink: "#11141C",
  panel: "#FFFFFF",
  frame: "#F6F7F9",
  raised: "#F3F4F6",
  line: "rgba(17,20,28,.08)",
  muted: "#5B6270",
  faint: "#8C929D",
  term: "#111318",
  termText: "#E6E8EC",
  termMuted: "#8D93A0",
  termCmd: "#7EE2A8",
  brand: "#2EA043",
  ok: "#138A44",
  okSoft: "rgba(19,138,68,.12)",
  warn: "#A85A00",
  warnBright: "#F59E0B",
  danger: "#E5484D",
  dangerSoft: "rgba(229,72,77,.14)",
  pr: "#6D28D9",
  prSoft: "rgba(109,40,217,.10)",
  laneBlue: "#2563EB",
};

/** GitFlux's motion curve: fast out, long settle. */
export const ease = Easing.bezier(0.16, 1, 0.3, 1);
export const easeInOut = Easing.bezier(0.65, 0, 0.35, 1);

/** Clamped interpolation with GitFlux's easing (or another curve). */
export const tl = (
  frame: number,
  input: [number, number],
  output: [number, number],
  easing: (t: number) => number = ease,
) =>
  interpolate(frame, input, output, {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing,
  });
