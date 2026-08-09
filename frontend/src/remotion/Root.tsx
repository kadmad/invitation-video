import React from "react";
import { Composition } from "remotion";
import GenericTemplate from "./compositions/GenericTemplate";

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="GenericTemplate"
      component={GenericTemplate as React.ComponentType<any>}
      durationInFrames={300}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={{
        videoUrl: null,
        width: 1080,
        height: 1920,
        textBlocks: [],
        tagValues: {},
        fontFamilies: {},
        defaultTextColor: "#FFFFFF",
      }}
    />
  );
};
