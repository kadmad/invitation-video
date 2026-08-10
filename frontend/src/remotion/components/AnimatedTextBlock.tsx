import React, { useMemo } from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { TextBlock, FormatRange } from "@/types";

const segmenter =
  typeof Intl !== "undefined" && (Intl as any).Segmenter
    ? new (Intl as any).Segmenter("en", { granularity: "grapheme" })
    : null;

const textAlignMap: Record<string, string> = {
  center: "center",
  left: "left",
  right: "right",
};

interface AnimatedTextBlockProps {
  block: TextBlock;
  tagValues: Record<string, string>;
  fontFamilies: Record<string, string>;
  placeholderTags?: Set<string> | null;
  videoWidth: number;
  videoHeight: number;
  textColorOverrides?: Record<string, string>;
  defaultTextColor?: string;
  defaultFontFamily?: string;
  overrideFontFamily?: string;
  blockOverride?: string;
  blockFormatRanges?: FormatRange[];
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

    case "cinematic_zoom":
      s.opacity = interpolate(frame, [inStart, inStart + Math.round((inEnd - inStart) * 0.3)], [0, 1], CLAMP);
      s.scale = interpolate(frame, [inStart, inEnd], [3, 1], {
        ...CLAMP, easing: Easing.out(Easing.cubic),
      });
      s.blur = interpolate(frame, [inStart, inStart + Math.round((inEnd - inStart) * 0.5)], [8, 0], CLAMP);
      break;

    case "rubber_band": {
      const rp = interpolate(frame, [inStart, inEnd], [0, 1], CLAMP);
      s.opacity = Math.min(1, rp * 3);
      const bounce = rp < 0.4
        ? interpolate(rp, [0, 0.2, 0.4], [0.3, 1.25, 0.9], CLAMP)
        : rp < 0.6
        ? interpolate(rp, [0.4, 0.5, 0.6], [0.9, 1.1, 0.95], CLAMP)
        : interpolate(rp, [0.6, 0.8, 1], [0.95, 1.03, 1], CLAMP);
      s.scale = bounce;
      break;
    }

    case "shimmer_in":
      s.opacity = interpolate(frame, [inStart, inEnd], [0, 1], CLAMP);
      s.scale = interpolate(frame, [inStart, inEnd], [0.95, 1], {
        ...CLAMP, easing: Easing.out(Easing.cubic),
      });
      s.blur = interpolate(frame, [inStart, inStart + Math.round((inEnd - inStart) * 0.4)], [6, 0], CLAMP);
      s.letterSpacing = interpolate(frame, [inStart, inEnd], [fontSize * 0.2, 0], {
        ...CLAMP, easing: Easing.out(Easing.cubic),
      });
      break;

    case "drop_bounce": {
      const dp = interpolate(frame, [inStart, inEnd], [0, 1], CLAMP);
      s.opacity = Math.min(1, dp * 4);
      s.translateY = dp < 0.5
        ? interpolate(dp, [0, 0.5], [-fontSize * 3, 0], { ...CLAMP, easing: Easing.in(Easing.quad) })
        : dp < 0.7
        ? interpolate(dp, [0.5, 0.6, 0.7], [0, -fontSize * 0.4, 0], CLAMP)
        : dp < 0.85
        ? interpolate(dp, [0.7, 0.78, 0.85], [0, -fontSize * 0.15, 0], CLAMP)
        : 0;
      break;
    }

    case "spiral_in":
      s.opacity = interpolate(frame, [inStart, inEnd], [0, 1], CLAMP);
      s.scale = interpolate(frame, [inStart, inEnd], [0, 1], {
        ...CLAMP, easing: Easing.out(Easing.cubic),
      });
      s.rotate = interpolate(frame, [inStart, inEnd], [180, 0], {
        ...CLAMP, easing: Easing.out(Easing.cubic),
      });
      break;
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

    case "cinematic_zoom_out":
      s.opacity *= interpolate(frame, [outStart + Math.round((outEnd - outStart) * 0.7), outEnd], [1, 0], CLAMP);
      s.scale *= interpolate(frame, [outStart, outEnd], [1, 3], {
        ...CLAMP, easing: Easing.in(Easing.cubic),
      });
      s.blur = interpolate(frame, [outStart + Math.round((outEnd - outStart) * 0.5), outEnd], [0, 8], CLAMP);
      break;

