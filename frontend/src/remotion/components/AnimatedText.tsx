import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { TemplateField } from "@/types";

interface AnimatedTextProps {
  field: TemplateField;
  text: string;
  fontFamily: string;
  videoWidth: number;
  videoHeight: number;
}

export default function AnimatedText({
  field,
  text,
  fontFamily,
  videoWidth,
  videoHeight,
}: AnimatedTextProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  if (!text) return null;

  const fontSize = field.font_size_ratio * videoHeight;
  const x = field.position_x * videoWidth;
  const y = field.position_y * videoHeight;
  const maxWidth = field.max_width * videoWidth;

  const startFrame = field.appear_frame;
  const endFrame = startFrame + field.duration_frames;

  let opacity = 1;
  let translateY = 0;
  let scale = 1;
  let displayText = text;

  switch (field.animation_type) {
    case "fade_in":
      opacity = interpolate(frame, [startFrame, endFrame], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
      break;

    case "slide_up":
      opacity = frame >= startFrame ? 1 : 0;
      translateY = interpolate(
        frame,
        [startFrame, endFrame],
        [fontSize * 2, 0],
        {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.out(Easing.cubic),
        }
      );
      break;

    case "typewriter": {
      opacity = frame >= startFrame ? 1 : 0;
      const progress = interpolate(
        frame,
        [startFrame, endFrame],
        [0, 1],
        {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        }
      );
      const charCount = Math.floor(progress * text.length);
      displayText = text.slice(0, charCount);
      break;
    }

    case "scale_pop":
      opacity = frame >= startFrame ? 1 : 0;
      scale = interpolate(frame, [startFrame, endFrame], [2, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: Easing.out(Easing.back(1.5)),
      });
      break;
  }

  const textAlignMap: Record<string, string> = {
    center: "center",
    left: "left",
    right: "right",
  };

  return (
    <div
      style={{
        position: "absolute",
        left: field.text_align === "center" ? x - maxWidth / 2 : x,
        top: y,
        width: maxWidth,
        fontSize,
        fontFamily,
        color: field.text_color,
        textAlign: textAlignMap[field.text_align] as any,
        opacity,
        transform: `translateY(${translateY}px) scale(${scale})`,
        whiteSpace: "pre-wrap",
        lineHeight: 1.2,
      }}
    >
      {displayText}
    </div>
  );
}
