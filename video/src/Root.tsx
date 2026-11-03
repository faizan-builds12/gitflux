import { Composition } from "remotion";
import { Explainer } from "./explainer/Explainer";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="GitFlux-Explainer"
        component={Explainer}
        durationInFrames={930}
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  );
};
