# GitFlux explainer video

The 30-second video in the main README ([`docs/media/gitflux-explainer.mp4`](../docs/media/gitflux-explainer.mp4)), made with [Remotion](https://www.remotion.dev).

```bash
npm install
npx remotion studio                                              # preview and edit
npx remotion render GitFlux-Explainer out/gitflux-explainer.mp4    # render
```

| File | What it is |
|---|---|
| `src/scene1/timing.ts` | Every beat's frame number, in one place |
| `src/scene1/Scene1.tsx` | The story: the problem, GitFlux's map, the guard, the end card |
| `src/scene1/GitFluxWindow.tsx` | The GitFlux page, redrawn for the video |
| `src/scene1/SoundTrack.tsx` | Sound effects, each cued to a beat |
| `public/sfx/` | The sound effects, synthesized with [Earshot](https://github.com/Leonxlnx/earshot) |

Two key-press sounds were fitted from public-domain (CC0) recordings on Freesound: [one by zrrion](https://freesound.org/people/zrrion/sounds/665075/) and [one by bigmonmulgrew](https://freesound.org/people/bigmonmulgrew/sounds/378084/). Thank you.

Remotion has its own license: it's free for individuals and small teams, and larger companies need a company license to render it. See [remotion.dev/license](https://www.remotion.dev/license). The rendered video itself is part of this repository and covered by its MIT license.
