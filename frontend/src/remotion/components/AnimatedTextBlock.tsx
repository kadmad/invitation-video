import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { TextBlock } from "@/types";

interface AnimatedTextBlockProps {
  block: TextBlock;
  tagValues: Record<string, string>;
  fontFamilies: Record<string, string>;
  videoWidth: number;
  videoHeight: number;
  textColorOverrides?: Record<string, string>;
  defaultTextColor?: string;
  defaultFontFamily?: string;
  overrideFontFamily?: string;
}

interface AnimState {
  opacity: number;
  translateX: number;
  translateY: number;
  scale: number;
  rotate: number;
  blur: number;
  letterSpacing: number;
  clipPath?: string;
  displayText?: string;
}

const CLAMP = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };

/** Apply entry animation — modifies state in place */
function applyEntryAnim(
  s: AnimState,
  type: string,
  frame: number,
  inStart: number,
  inEnd: number,
  fontSize: number,
  maxWidth: number,
  text: string,
) {
  if (type === "none" || frame >= inEnd) return; // fully visible, no entry anim needed

  const midFrame = inStart + Math.round((inEnd - inStart) * 0.6);

  switch (type) {
    case "fade_in":
      s.opacity = interpolate(frame, [inStart, inEnd], [0, 1], CLAMP);
      break;

    case "fade_up":
      s.opacity = interpolate(frame, [inStart, inEnd], [0, 1], CLAMP);
      s.translateY = interpolate(frame, [inStart, inEnd], [fontSize * 1.5, 0], {
        ...CLAMP, easing: Easing.out(Easing.cubic),
      });
      break;

    case "fade_down":
      s.opacity = interpolate(frame, [inStart, inEnd], [0, 1], CLAMP);
      s.translateY = interpolate(frame, [inStart, inEnd], [-fontSize * 1.5, 0], {
        ...CLAMP, easing: Easing.out(Easing.cubic),
      });
      break;

    case "slide_up":
      s.translateY = interpolate(frame, [inStart, inEnd], [fontSize * 2, 0], {
        ...CLAMP, easing: Easing.out(Easing.cubic),
      });
      break;

    case "slide_down":
      s.translateY = interpolate(frame, [inStart, inEnd], [-fontSize * 2, 0], {
        ...CLAMP, easing: Easing.out(Easing.cubic),
      });
      break;

    case "slide_left":
      s.translateX = interpolate(frame, [inStart, inEnd], [maxWidth, 0], {
        ...CLAMP, easing: Easing.out(Easing.cubic),
      });
      break;

    case "slide_right":
      s.translateX = interpolate(frame, [inStart, inEnd], [-maxWidth, 0], {
        ...CLAMP, easing: Easing.out(Easing.cubic),
      });
      break;

    case "scale_pop":
      s.scale = interpolate(frame, [inStart, inEnd], [2, 1], {
        ...CLAMP, easing: Easing.out(Easing.back(1.5)),
      });
      break;

    case "scale_in":
      s.opacity = interpolate(frame, [inStart, inEnd], [0, 1], CLAMP);
      s.scale = interpolate(frame, [inStart, inEnd], [0.5, 1], {
        ...CLAMP, easing: Easing.out(Easing.cubic),
      });
      break;

    case "typewriter": {
      const progress = interpolate(frame, [inStart, inEnd], [0, 1], CLAMP);
      s.displayText = text.slice(0, Math.floor(progress * text.length));
      break;
    }

    case "reveal_up": {
      const pct = interpolate(frame, [inStart, inEnd], [0, 1], {
        ...CLAMP, easing: Easing.out(Easing.cubic),
      });
      s.clipPath = pct >= 1 ? undefined : `inset(${(1 - pct) * 100}% 0 -20% 0)`;
      break;
    }

    case "reveal_down": {
      const pct = interpolate(frame, [inStart, inEnd], [0, 1], {
        ...CLAMP, easing: Easing.out(Easing.cubic),
      });
      s.clipPath = pct >= 1 ? undefined : `inset(-20% 0 ${(1 - pct) * 100}% 0)`;
      break;
    }

    case "blur_in":
      s.opacity = interpolate(frame, [inStart, inEnd], [0, 1], CLAMP);
      s.blur = interpolate(frame, [inStart, inEnd], [20, 0], CLAMP);
      break;

    case "letter_spacing":
      s.opacity = interpolate(frame, [inStart, inEnd], [0, 1], CLAMP);
      s.letterSpacing = interpolate(frame, [inStart, inEnd], [fontSize * 0.8, 0], {
        ...CLAMP, easing: Easing.out(Easing.cubic),
      });
      break;

    case "bounce_in":
      s.scale = interpolate(frame, [inStart, midFrame, inEnd], [0, 1.15, 1], {
        ...CLAMP, easing: Easing.out(Easing.cubic),
      });
      s.translateY = interpolate(frame, [inStart, midFrame, inEnd], [fontSize * 2, -fontSize * 0.2, 0], {
        ...CLAMP, easing: Easing.out(Easing.cubic),
      });
      break;

    case "rotate_in":
      s.opacity = interpolate(frame, [inStart, inEnd], [0, 1], CLAMP);
      s.rotate = interpolate(frame, [inStart, inEnd], [-15, 0], {
        ...CLAMP, easing: Easing.out(Easing.cubic),
      });
      s.scale = interpolate(frame, [inStart, inEnd], [0.8, 1], {
        ...CLAMP, easing: Easing.out(Easing.cubic),
      });
      break;

    case "glitch": {
      const gp = interpolate(frame, [inStart, inEnd], [0, 1], CLAMP);
      if (gp < 0.7) {
        const t = (frame - inStart) * 0.5;
        s.translateX = Math.sin(t * 13.7) * fontSize * 0.3 * (1 - gp);
        s.translateY = Math.sin(t * 17.3) * fontSize * 0.15 * (1 - gp);
      }
      break;
    }

    case "elastic_in": {
      const ep = interpolate(frame, [inStart, inEnd], [0, 1], CLAMP);
      s.scale = ep === 0 ? 0
        : ep === 1 ? 1
        : Math.pow(2, -10 * ep) * Math.sin((ep * 10 - 0.75) * (2 * Math.PI / 3)) + 1;
      break;
    }

    case "split_reveal": {
      const sp = interpolate(frame, [inStart, inEnd], [0, 1], {
        ...CLAMP, easing: Easing.out(Easing.cubic),
      });
      const half = (1 - sp) * 50;
      s.clipPath = sp >= 1 ? undefined : `inset(-20% ${half}% -20% ${half}%)`;
      break;
    }

    case "flip_in": {
      s.opacity = interpolate(frame, [inStart, inEnd], [0, 1], CLAMP);
      s.scale = interpolate(frame, [inStart, inEnd], [0, 1], {
        ...CLAMP, easing: Easing.out(Easing.cubic),
      });
      break;
    }
  }
}

