import { useEffect, useState, useCallback, useMemo } from "react";
import { AbsoluteFill, OffthreadVideo, delayRender, continueRender } from "remotion";
import AnimatedText from "../components/AnimatedText";
import AnimatedTextBlock from "../components/AnimatedTextBlock";
import AnimatedImageBlock from "../components/AnimatedImageBlock";
import type { TemplateField, TextBlock, ImageBlock, FormatRange } from "@/types";

interface GenericTemplateProps {
  videoUrl: string | null;
  width: number;
  height: number;
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
}

export default function GenericTemplate({
  videoUrl,
  width,
  height,
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
}: GenericTemplateProps) {
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
          volume={1}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
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
    </AbsoluteFill>
  );
}
