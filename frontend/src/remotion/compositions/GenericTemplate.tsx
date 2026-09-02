import { useEffect, useState, useCallback, useMemo } from "react";
import { AbsoluteFill, Audio, OffthreadVideo, delayRender, continueRender, useVideoConfig } from "remotion";
import AnimatedText from "../components/AnimatedText";
import AnimatedTextBlock from "../components/AnimatedTextBlock";
import AnimatedImageBlock from "../components/AnimatedImageBlock";
import WatermarkOverlay from "../components/WatermarkOverlay";
import type { TemplateField, TextBlock, ImageBlock, FormatRange } from "@/types";

interface GenericTemplateProps {
  videoUrl: string | null;
  width: number;
  height: number;
  // Customer's own uploaded audio track, replacing the video's original
  // audio entirely — trimmed to the composition's own duration starting at
  // musicStartSeconds. Omit/null musicUrl to keep the video's own audio.
  musicUrl?: string | null;
  musicStartSeconds?: number;
  /** 0..1, applied to the replacement track. Defaults to full volume. */
  musicVolume?: number;
  // New tag-based props
  textBlocks?: TextBlock[];
  tagValues?: Record<string, string>;
  fontFamilies?: Record<string, string>;
  fontUrls?: Record<string, string>;
  placeholderTags?: string[];
  textColorOverrides?: Record<string, string>;
  defaultTextColor?: string;
  defaultFontFamily?: string;
  overrideFontFamily?: string;
  imageBlocks?: ImageBlock[];
  imageUploads?: Record<string, string>;
  blockOverrides?: Record<string, string>;
  blockFormatOverrides?: Record<string, FormatRange[]>;
  overlayOnly?: boolean;
  // Legacy field-based props (backward compat)
  fields?: TemplateField[];
  fieldValues?: Record<string, string>;
  fontFamily?: string;
  watermarkEnabled?: boolean;
  watermarkPositionX?: number;
  watermarkPositionY?: number;
  watermarkWidth?: number;
  watermarkRotation?: number;
  watermarkOpacity?: number;
}

export default function GenericTemplate({
  videoUrl,
  width,
  height,
  musicUrl,
  musicStartSeconds,
  musicVolume,
  textBlocks,
  tagValues,
  fontFamilies,
  fontUrls,
  placeholderTags,
  textColorOverrides,
  defaultTextColor,
  defaultFontFamily,
  overrideFontFamily,
  imageBlocks,
  imageUploads,
  blockOverrides,
  blockFormatOverrides,
  overlayOnly,
  fields,
  fieldValues,
  fontFamily,
  watermarkEnabled,
  watermarkPositionX,
  watermarkPositionY,
  watermarkWidth,
  watermarkRotation,
  watermarkOpacity,
}: GenericTemplateProps) {
  const { fps } = useVideoConfig();

  // Use new text_blocks path if available, otherwise fall back to legacy fields
  const useBlocks = textBlocks && textBlocks.length > 0;
  const placeholderSet = useMemo(
    () => (placeholderTags ? new Set(placeholderTags) : null),
    [placeholderTags]
  );
  const resolvedTagValues = useMemo(() => tagValues ?? {}, [tagValues]);
  const resolvedFontFamilies = useMemo(() => fontFamilies ?? {}, [fontFamilies]);

  // Build @font-face CSS for SSR rendering (when fontUrls provided by renderer service)
  const fontFaceCSS = fontUrls
    ? Object.entries(fontUrls)
        .map(([fontId, url]) => {
          const family = fontFamilies?.[fontId] || fontId;
          return `@font-face { font-family: '${family}'; src: url('${url}'); font-display: block; }`;
        })
        .join("\n")
    : "";

  // Delay render until all fonts are loaded (critical for SSR pixel-perfect match)
  const hasFontUrls = fontUrls && Object.keys(fontUrls).length > 0;
  const [handle] = useState(() => {
    if (hasFontUrls) {
      return delayRender("Loading fonts for pixel-perfect render...");
    }
    return null;
  });

  useEffect(() => {
    if (!hasFontUrls || handle === null) return;

    const loadedFamilies = new Set<string>();
    const fontPromises = Object.entries(fontUrls!).map(([fontId, url]) => {
      const family = fontFamilies?.[fontId] || fontId;
      if (loadedFamilies.has(family)) return Promise.resolve();
      loadedFamilies.add(family);
      const face = new FontFace(family, `url(${url})`);
      return face.load().then((loaded) => {
        document.fonts.add(loaded);
      });
    });

    Promise.all(fontPromises)
      .then(() => {
        // Wait one frame for browser to apply font metrics
        return document.fonts.ready;
      })
      .then(() => {
        continueRender(handle);
      })
      .catch((err) => {
        console.error("Font loading failed:", err);
        continueRender(handle);
      });
  }, [fontUrls, fontFamilies, handle, hasFontUrls]);

  return (
    <AbsoluteFill style={{ backgroundColor: "#1a1a2e" }}>
      {fontFaceCSS && <style dangerouslySetInnerHTML={{ __html: fontFaceCSS }} />}
      {videoUrl && (
        <OffthreadVideo
          src={videoUrl}
          volume={musicUrl ? 0 : 1}
          // Keep the Remotion timeline aligned with the native media element.
          // Without this, a network buffer stall lets the timeline continue
          // advancing and then repeatedly seeks the video ahead, which makes
          // the editor preview appear frozen and makes seeking unreliable.
          pauseWhenBuffering
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      )}
      {musicUrl && (
        <Audio
          src={musicUrl}
          volume={musicVolume ?? 1}
          pauseWhenBuffering
          startFrom={Math.round((musicStartSeconds ?? 0) * fps)}
        />
      )}

      {/* Image blocks layer */}
      {(imageBlocks ?? []).map((block) => {
        const imageUrl =
          imageUploads?.[block.id] || block.placeholder_key || null;
        return (
          <AnimatedImageBlock
            key={block.id}
            block={block}
            imageUrl={imageUrl}
            videoWidth={width}
            videoHeight={height}
          />
        );
      })}

      {useBlocks
        ? textBlocks!.map((block) => (
            <AnimatedTextBlock
              key={block.id}
              block={block}
              tagValues={resolvedTagValues}
              fontFamilies={resolvedFontFamilies}
              placeholderTags={placeholderSet}
              videoWidth={width}
              videoHeight={height}
              textColorOverrides={textColorOverrides}
              defaultTextColor={defaultTextColor}
              defaultFontFamily={defaultFontFamily}
              overrideFontFamily={overrideFontFamily}
              blockOverride={blockOverrides?.[block.id]}
              blockFormatRanges={blockFormatOverrides?.[block.id]}
            />
          ))
        : (fields ?? []).map((field) => (
            <AnimatedText
              key={field.id}
              field={field}
              text={(fieldValues ?? {})[field.field_key] || ""}
              fontFamily={fontFamily ?? "sans-serif"}
              videoWidth={width}
              videoHeight={height}
            />
          ))}

      {watermarkEnabled && (
        <WatermarkOverlay
          positionX={watermarkPositionX ?? 0.39}
          positionY={watermarkPositionY ?? 0.88}
          width={watermarkWidth ?? 0.22}
          rotation={watermarkRotation ?? 0}
          opacity={watermarkOpacity ?? 0.85}
          videoWidth={width}
          videoHeight={height}
        />
      )}
    </AbsoluteFill>
  );
}
