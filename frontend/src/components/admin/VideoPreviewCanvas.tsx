import { useRef, useState, useCallback, useEffect, useMemo } from "react";
import { useParams } from "react-router-dom";
import { Player, type PlayerRef } from "@remotion/player";
import GenericTemplate from "@/remotion/compositions/GenericTemplate";
import { useAdminTemplateStore } from "@/store/adminTemplateStore";
import { uploadTemplateVideo, getTemplateVideoUrl, getAdminTemplate } from "@/api/admin";
import { listFonts, getFontFileUrl } from "@/api/fonts";
import { transliterateBatch } from "@/api/transliterate";
import TextBlockOverlay from "./TextBlockOverlay";
import ImageBlockOverlay from "./ImageBlockOverlay";
import type { Font, TextBlock, FormatRange } from "@/types";

interface VideoPreviewCanvasProps {
  playerRef: React.RefObject<PlayerRef | null>;
}

export default function VideoPreviewCanvas({ playerRef }: VideoPreviewCanvasProps) {
  const { id: templateId } = useParams<{ id: string }>();
  const {
    template,
    videoUrl,
    selectedBlockId,
    selectedBlockIds,
    selectedImageBlockId,
    previewBlockTrigger,
    setVideoUrl,
    setTemplate,
    selectBlock,
    selectImageBlock,
  } = useAdminTemplateStore();

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [uploading, setUploading] = useState(false);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [fontList, setFontList] = useState<Font[]>([]);

  const fps = template?.fps || 30;
  const totalFrames = template?.duration_frames || 300;

  // Load fonts
  useEffect(() => { listFonts().then(setFontList); }, []);

  // Auto-refresh video token every 4 min (token TTL is 5 min)
  useEffect(() => {
    if (!templateId || !template?.video_key) return;
    const refresh = () => {
      getTemplateVideoUrl(templateId).then(setVideoUrl).catch(() => {});
    };
    const interval = setInterval(refresh, 4 * 60 * 1000);
    return () => clearInterval(interval);
  }, [templateId, template?.video_key, setVideoUrl]);

  useEffect(() => {
    if (!template) return;
    const fontIds = new Set<string>();
    for (const block of template.text_blocks ?? []) {
      if (block.font_id) fontIds.add(block.font_id);
    }
    if (template.default_font_id) fontIds.add(template.default_font_id);
    fontIds.forEach((fid) => {
      const url = getFontFileUrl(fid);
      const matched = fontList.find((f) => f.id === fid);
      const familyName = matched?.family_name ?? fid;
      const face = new FontFace(familyName, `url(${url})`);
      face.load().then((l) => document.fonts.add(l)).catch(() => {});
    });
  }, [template, fontList]);

  const fontFamilies = useMemo(() => {
    const map: Record<string, string> = {};
    for (const f of fontList) map[f.id] = f.family_name;
    return map;
  }, [fontList]);

  // Show placeholder value if admin set one, otherwise tag name as-is
  const sampleTagValues = useMemo(() => {
    if (!template) return {};
    const values: Record<string, string> = {};
    for (const block of template.text_blocks ?? []) {
      const re = /\{(\w+)\}/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(block.content)) !== null) {
        const tag = m[1];
        if (!values[tag]) {
          const placeholder = block.tag_config?.[tag]?.placeholder;
          values[tag] = placeholder || `{${tag}}`;
        }
      }
    }
    return values;
  }, [template]);

  // Transliterate block content + tag values for regional fonts in preview
  const [translitCache, setTranslitCache] = useState<Record<string, string>>({});
  const translitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!template || fontList.length === 0) return;
    const blocks = template.text_blocks ?? [];
    // Split block content into static segments and tags, transliterate only static parts
    const blockSegments: Record<string, { parts: string[]; language: string }> = {};
    const toTransliterate: Record<string, { text: string; language: string }> = {};

    for (const block of blocks) {
      const effectiveFontId = block.font_id ?? template.default_font_id;
      if (!effectiveFontId) continue;
      const font = fontList.find((f) => f.id === effectiveFontId);
      if (!font || font.language === "english") continue;

      // Split content into alternating [static, tag, static, tag, ...] parts
      const parts = block.content.split(/(\{\w+\})/g);
      const hasStatic = parts.some((p, i) => i % 2 === 0 && p.trim());
      if (hasStatic) {
        blockSegments[block.id] = { parts, language: font.language };
        parts.forEach((part, i) => {
          if (i % 2 === 0 && part.trim()) {
            toTransliterate[`seg:${block.id}:${i}`] = { text: part, language: font.language };
          }
        });
      }

      // Sample tag values used in this block
      const tagRe = /\{(\w+)\}/g;
      let match: RegExpExecArray | null;
      while ((match = tagRe.exec(block.content)) !== null) {
        const tag = match[1];
        const val = sampleTagValues[tag];
        if (val) {
          toTransliterate[`tag:${tag}:${font.language}`] = { text: val, language: font.language };
        }
      }
    }

    if (Object.keys(toTransliterate).length === 0) {
      setTranslitCache({});
      return;
    }

    if (translitTimer.current) clearTimeout(translitTimer.current);
    translitTimer.current = setTimeout(async () => {
      // Group by language
      const byLang: Record<string, Record<string, string>> = {};
      for (const [key, { text, language }] of Object.entries(toTransliterate)) {
        if (!byLang[language]) byLang[language] = {};
        byLang[language][key] = text;
      }

      const segResults: Record<string, string> = {};
      for (const [language, values] of Object.entries(byLang)) {
        try {
          const translated = await transliterateBatch(values, language);
          Object.assign(segResults, translated);
        } catch {
          // Transliteration failed, skip
        }
      }
      // Reassemble block content: transliterated static parts + original tags
      // Also build character position mapping: original index → transliterated index
      const results: Record<string, string> = {};
      for (const [blockId, { parts }] of Object.entries(blockSegments)) {
        let origOffset = 0;
        let newOffset = 0;
        // charMap[origIdx] = newIdx for each character in original content
        const charMap: number[] = [];

        const assembled = parts.map((part, i) => {
          if (i % 2 === 1) {
            // Tag — same length in both
            for (let c = 0; c < part.length; c++) {
              charMap[origOffset + c] = newOffset + c;
            }
            origOffset += part.length;
            newOffset += part.length;
            return part;
          }
          const key = `seg:${blockId}:${i}`;
          const translated = segResults[key];
          const finalPart = translated
            ? (() => {
                const leadMatch = part.match(/^(\s*)/);
                const trailMatch = part.match(/(\s*)$/);
                const lead = leadMatch ? leadMatch[1] : "";
                const trail = trailMatch ? trailMatch[1] : "";
                return lead + translated.trim() + trail;
              })()
            : part;

          // Map each original char proportionally to new positions
          const origLen = part.length;
          const newLen = finalPart.length;
          for (let c = 0; c < origLen; c++) {
            charMap[origOffset + c] = newOffset + Math.round((c / Math.max(1, origLen)) * newLen);
          }
          origOffset += origLen;
          newOffset += newLen;
          return finalPart;
        }).join("");

        // End sentinel
        charMap[origOffset] = newOffset;

        results[`block:${blockId}`] = assembled;
        results[`charmap:${blockId}`] = JSON.stringify(charMap);
      }
      // Include tag value translations (non-block entries)
      for (const [key, val] of Object.entries(segResults)) {
        if (key.startsWith("tag:")) results[key] = val;
      }
      setTranslitCache(results);
    }, 500);

    return () => {
      if (translitTimer.current) clearTimeout(translitTimer.current);
    };
  }, [template, fontList, sampleTagValues]);

  // Build transliterated blocks + tag values for preview
  const previewBlocks = useMemo(() => {
    if (!template) return [];
    const blocks = template.text_blocks ?? [];
    if (Object.keys(translitCache).length === 0) return blocks;

    return blocks.map((block): TextBlock => {
      const translitContent = translitCache[`block:${block.id}`];
      if (translitContent) {
        // Remap format_ranges using character map
        let remappedRanges = block.format_ranges;
        const charMapStr = translitCache[`charmap:${block.id}`];
        if (remappedRanges && remappedRanges.length > 0 && charMapStr) {
          try {
            const charMap: number[] = JSON.parse(charMapStr);
            remappedRanges = remappedRanges.map((r: FormatRange): FormatRange => ({
              ...r,
              start: charMap[r.start] ?? r.start,
              end: charMap[r.end] ?? r.end,
            })).filter((r: FormatRange) => r.end > r.start);
          } catch {
            // Keep original ranges on error
          }
        }
        return { ...block, content: translitContent, format_ranges: remappedRanges };
      }
      return block;
    });
  }, [template, translitCache]);

  const previewTagValues = useMemo(() => {
    if (Object.keys(translitCache).length === 0) return sampleTagValues;
    const merged = { ...sampleTagValues };
    for (const [key, val] of Object.entries(translitCache)) {
      if (key.startsWith("tag:")) {
        const tag = key.split(":")[1];
        merged[tag] = val;
      }
    }
    return merged;
  }, [sampleTagValues, translitCache]);

  const measureContainer = useCallback(() => {
    if (containerRef.current) {
      setContainerSize({ width: containerRef.current.offsetWidth, height: containerRef.current.offsetHeight });
    }
  }, []);

  useEffect(() => {
    measureContainer();
    const observer = new ResizeObserver(measureContainer);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [measureContainer]);

  // Track frame from player + auto-pause at preview end
  // Re-run when template loads to ensure player ref is available
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    const onFrame = () => {
      const f = player.getCurrentFrame();
      setCurrentFrame(f);
      useAdminTemplateStore.getState().setCurrentTime(f / fps);
      // Stop at preview end frame
      const endFrame = useAdminTemplateStore.getState().previewEndFrame;
      if (endFrame !== null && f >= endFrame) {
        player.pause();
        useAdminTemplateStore.getState().setPreviewEndFrame(null);
      }
    };
    player.addEventListener("frameupdate", onFrame as any);
    return () => {
      player.removeEventListener("frameupdate", onFrame as any);
    };
  }, [playerRef.current, fps, template]);

  // Auto-preview on animation change
  useEffect(() => {
    if (previewBlockTrigger === 0 || !playerRef.current || !template || !selectedBlockId) return;
    const block = template.text_blocks?.find((b) => b.id === selectedBlockId);
    if (!block) return;
    useAdminTemplateStore.getState().setPreviewEndFrame(Math.round(block.end_time * fps));
    playerRef.current.seekTo(Math.round(block.start_time * fps));
    playerRef.current.play();
  }, [previewBlockTrigger]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !templateId) return;
    setUploading(true);
    try {
      await uploadTemplateVideo(templateId, file);
      const updated = await getAdminTemplate(templateId);
      setTemplate(updated);
      const url = await getTemplateVideoUrl(templateId);
      setVideoUrl(url);
    } catch (err) { console.error("Failed to upload video", err); }
    finally { setUploading(false); }
  };

  const blocks = template?.text_blocks ?? [];
  const imageBlocks = template?.image_blocks ?? [];
  const currentTime = currentFrame / fps;

  const defaultFontFamily = useMemo(() => {
    if (!template?.default_font_id) return undefined;
    return fontFamilies[template.default_font_id];
  }, [template?.default_font_id, fontFamilies]);

  const inputProps = useMemo(() => ({
    videoUrl: videoUrl ?? null,
    textBlocks: previewBlocks,
    imageBlocks,
    tagValues: previewTagValues,
    fontFamilies,
    width: template?.width || 1080,
    height: template?.height || 1920,
    defaultTextColor: template?.default_text_color,
    defaultFontFamily,
  }), [videoUrl, previewBlocks, imageBlocks, previewTagValues, fontFamilies, template, defaultFontFamily]);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Canvas */}
      <div className="flex-1 flex justify-center overflow-hidden min-h-0 relative">
        <div
          ref={containerRef}
          className="relative bg-black rounded-lg overflow-hidden"
          style={{ aspectRatio: "9/16", height: "100%", maxWidth: "100%" }}
          onMouseDown={() => {
            selectBlock(null);
            selectImageBlock(null);
          }}
        >
          {template && (
            <Player
              key={`${template.default_font_id ?? "no-font"}-${template.default_text_color}`}
              ref={playerRef as React.RefObject<PlayerRef>}
              component={GenericTemplate}
              inputProps={inputProps}
              durationInFrames={totalFrames}
              fps={fps}
              compositionWidth={template.width || 1080}
              compositionHeight={template.height || 1920}
              style={{ width: "100%", height: "100%" }}
              numberOfSharedAudioTags={5}
              clickToPlay={false}
            />
          )}

          {/* Draggable overlays */}
          {containerSize.width > 0 &&
            blocks
              .filter((b) => currentTime >= b.start_time && currentTime <= b.end_time)
              .map((block) => {
                const isSelected = selectedBlockIds?.includes(block.id) ?? block.id === selectedBlockId;
                return (
                  <TextBlockOverlay
                    key={block.id}
                    block={block}
                    selected={isSelected}
                    isPrimary={isSelected && selectedBlockIds?.[0] === block.id}
                    containerWidth={containerSize.width}
                    containerHeight={containerSize.height}
                    fontFamily={fontFamilies[block.font_id ?? template?.default_font_id ?? ""] ?? defaultFontFamily}
                    tagValues={sampleTagValues}
                  />
                );
              })}
          {containerSize.width > 0 &&
            imageBlocks
              .filter((b) => currentTime >= b.start_time && currentTime <= b.end_time)
              .map((block) => (
                <ImageBlockOverlay
                  key={block.id}
                  block={block}
                  selected={block.id === selectedImageBlockId}
                  containerWidth={containerSize.width}
                  containerHeight={containerSize.height}
                />
              ))}
        </div>

        {/* Overlay: time + upload */}
        <div className="absolute top-2 left-2 right-2 flex items-center justify-between pointer-events-none z-20">
          <span className="text-[10px] text-white/70 tabular-nums bg-black/40 rounded px-1.5 py-0.5 pointer-events-auto">
            {currentTime.toFixed(1)}s / {(totalFrames / fps).toFixed(1)}s
          </span>
          <label className="text-[10px] text-white/80 bg-black/40 hover:bg-black/60 rounded px-2 py-1 cursor-pointer pointer-events-auto transition">
            {uploading ? "Uploading..." : videoUrl ? "Replace Video" : "Upload Video"}
            <input type="file" accept="video/*" onChange={handleUpload} className="hidden" disabled={uploading} />
          </label>
        </div>
      </div>
    </div>
  );
}