    case "rubber_band_out": {
      const rp = interpolate(frame, [outStart, outEnd], [0, 1], CLAMP);
      s.opacity *= rp > 0.8 ? interpolate(rp, [0.8, 1], [1, 0], CLAMP) : 1;
      const bounce = rp < 0.3
        ? interpolate(rp, [0, 0.15, 0.3], [1, 1.2, 0.8], CLAMP)
        : interpolate(rp, [0.3, 0.6, 1], [0.8, 1.1, 0], CLAMP);
      s.scale *= bounce;
      break;
    }

    case "spiral_out":
      s.opacity *= interpolate(frame, [outStart, outEnd], [1, 0], CLAMP);
      s.scale *= interpolate(frame, [outStart, outEnd], [1, 0], {
        ...CLAMP, easing: Easing.in(Easing.cubic),
      });
      s.rotate += interpolate(frame, [outStart, outEnd], [0, 180], {
        ...CLAMP, easing: Easing.in(Easing.cubic),
      });
      break;

    // Per-char exit types handled in renderPerCharExit — skip here
    case "type_blur_out":
    case "pop_out":
    case "wave_out":
      break;
  }
}

/** Per-character EXIT animation (reverse order: last char disappears first) */
function renderPerCharExit(
  text: string,
  frame: number,
  outStart: number,
  outEnd: number,
  fps: number,
  type: string,
  fontSize: number,
  direction: string = "ltr",
) {
  const graphemes = splitGraphemes(text);
  const totalChars = graphemes.length;
  if (totalChars === 0) return null;

  const animFrames = outEnd - outStart;
  const perCharFrames = Math.max(1, Math.floor(animFrames / totalChars));

  return graphemes.map((char, i) => {
    if (char === "\n") return <br key={i} />;
    // ltr = first char exits first, rtl = last char exits first
    const animIdx = direction === "rtl" ? totalChars - 1 - i : i;
    const charStart = outStart + animIdx * perCharFrames;
    const charEnd = Math.max(charStart + 1, Math.min(charStart + Math.round(fps * 0.35), outEnd));

    let charOpacity = 1;
    let charBlur = 0;
    let charScale = 1;
    let charTranslateY = 0;

    if (frame < charStart) {
      charOpacity = 1;
    } else if (frame > charEnd) {
      charOpacity = 0;
    } else if (type === "type_blur_out") {
      charOpacity = interpolate(frame, [charStart, charEnd], [1, 0], CLAMP);
      charBlur = interpolate(frame, [charStart, charEnd], [0, 12], CLAMP);
    } else if (type === "pop_out") {
      const popMid = charStart + Math.round(fps * 0.15);
      if (popMid < charEnd) {
        charScale = interpolate(frame, [charStart, popMid, charEnd], [1, 1.3, 0], {
          ...CLAMP, easing: Easing.in(Easing.cubic),
        });
      } else {
        charScale = interpolate(frame, [charStart, charEnd], [1, 0], CLAMP);
      }
      charOpacity = frame >= charEnd ? 0 : 1;
    } else if (type === "wave_out") {
      charOpacity = interpolate(frame, [charStart, charEnd], [1, 0], CLAMP);
      charTranslateY = interpolate(frame, [charStart, charEnd], [0, fontSize * 0.5], {
        ...CLAMP, easing: Easing.in(Easing.sin),
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

/** Per-character EXIT with rich format support */
function renderPerCharRichExit(
  text: string,
  frame: number,
  outStart: number,
  outEnd: number,
  fps: number,
  type: string,
  fontSize: number,
  block: TextBlock,
  tagValues: Record<string, string>,
  fontFamilies: Record<string, string>,
  direction: string = "ltr",
  precomputedRanges?: FormatRange[],
) {
  const graphemes = splitGraphemes(text);
  const totalChars = graphemes.length;
  if (totalChars === 0) return null;

  // Get per-grapheme format info
  let charFormats: Array<{ bold?: boolean; italic?: boolean; color?: string; stroke_color?: string; stroke_width?: number }> = [];
  const effectiveRanges = precomputedRanges ?? (() => {
    const rawRanges = block.format_ranges;
    if (!rawRanges || rawRanges.length === 0) return [];
    try {
      const { mapIndex } = expandTags(block.content, tagValues);
      return mapRangesToExpanded(rawRanges, mapIndex);
    } catch {
      return [];
    }
  })();
  if (effectiveRanges.length > 0) {
    let codeIdx = 0;
    charFormats = graphemes.map((g) => {
      let bold: boolean | undefined;
      let italic: boolean | undefined;
      let color: string | undefined;
      let stroke_color: string | undefined;
      let stroke_width: number | undefined;
      for (const r of effectiveRanges) {
        if (r.start <= codeIdx && r.end > codeIdx) {
          if (r.bold !== undefined) bold = r.bold;
          if (r.italic !== undefined) italic = r.italic;
          if (r.color !== undefined) color = r.color;
          if (r.stroke_color !== undefined) stroke_color = r.stroke_color;
          if (r.stroke_width !== undefined) stroke_width = r.stroke_width;
        }
      }
      codeIdx += g.length;
      return { bold, italic, color, stroke_color, stroke_width };
    });
  }

  const animFrames = outEnd - outStart;
  const perCharFrames = Math.max(1, Math.floor(animFrames / totalChars));

  return graphemes.map((char, i) => {
    if (char === "\n") return <br key={i} />;
    const animIdx = direction === "rtl" ? totalChars - 1 - i : i;
    const charStart = outStart + animIdx * perCharFrames;
    const charEnd = Math.max(charStart + 1, Math.min(charStart + Math.round(fps * 0.35), outEnd));

    let charOpacity = 1;
    let charBlur = 0;
    let charScale = 1;
    let charTranslateY = 0;

    if (frame < charStart) {
      charOpacity = 1;
    } else if (frame > charEnd) {
      charOpacity = 0;
    } else if (type === "type_blur_out") {
      charOpacity = interpolate(frame, [charStart, charEnd], [1, 0], CLAMP);
      charBlur = interpolate(frame, [charStart, charEnd], [0, 12], CLAMP);
    } else if (type === "pop_out") {
      const popMid = charStart + Math.round(fps * 0.15);
      if (popMid < charEnd) {
        charScale = interpolate(frame, [charStart, popMid, charEnd], [1, 1.3, 0], {
          ...CLAMP, easing: Easing.in(Easing.cubic),
        });
      } else {
        charScale = interpolate(frame, [charStart, charEnd], [1, 0], CLAMP);
      }
      charOpacity = frame >= charEnd ? 0 : 1;
    } else if (type === "wave_out") {
      charOpacity = interpolate(frame, [charStart, charEnd], [1, 0], CLAMP);
      charTranslateY = interpolate(frame, [charStart, charEnd], [0, fontSize * 0.5], {
        ...CLAMP, easing: Easing.in(Easing.sin),
      });
    }

    const fmt = charFormats[i];

    return (
      <span
        key={i}
        style={{
          display: "inline-block",
          opacity: charOpacity,
          transform: `scale(${charScale}) translateY(${charTranslateY}px)`,
          filter: charBlur > 0 ? `blur(${charBlur}px)` : undefined,
          whiteSpace: char === " " ? "pre" : undefined,
          fontWeight: fmt?.bold ? "bold" : undefined,
          fontStyle: fmt?.italic ? "italic" : undefined,
          color: fmt?.color || undefined,
          WebkitTextStroke: fmt?.stroke_color ? `${fmt.stroke_width ?? 1}px ${fmt.stroke_color}` : undefined,
          paintOrder: fmt?.stroke_color ? "stroke fill" : undefined,
        }}
      >
        {char}
      </span>
    );
  });
}

/**
 * Build a mapping from raw content indices to expanded (tag-substituted) indices.
 * Returns the expanded text and a function to map raw index -> expanded index.
 */
function expandTags(
  content: string,
  tagValues: Record<string, string>,
): { expanded: string; mapIndex: (rawIdx: number) => number } {
  const tagRegex = /\{(\w+)\}/g;
  // Build offset array: for each raw position, how much to shift in expanded text
  const offsets: number[] = new Array(content.length + 1).fill(0);
  let cumulativeDelta = 0;
  let match;

  tagRegex.lastIndex = 0;
  while ((match = tagRegex.exec(content)) !== null) {
    const tagKey = match[1];
    const replacement = tagValues[tagKey] ?? "";
    const tagLen = match[0].length;
    const repLen = replacement.length;
    cumulativeDelta += repLen - tagLen;

    // Set offset for positions from end of this tag onwards
    // (positions inside the tag map to start of replacement)
    for (let i = match.index + tagLen; i <= content.length; i++) {
      offsets[i] = cumulativeDelta;
    }
    // Positions inside the tag itself: map to replacement start
    for (let i = match.index + 1; i < match.index + tagLen; i++) {
      offsets[i] = offsets[match.index]; // same as tag start position
    }
  }

  // Build expanded text
  let expanded = "";
  let lastIndex = 0;
  tagRegex.lastIndex = 0;
  while ((match = tagRegex.exec(content)) !== null) {
    expanded += content.slice(lastIndex, match.index);
    expanded += tagValues[match[1]] ?? "";
    lastIndex = match.index + match[0].length;
  }
  expanded += content.slice(lastIndex);

  const mapIndex = (rawIdx: number): number => {
    return rawIdx + (offsets[rawIdx] ?? 0);
  };

  return { expanded, mapIndex };
}

/** Map format ranges from raw content indices to expanded text indices */
function mapRangesToExpanded(
  ranges: FormatRange[],
  mapIndex: (rawIdx: number) => number,
): FormatRange[] {
  return ranges.map((r) => ({
    ...r,
    start: mapIndex(r.start),
    end: mapIndex(r.end),
  }));
}

interface RichSegment {
  text: string;
  bold?: boolean;
  italic?: boolean;
  color?: string;
  stroke_color?: string;
  stroke_width?: number;
}

/** Split expanded text into segments based on format ranges */
function splitRichSegments(text: string, ranges: FormatRange[]): RichSegment[] {
  if (!text || ranges.length === 0) return [{ text }];

  const boundaries = new Set<number>([0, text.length]);
  for (const r of ranges) {
    boundaries.add(Math.max(0, Math.min(r.start, text.length)));
    boundaries.add(Math.max(0, Math.min(r.end, text.length)));
  }
  const sorted = Array.from(boundaries).sort((a, b) => a - b);
  const segments: RichSegment[] = [];

  for (let i = 0; i < sorted.length - 1; i++) {
    const start = sorted[i];
    const end = sorted[i + 1];
    if (start === end) continue;

    let bold: boolean | undefined;
    let italic: boolean | undefined;
    let color: string | undefined;
    let stroke_color: string | undefined;
    let stroke_width: number | undefined;

    for (const r of ranges) {
      if (r.start <= start && r.end >= end) {
        if (r.bold !== undefined) bold = r.bold;
        if (r.italic !== undefined) italic = r.italic;
        if (r.color !== undefined) color = r.color;
        if (r.stroke_color !== undefined) stroke_color = r.stroke_color;
        if (r.stroke_width !== undefined) stroke_width = r.stroke_width;
      }
    }

    segments.push({ text: text.slice(start, end), bold, italic, color, stroke_color, stroke_width });
  }

  return segments;
}

/** Render text with rich formatting from pre-mapped ranges */
function renderRichTextFromRanges(
  text: string,
  ranges: FormatRange[],
): React.ReactNode {
  if (!ranges || ranges.length === 0) return text;

  const segments = splitRichSegments(text, ranges);

  return segments.map((seg, i) => {
    const hasStyle = seg.bold || seg.italic || seg.color || seg.stroke_color;
    if (!hasStyle) return seg.text;
    return (
      <span
        key={i}
        style={{
          fontWeight: seg.bold ? "bold" : undefined,
          fontStyle: seg.italic ? "italic" : undefined,
          color: seg.color || undefined,
          WebkitTextStroke: seg.stroke_color
            ? `${seg.stroke_width ?? 1}px ${seg.stroke_color}`
            : undefined,
          paintOrder: seg.stroke_color ? "stroke fill" : undefined,
        }}
      >
        {seg.text}
      </span>
    );
  });
}

/** Render text with rich formatting spans */
function renderRichText(
  expandedText: string,
  block: TextBlock,
  tagValues: Record<string, string>,
  fontFamilies: Record<string, string>,
): React.ReactNode {
  const rawRanges = block.format_ranges;
  if (!rawRanges || rawRanges.length === 0) return expandedText;

  let mappedRanges: FormatRange[];
  try {
    const { mapIndex } = expandTags(block.content, tagValues);
    mappedRanges = mapRangesToExpanded(rawRanges, mapIndex);
  } catch {
    return expandedText;
  }

  return renderRichTextFromRanges(expandedText, mappedRanges);
}

/** Split text into grapheme clusters (keeps Gujarati conjuncts + matras intact) */
function splitGraphemes(text: string): string[] {
  if (segmenter) {
    return Array.from(segmenter.segment(text), (s: any) => s.segment);
  }
  // Fallback: spread handles surrogate pairs but not combining marks
  return [...text];
}

/** Per-character rendering with rich format support */
function renderPerCharRich(
  text: string,
  frame: number,
  inStart: number,
  inEnd: number,
  fps: number,
  type: string,
  fontSize: number,
  block: TextBlock,
  tagValues: Record<string, string>,
  fontFamilies: Record<string, string>,
  direction: string = "ltr",
  precomputedRanges?: FormatRange[],
) {
  const graphemes = splitGraphemes(text);
  const totalChars = graphemes.length;
  if (totalChars === 0) return null;

  // Get per-grapheme format info (map using code-point index)
  let charFormats: Array<{ bold?: boolean; italic?: boolean; color?: string; stroke_color?: string; stroke_width?: number }> = [];
  const effectiveRanges = precomputedRanges ?? (() => {
    const rawRanges = block.format_ranges;
    if (!rawRanges || rawRanges.length === 0) return [];
    try {
      const { mapIndex } = expandTags(block.content, tagValues);
      return mapRangesToExpanded(rawRanges, mapIndex);
    } catch {
      return [];
    }
  })();
  if (effectiveRanges.length > 0) {
    let codeIdx = 0;
    charFormats = graphemes.map((g) => {
      let bold: boolean | undefined;
      let italic: boolean | undefined;
      let color: string | undefined;
      let stroke_color: string | undefined;
      let stroke_width: number | undefined;
      for (const r of effectiveRanges) {
        if (r.start <= codeIdx && r.end > codeIdx) {
          if (r.bold !== undefined) bold = r.bold;
          if (r.italic !== undefined) italic = r.italic;
          if (r.color !== undefined) color = r.color;
          if (r.stroke_color !== undefined) stroke_color = r.stroke_color;
          if (r.stroke_width !== undefined) stroke_width = r.stroke_width;
        }
      }
      codeIdx += g.length;
      return { bold, italic, color, stroke_color, stroke_width };
    });
  }

  const animFrames = inEnd - inStart;
  const perCharFrames = Math.max(1, Math.floor(animFrames / totalChars));

  return graphemes.map((char, i) => {
    if (char === "\n") return <br key={i} />;
    const animIdx = direction === "rtl" ? totalChars - 1 - i : i;
    const charStart = inStart + animIdx * perCharFrames;
    const charEnd = Math.max(charStart + 1, Math.min(charStart + Math.round(fps * 0.35), inEnd));

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
      const popMid = charStart + Math.round(fps * 0.15);
      if (popMid < charEnd) {
        charScale = interpolate(frame, [charStart, popMid, charEnd], [0, 1.3, 1], {
          ...CLAMP, easing: Easing.out(Easing.cubic),
        });
      } else {
        charScale = interpolate(frame, [charStart, charEnd], [0, 1], CLAMP);
      }
    } else if (type === "wave_in") {
      charOpacity = interpolate(frame, [charStart, charEnd], [0, 1], CLAMP);
      charTranslateY = interpolate(frame, [charStart, charEnd], [fontSize * 0.5, 0], {
        ...CLAMP, easing: Easing.out(Easing.sin),
      });
    }

    const fmt = charFormats[i];

    return (
      <span
        key={i}
        style={{
          display: "inline-block",
          opacity: charOpacity,
          transform: `scale(${charScale}) translateY(${charTranslateY}px)`,
          filter: charBlur > 0 ? `blur(${charBlur}px)` : undefined,
          whiteSpace: char === " " ? "pre" : undefined,
          fontWeight: fmt?.bold ? "bold" : undefined,
          fontStyle: fmt?.italic ? "italic" : undefined,
          color: fmt?.color || undefined,
          WebkitTextStroke: fmt?.stroke_color ? `${fmt.stroke_width ?? 1}px ${fmt.stroke_color}` : undefined,
          paintOrder: fmt?.stroke_color ? "stroke fill" : undefined,
        }}
      >
        {char}
      </span>
    );
  });
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
  direction: string = "ltr",
) {
  const graphemes = splitGraphemes(text);
  const totalChars = graphemes.length;
  if (totalChars === 0) return null;

  const animFrames = inEnd - inStart;
  const perCharFrames = Math.max(1, Math.floor(animFrames / totalChars));

  return graphemes.map((char, i) => {
    if (char === "\n") return <br key={i} />;
    const animIdx = direction === "rtl" ? totalChars - 1 - i : i;
    const charStart = inStart + animIdx * perCharFrames;
    const charEnd = Math.max(charStart + 1, Math.min(charStart + Math.round(fps * 0.35), inEnd));

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
      const popMid = charStart + Math.round(fps * 0.15);
      if (popMid < charEnd) {
        charScale = interpolate(frame, [charStart, popMid, charEnd], [0, 1.3, 1], {
          ...CLAMP, easing: Easing.out(Easing.cubic),
        });
      } else {
        charScale = interpolate(frame, [charStart, charEnd], [0, 1], CLAMP);
      }
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

const perCharTypes = ["type_blur_reveal", "pop_reveal", "wave_in"];
const perCharOutTypes = ["type_blur_out", "pop_out", "wave_out"];
const indicScriptRegex = /[\u0A80-\u0AFF\u0900-\u097F]/;
function AnimatedTextBlock({
  block,
  tagValues,
  fontFamilies,
  placeholderTags,
  videoWidth,
  videoHeight,
  textColorOverrides,
  defaultTextColor,
  defaultFontFamily,
  overrideFontFamily,
  blockOverride,
  blockFormatRanges,
}: AnimatedTextBlockProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // === All hooks must be called before any early returns (Rules of Hooks) ===
  const text = useMemo(
    () =>
      blockOverride !== undefined
        ? blockOverride
        : block.content.replace(/\{(\w+)\}/g, (_, tag) => tagValues[tag] ?? ""),
    [blockOverride, block.content, tagValues],
  );

  const isPlaceholder = useMemo(
    () =>
      placeholderTags
        ? Array.from(block.content.matchAll(/\{(\w+)\}/g)).some((m) => placeholderTags.has(m[1]))
        : false,
    [placeholderTags, block.content],
  );

  const fontSize = useMemo(() => block.font_size_ratio * videoHeight, [block.font_size_ratio, videoHeight]);
  const x = useMemo(() => block.position_x * videoWidth, [block.position_x, videoWidth]);
  const y = useMemo(() => block.position_y * videoHeight, [block.position_y, videoHeight]);
  const maxWidth = useMemo(() => block.max_width * videoWidth, [block.max_width, videoWidth]);

  const startFrame = useMemo(() => Math.round(block.start_time * fps), [block.start_time, fps]);
  const endFrame = useMemo(() => Math.round(block.end_time * fps), [block.end_time, fps]);

  const fontFamily = useMemo(
    () => overrideFontFamily || (block.font_id ? (fontFamilies[block.font_id] ?? "sans-serif") : (defaultFontFamily ?? "sans-serif")),
    [overrideFontFamily, block.font_id, fontFamilies, defaultFontFamily],
  );

  const inEndFrame = useMemo(() => {
    const inDuration = block.anim_in_duration ?? 1.0;
    return Math.min(startFrame + Math.round(inDuration * fps), endFrame);
  }, [block.anim_in_duration, startFrame, fps, endFrame]);

  const outStartFrame = useMemo(() => {
    const outDuration = block.anim_out_duration ?? 1.0;
    return Math.max(endFrame - Math.round(outDuration * fps), startFrame);
  }, [block.anim_out_duration, endFrame, fps, startFrame]);

  const alignedLeft = useMemo(
    () =>
      block.text_align === "center"
        ? x - maxWidth / 2
        : block.text_align === "right"
          ? x - maxWidth
          : x,
    [block.text_align, x, maxWidth],
  );

  const transformOrigin = useMemo(
    () =>
      block.text_align === "center" ? "center center"
      : block.text_align === "right" ? "right center"
      : "left center",
    [block.text_align],
  );

  const needsExtraPadding = useMemo(
    () => indicScriptRegex.test(text) || (fontFamily && fontFamily !== "sans-serif"),
    [text, fontFamily],
  );

  // === Early returns (after all hooks) ===
  if (!text) return null;
  if (frame < startFrame || frame > endFrame) return null;

  // === Non-hook computations (safe after early returns) ===
  const animationType = block.animation_type || "none";
  const animationOut = block.animation_out || "none";

  const isPerChar = perCharTypes.includes(animationType);
  const isPerCharOut = perCharOutTypes.includes(animationOut);

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

  // For per-char entry/exit: wrapper handles non-per-char anim, chars handle per-char anim
  const hasNonPerCharExit = animationOut !== "none" && !isPerCharOut && frame >= outStartFrame;
  const wrapperOpacity = (isPerChar || isPerCharOut) ? (hasNonPerCharExit ? s.opacity : 1) : s.opacity;
  const wrapperTransform = (isPerChar || isPerCharOut)
    ? (hasNonPerCharExit
      ? `translate(${s.translateX}px, ${s.translateY}px) scale(${s.scale}) rotate(${s.rotate}deg)`
      : undefined)
    : `translate(${s.translateX}px, ${s.translateY}px) scale(${s.scale}) rotate(${s.rotate}deg)`;

  const extraPad = needsExtraPadding ? fontSize * 0.25 : 0;

  const textColor = textColorOverrides?.[block.id] || textColorOverrides?._default || block.text_color || defaultTextColor || "#FFFFFF";

  return (
    <div
      style={{
        position: "absolute",
        left: alignedLeft,
        top: y - extraPad,
        width: maxWidth,
        fontSize,
        fontFamily,
        color: textColor,
        textAlign: textAlignMap[block.text_align] as any,
        opacity: isPlaceholder ? wrapperOpacity * 0.35 : wrapperOpacity,
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
        ? blockOverride !== undefined
          ? blockFormatRanges?.length
            ? renderPerCharRich(text, frame, startFrame, inEndFrame, fps, animationType, fontSize, block, tagValues, fontFamilies, block.anim_in_direction ?? "ltr", blockFormatRanges)
            : renderPerChar(text, frame, startFrame, inEndFrame, fps, animationType, fontSize, block.anim_in_direction ?? "ltr")
          : renderPerCharRich(text, frame, startFrame, inEndFrame, fps, animationType, fontSize, block, tagValues, fontFamilies, block.anim_in_direction ?? "ltr")
        : isPerCharOut && frame >= outStartFrame
        ? blockOverride !== undefined
          ? blockFormatRanges?.length
            ? renderPerCharRichExit(text, frame, outStartFrame, endFrame, fps, animationOut, fontSize, block, tagValues, fontFamilies, block.anim_out_direction ?? "ltr", blockFormatRanges)
            : renderPerCharExit(text, frame, outStartFrame, endFrame, fps, animationOut, fontSize, block.anim_out_direction ?? "ltr")
          : renderPerCharRichExit(text, frame, outStartFrame, endFrame, fps, animationOut, fontSize, block, tagValues, fontFamilies, block.anim_out_direction ?? "ltr")
        : blockOverride !== undefined
          ? blockFormatRanges?.length
            ? renderRichTextFromRanges(text, blockFormatRanges)
            : text
          : renderRichText(text, block, tagValues, fontFamilies)}
    </div>
  );
}

export default React.memo(AnimatedTextBlock);