/** Apply exit animation — modifies state in place */
function applyExitAnim(
  s: AnimState,
  type: string,
  frame: number,
  outStart: number,
  outEnd: number,
  fontSize: number,
  maxWidth: number,
) {
  if (type === "none" || frame < outStart) return; // not in exit phase

  switch (type) {
    case "fade_out":
      s.opacity *= interpolate(frame, [outStart, outEnd], [1, 0], CLAMP);
      break;

    case "fade_out_up":
      s.opacity *= interpolate(frame, [outStart, outEnd], [1, 0], CLAMP);
      s.translateY += interpolate(frame, [outStart, outEnd], [0, -fontSize * 1.5], {
        ...CLAMP, easing: Easing.in(Easing.cubic),
      });
      break;

    case "fade_out_down":
      s.opacity *= interpolate(frame, [outStart, outEnd], [1, 0], CLAMP);
      s.translateY += interpolate(frame, [outStart, outEnd], [0, fontSize * 1.5], {
        ...CLAMP, easing: Easing.in(Easing.cubic),
      });
      break;

    case "slide_out_left":
      s.translateX += interpolate(frame, [outStart, outEnd], [0, -maxWidth], {
        ...CLAMP, easing: Easing.in(Easing.cubic),
      });
      break;

    case "slide_out_right":
      s.translateX += interpolate(frame, [outStart, outEnd], [0, maxWidth], {
        ...CLAMP, easing: Easing.in(Easing.cubic),
      });
      break;

    case "slide_out_up":
      s.translateY += interpolate(frame, [outStart, outEnd], [0, -fontSize * 2], {
        ...CLAMP, easing: Easing.in(Easing.cubic),
      });
      break;

    case "slide_out_down":
      s.translateY += interpolate(frame, [outStart, outEnd], [0, fontSize * 2], {
        ...CLAMP, easing: Easing.in(Easing.cubic),
      });
      break;

    case "scale_out":
      s.scale *= interpolate(frame, [outStart, outEnd], [1, 0], {
        ...CLAMP, easing: Easing.in(Easing.cubic),
      });
      s.opacity *= interpolate(frame, [outStart, outEnd], [1, 0], CLAMP);
      break;

    case "blur_out":
      s.opacity *= interpolate(frame, [outStart, outEnd], [1, 0], CLAMP);
      s.blur = interpolate(frame, [outStart, outEnd], [0, 20], CLAMP);
      break;

    case "reveal_out_up": {
      const pct = interpolate(frame, [outStart, outEnd], [0, 1], {
        ...CLAMP, easing: Easing.in(Easing.cubic),
      });
      s.clipPath = `inset(-20% 0 ${pct * 100}% 0)`;
      break;
    }

    case "reveal_out_down": {
      const pct = interpolate(frame, [outStart, outEnd], [0, 1], {
        ...CLAMP, easing: Easing.in(Easing.cubic),
      });
      s.clipPath = `inset(${pct * 100}% 0 -20% 0)`;
      break;
    }

    case "split_close": {
      const sp = interpolate(frame, [outStart, outEnd], [0, 1], {
        ...CLAMP, easing: Easing.in(Easing.cubic),
      });
      const half = sp * 50;
      s.clipPath = `inset(-20% ${half}% -20% ${half}%)`;
      break;
    }

    case "flip_out":
      s.opacity *= interpolate(frame, [outStart, outEnd], [1, 0], CLAMP);
      s.scale *= interpolate(frame, [outStart, outEnd], [1, 0], {
        ...CLAMP, easing: Easing.in(Easing.cubic),
      });
      break;
  }
}

