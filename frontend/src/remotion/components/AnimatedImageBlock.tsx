import { useCurrentFrame, useVideoConfig, interpolate, Img } from "remotion";
import type { ImageBlock } from "@/types";

interface AnimatedImageBlockProps {
  block: ImageBlock;
  imageUrl: string | null;
  videoWidth: number;
  videoHeight: number;
}

function getClipPath(shape: string): string {
  switch (shape) {
    case "circle":
      return "circle(50% at 50% 50%)";
    case "oval":
      return "ellipse(50% 40% at 50% 50%)";
    case "rounded_rect":
      return "inset(0 round 12%)";
    case "heart":
      return 'path("M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z")';
    case "diamond":
      return "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)";
    case "hexagon":
      return "polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)";
    case "arch":
      return "inset(0 0 0 0 round 50% 50% 0 0)";
    case "star":
      return "polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)";
    default:
      return "none";
  }
}

export default function AnimatedImageBlock({
  block,
  imageUrl,
  videoWidth,
  videoHeight,
}: AnimatedImageBlockProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const src = imageUrl || null;
  if (!src) return null;

  const x = block.position_x * videoWidth;
  const y = block.position_y * videoHeight;
  const w = block.width * videoWidth;
  const h = block.height * videoHeight;

  const startFrame = Math.round(block.start_time * fps);
  const endFrame = Math.round(block.end_time * fps);

  // Hide block outside its time range
  if (frame < startFrame || frame > endFrame) return null;

  // Entry animation
  let opacity = block.opacity;
  let scale = 1;

  switch (block.animation_type) {
    case "fade_in":
      opacity *= interpolate(frame, [startFrame, startFrame + fps * 0.5], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
      break;
    case "scale_in":
      scale = interpolate(frame, [startFrame, startFrame + fps * 0.5], [0.5, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
      opacity *= interpolate(frame, [startFrame, startFrame + fps * 0.3], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
      break;
  }

  // Ken Burns
  let kbScale = 1;
  let kbTranslateX = 0;
  let kbTranslateY = 0;

  if (block.ken_burns_enabled) {
    const progress = interpolate(frame, [startFrame, endFrame], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });

    switch (block.ken_burns_direction) {
      case "zoom_in":
        kbScale = interpolate(progress, [0, 1], [1, block.ken_burns_zoom]);
        break;
      case "zoom_out":
        kbScale = interpolate(progress, [0, 1], [block.ken_burns_zoom, 1]);
        break;
      case "pan_left":
        kbScale = block.ken_burns_zoom;
        kbTranslateX = interpolate(progress, [0, 1], [0, -w * 0.1]);
        break;
      case "pan_right":
        kbScale = block.ken_burns_zoom;
        kbTranslateX = interpolate(progress, [0, 1], [0, w * 0.1]);
        break;
    }
  }

  const clipPath = getClipPath(block.mask_shape);

  // Only show between start and end
  if (frame < startFrame || frame > endFrame) return null;

  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: w,
        height: h,
        opacity,
        transform: `scale(${scale})`,
        overflow: "hidden",
      }}
    >
      {/* Mask wrapper */}
      <div
        style={{
          width: "100%",
          height: "100%",
          clipPath: clipPath !== "none" ? clipPath : undefined,
          filter: block.mask_feather > 0 ? `blur(${block.mask_feather}px)` : undefined,
          overflow: "hidden",
        }}
      >
        {/* Image with Ken Burns */}
        <Img
          src={src}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            transform: `scale(${kbScale}) translate(${kbTranslateX}px, ${kbTranslateY}px)`,
          }}
        />
      </div>

      {/* Decorative frame overlay */}
      {block.frame_image_key && (
        <Img
          src={block.frame_image_key}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            objectFit: "contain",
            pointerEvents: "none",
          }}
        />
      )}
    </div>
  );
}
