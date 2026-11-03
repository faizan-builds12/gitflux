import { Composition } from "remotion";
import { Scene1 } from "./scene1/Scene1";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="GitFlux-Explainer"
        component={Scene1}
        durationInFrames={930}
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  );
};