/** Per-character animation — returns array of styled spans */
function renderPerChar(
  text: string,
  frame: number,
  inStart: number,
  inEnd: number,
  fps: number,
  type: string,
  fontSize: number,
) {
  const totalChars = text.length;
  if (totalChars === 0) return null;

  const animFrames = inEnd - inStart;
  const perCharFrames = Math.max(1, Math.floor(animFrames / totalChars));

  return text.split("").map((char, i) => {
    const charStart = inStart + i * perCharFrames;
    const charEnd = Math.min(charStart + Math.round(fps * 0.35), inEnd);

    let charOpacity = 0;
    let charBlur = 0;
    let charScale = 1;
    let charTranslateY = 0;

    if (frame < charStart) {
      charOpacity = 0;
    } else if (type === "type_blur_reveal") {
      charOpacity = interpolate(frame, [charStart, charEnd], [0, 1], CLAMP);
      charBlur = interpolate(frame, [charStart, charEnd], [12, 0], CLAMP);
    } else if (type === "pop_reveal") {
      charOpacity = frame >= charStart ? 1 : 0;
      charScale = interpolate(frame, [charStart, charStart + Math.round(fps * 0.15), charEnd], [0, 1.3, 1], {
        ...CLAMP, easing: Easing.out(Easing.cubic),
      });
    } else if (type === "wave_in") {
      charOpacity = interpolate(frame, [charStart, charEnd], [0, 1], CLAMP);
      charTranslateY = interpolate(frame, [charStart, charEnd], [fontSize * 0.5, 0], {
        ...CLAMP, easing: Easing.out(Easing.sin),
      });
    }

    return (
      <span
        key={i}
        style={{
          display: "inline-block",
          opacity: charOpacity,
          transform: `scale(${charScale}) translateY(${charTranslateY}px)`,
          filter: charBlur > 0 ? `blur(${charBlur}px)` : undefined,
          whiteSpace: char === " " ? "pre" : undefined,
        }}
      >
        {char}
      </span>
    );
  });
}

