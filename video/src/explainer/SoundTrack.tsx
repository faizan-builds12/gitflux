import { Audio } from "@remotion/media";
import { Sequence, staticFile, useVideoConfig } from "remotion";
import { T } from "./timing";

/**
 * Sound effects made in code with earshot (github.com/Leonxlnx/earshot), rendered into public/sfx/.
 * Each cue names the frame the sound should *land* on; `peak` is earshot's measured time to the
 * sound's peak, so it starts early by that much and hits on the picture instead of after it.
 */
type Cue = { file: string; at: number; peak: number; vol: number };

const KEYS = [18, 27, 33, 41, 46, 55, 61, 70, 78, 84, 95, 104, 116, 131];

const CUES: Cue[] = [
  // the problem: sparse key presses under the command stream
  ...KEYS.map((at, i): Cue => ({ file: i % 2 ? "fit_key_medium" : "fit_key_lubed", at, peak: i % 2 ? 0.103 : 0.075, vol: 0.32 - i * 0.012 })),
  { file: "ui_pop_soft", at: T.problem[0] + 2, peak: 0.042, vol: 0.35 },
  // the threat: the stream slams to a stop on the force push
  { file: "cut_hit_sub", at: T.threat[0] + 15, peak: 0.021, vol: 0.9 },
  { file: "glitch_mid", at: T.threat[0] + 17, peak: 0.038, vol: 0.28 },
  // enter GitFlux: the terminal lands in its panel
  { file: "whoosh_big_thump_airy", at: T.fly + 26, peak: 0.153, vol: 0.7 },
  // how to read it: snapshots land, an upload carries them down, GitHub's copies land
  { file: "knock_wood", at: T.build + 8, peak: 0.015, vol: 0.55 },
  { file: "knock_wood", at: T.build + 20, peak: 0.015, vol: 0.55 },
  { file: "knock_wood", at: T.build + 32, peak: 0.015, vol: 0.55 },
  { file: "whoosh_fast_tight", at: T.build + 58, peak: 0.162, vol: 0.55 },
  { file: "ui_pop_blip", at: T.build + 80, peak: 0.017, vol: 0.45 },
  { file: "ui_pop_blip", at: T.build + 85, peak: 0.017, vol: 0.45 },
  { file: "ui_pop_blip", at: T.build + 90, peak: 0.017, vol: 0.45 },
  { file: "knock_plastic", at: T.build + 110, peak: 0.052, vol: 0.5 },
  { file: "drip_plink", at: T.build + 124, peak: 0.03, vol: 0.4 },
  // the catch
  { file: "glitch_mid", at: T.guard + 6, peak: 0.038, vol: 0.45 },
  { file: "riser_dark", at: T.prompt, peak: 0.697, vol: 0.45 },
  { file: "ui_pop_wide", at: T.prompt + 4, peak: 0.044, vol: 0.5 },
  { file: "hover_tick_detent", at: T.choose, peak: 0.004, vol: 0.6 },
  { file: "click_thock", at: T.press, peak: 0.004, vol: 0.8 },
  { file: "mallet_up4", at: T.safe + 2, peak: 0.336, vol: 0.38 },
  // the safety net
  { file: "whoosh_fast_reverse", at: T.net + 12, peak: 0.294, vol: 0.5 },
  { file: "ui_pop_step", at: T.net + 30, peak: 0.044, vol: 0.4 },
  { file: "ui_pop_step", at: T.net + 42, peak: 0.044, vol: 0.4 },
  { file: "ui_pop_step", at: T.net + 54, peak: 0.044, vol: 0.4 },
  // end card
  { file: "logo_sting_soft_bloom", at: T.end + 10, peak: 0.298, vol: 0.6 },
  { file: "click_soft", at: T.end + 52, peak: 0.004, vol: 0.5 },
];

export const SoundTrack: React.FC = () => {
  const { fps } = useVideoConfig();
  return (
    <>
      {CUES.map((c, i) => (
        <Sequence key={i} name={c.file} from={Math.max(0, c.at - Math.round(c.peak * fps))} layout="none">
          <Audio src={staticFile(`sfx/${c.file}.wav`)} volume={c.vol} />
        </Sequence>
      ))}
    </>
  );
};