export default function AnimatedTextBlock({
  block,
  tagValues,
  fontFamilies,
  videoWidth,
  videoHeight,
  textColorOverrides,
  defaultTextColor,
  defaultFontFamily,
  overrideFontFamily,
}: AnimatedTextBlockProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const text = block.content.replace(/\{(\w+)\}/g, (_, tag) => tagValues[tag] ?? "");
  if (!text) return null;

  const fontSize = block.font_size_ratio * videoHeight;
  const x = block.position_x * videoWidth;
  const y = block.position_y * videoHeight;
  const maxWidth = block.max_width * videoWidth;

  const startFrame = Math.round(block.start_time * fps);
  const endFrame = Math.round(block.end_time * fps);

  if (frame < startFrame || frame > endFrame) return null;

  const fontFamily = overrideFontFamily || (block.font_id ? (fontFamilies[block.font_id] ?? "sans-serif") : (defaultFontFamily ?? "sans-serif"));

  // Compute entry/exit frame ranges from durations
  const inDuration = block.anim_in_duration ?? 1.0;
  const outDuration = block.anim_out_duration ?? 1.0;
  const animationType = block.animation_type || "none";
  const animationOut = block.animation_out || "none";

  const inEndFrame = Math.min(startFrame + Math.round(inDuration * fps), endFrame);
  const outStartFrame = Math.max(endFrame - Math.round(outDuration * fps), startFrame);

  // Per-character entry animations
  const perCharTypes = ["type_blur_reveal", "pop_reveal", "wave_in"];
  const isPerChar = perCharTypes.includes(animationType);

  const s: AnimState = {
    opacity: 1,
    translateX: 0,
    translateY: 0,
    scale: 1,
    rotate: 0,
    blur: 0,
    letterSpacing: 0,
    displayText: text,
  };

  // Apply entry animation (only during entry phase)
  if (!isPerChar && frame < inEndFrame) {
    applyEntryAnim(s, animationType, frame, startFrame, inEndFrame, fontSize, maxWidth, text);
  }

  // Apply exit animation (only during exit phase)
  if (frame >= outStartFrame && animationOut !== "none") {
    applyExitAnim(s, animationOut, frame, outStartFrame, endFrame, fontSize, maxWidth);
  }

  const textAlignMap: Record<string, string> = {
    center: "center",
    left: "left",
    right: "right",
  };

  const alignedLeft =
    block.text_align === "center"
      ? x - maxWidth / 2
      : block.text_align === "right"
        ? x - maxWidth
        : x;

  const transformOrigin =
    block.text_align === "center" ? "center center"
    : block.text_align === "right" ? "right center"
    : "left center";

  // For per-char entry: wrapper handles exit anim, chars handle entry
  const wrapperOpacity = isPerChar ? (animationOut !== "none" && frame >= outStartFrame ? s.opacity : 1) : s.opacity;
  const wrapperTransform = isPerChar
    ? (animationOut !== "none" && frame >= outStartFrame
      ? `translate(${s.translateX}px, ${s.translateY}px) scale(${s.scale}) rotate(${s.rotate}deg)`
      : undefined)
    : `translate(${s.translateX}px, ${s.translateY}px) scale(${s.scale}) rotate(${s.rotate}deg)`;

  // Gujarati/Hindi scripts need extra line-height + padding for tall matras
  const needsExtraPadding = /[\u0A80-\u0AFF\u0900-\u097F]/.test(text) || (fontFamily && fontFamily !== "sans-serif");
  const extraPad = needsExtraPadding ? fontSize * 0.25 : 0;

  return (
    <div
      style={{
        position: "absolute",
        left: alignedLeft,
        top: y - extraPad,
        width: maxWidth,
        fontSize,
        fontFamily,
        color: textColorOverrides?.[block.id] || textColorOverrides?._default || block.text_color || defaultTextColor || "#FFFFFF",
        textAlign: textAlignMap[block.text_align] as any,
        opacity: wrapperOpacity,
        transform: wrapperTransform,
        transformOrigin,
        whiteSpace: "pre-wrap",
        lineHeight: needsExtraPadding ? 1.5 : 1.2,
        paddingTop: extraPad,
        paddingBottom: extraPad,
        letterSpacing: s.letterSpacing > 0 ? `${s.letterSpacing}px` : undefined,
        filter: s.blur > 0 ? `blur(${s.blur}px)` : undefined,
        clipPath: s.clipPath,
        overflow: "visible",
      }}
    >
      {isPerChar && frame < inEndFrame
        ? renderPerChar(text, frame, startFrame, inEndFrame, fps, animationType, fontSize)
        : s.displayText}
    </div>
  );
}
