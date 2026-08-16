import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Player, type PlayerRef } from "@remotion/player";
import GenericTemplate from "@/remotion/compositions/GenericTemplate";
import { useEditorStore } from "@/store/editorStore";
import { listFonts, getFontFileUrl } from "@/api/fonts";
import { fetchVideoUrl } from "@/api/templates";
import { transliterateBatch } from "@/api/transliterate";
import type { Font, TextBlock, FormatRange } from "@/types";

export default function PreviewPlayer() {
  const { template, font, fontUrl, fieldValues, transliteratedValues, textColorOverrides, seekToTime, editorMode, blockOverrides, blockFormatOverrides, transliteratedBlockOverrides } = useEditorStore();

  // Build placeholder map from tag_config
  const placeholderValues = useMemo(() => {
    if (!template) return {};
    const map: Record<string, string> = {};
    for (const block of template.text_blocks ?? []) {
      if (!block.tag_config) continue;
      for (const [tag, cfg] of Object.entries(block.tag_config)) {
        if (cfg.placeholder && !map[tag]) map[tag] = cfg.placeholder;
      }
    }
    return map;
  }, [template]);

  // Use transliterated values when available, fall back to placeholder
  const effectiveValues = useMemo(() => {
    // Start with placeholders, overlay only non-empty user values
    const merged = { ...placeholderValues };
    for (const [k, v] of Object.entries(fieldValues)) {
      if (v) merged[k] = v;
    }
    for (const [k, v] of Object.entries(transliteratedValues)) {
      if (v) merged[k] = v;
    }
    return merged;
  }, [fieldValues, transliteratedValues, placeholderValues]);
  const [fontList, setFontList] = useState<Font[]>([]);
  // Load font list so we can map font_id -> family_name
  useEffect(() => {
    listFonts().then(setFontList);
  }, []);

  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!template?.video_key) { setVideoUrl(null); return; }
    const refresh = () => fetchVideoUrl(template.id).then(setVideoUrl).catch(() => {});
    refresh();
    // Refresh token every 4 minutes (token TTL is 5 min)
    const interval = setInterval(refresh, 4 * 60 * 1000);
    return () => clearInterval(interval);
  }, [template?.id, template?.video_key]);

  // Collect unique font_ids from text_blocks and load each font
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

      const fontFace = new FontFace(familyName, `url(${url})`);
      fontFace
        .load()
        .then((loaded) => {
          document.fonts.add(loaded);
        })
        .catch((err) => {
          console.error(`Font load failed for ${fid}:`, err);
        });
    });
  }, [template, fontList]);

  // Also load user-selected override font (optional)
  useEffect(() => {
    if (!font || !fontUrl) return;

    const fontFace = new FontFace(font.family_name, `url(${fontUrl})`);
    fontFace
      .load()
      .then((loaded) => {
        document.fonts.add(loaded);
      })
      .catch((err) => {
        console.error("Font load failed:", err);
      });
  }, [font, fontUrl]);

  // Build fontFamilies map: font_id -> family_name
  const fontFamilies = useMemo(() => {
    const map: Record<string, string> = {};
    for (const f of fontList) {
      map[f.id] = f.family_name;
    }
    return map;
  }, [fontList]);

  // Transliterate static block content for regional fonts
  const playerRef = useRef<PlayerRef>(null);
  const [blockTranslitCache, setBlockTranslitCache] = useState<Record<string, string>>({});
  const [translitDone, setTranslitDone] = useState(false);
  const blockTranslitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasPlayingRef = useRef(false);

  // The Remotion Player's own fullscreen button promotes ITS internal
  // container to the browser's fullscreen top-layer — our watermark div,
  // sitting outside that subtree as a sibling, would otherwise be left
  // behind (elements outside the fullscreen element can't render over it,
  // regardless of z-index). Portal the watermark into whatever the browser
  // reports as fullscreenElement so it stays visible there too.
  const [fullscreenTarget, setFullscreenTarget] = useState<Element | null>(null);
  useEffect(() => {
    const handler = () => setFullscreenTarget(document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    document.addEventListener("webkitfullscreenchange", handler);
    return () => {
      document.removeEventListener("fullscreenchange", handler);
      document.removeEventListener("webkitfullscreenchange", handler);
    };
  }, []);

  useEffect(() => {
    if (!template || fontList.length === 0) return;
    const blocks = template.text_blocks ?? [];
    // Split block content into static segments and tags, transliterate only static parts
    const blockSegments: Record<string, { parts: string[]; language: string }> = {};
    const toTransliterate: Record<string, { text: string; language: string }> = {};

    for (const block of blocks) {
      const effectiveFontId = block.font_id ?? template.default_font_id;
      if (!effectiveFontId) continue;
      const f = fontList.find((ft) => ft.id === effectiveFontId);
      if (!f || f.language === "english") continue;

      // Split content into alternating [static, tag, static, tag, ...] parts
      const parts = block.content.split(/(\{\w+\})/g);
      const hasStatic = parts.some((p, i) => i % 2 === 0 && p.trim());
      if (!hasStatic) continue;

      blockSegments[block.id] = { parts, language: f.language };
      // Send each static segment for transliteration
      parts.forEach((part, i) => {
        if (i % 2 === 0 && part.trim()) {
          toTransliterate[`seg:${block.id}:${i}`] = { text: part, language: f.language };
        }
      });
    }

    if (Object.keys(toTransliterate).length === 0) {
      setBlockTranslitCache({});
      setTranslitDone(true);
      return;
    }

    setTranslitDone(false);

    if (blockTranslitTimer.current) clearTimeout(blockTranslitTimer.current);
    blockTranslitTimer.current = setTimeout(async () => {
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
        } catch { /* skip */ }
      }
      // Reassemble block content: transliterated static parts + original tags
      // Also build character position mapping for format_ranges
      const results: Record<string, string> = {};
      for (const [blockId, { parts }] of Object.entries(blockSegments)) {
        let origOffset = 0;
        let newOffset = 0;
        const charMap: number[] = [];

        const assembled = parts.map((part, i) => {
          if (i % 2 === 1) {
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

          const origLen = part.length;
          const newLen = finalPart.length;
          for (let c = 0; c < origLen; c++) {
            charMap[origOffset + c] = newOffset + Math.round((c / Math.max(1, origLen)) * newLen);
          }
          origOffset += origLen;
          newOffset += newLen;
          return finalPart;
        }).join("");

        charMap[origOffset] = newOffset;
        results[`block:${blockId}`] = assembled;
        results[`charmap:${blockId}`] = JSON.stringify(charMap);
      }
      setBlockTranslitCache(results);
      setTranslitDone(true);
    }, 500);

    return () => { if (blockTranslitTimer.current) clearTimeout(blockTranslitTimer.current); };
  }, [template, fontList]);

  // Build preview blocks with transliterated static content
  const previewBlocks = useMemo(() => {
    if (!template) return [];
    const blocks = template.text_blocks ?? [];
    if (Object.keys(blockTranslitCache).length === 0) return blocks;
    return blocks.map((block): TextBlock => {
      const translitContent = blockTranslitCache[`block:${block.id}`];
      if (!translitContent) return block;

      let remappedRanges = block.format_ranges;
      const charMapStr = blockTranslitCache[`charmap:${block.id}`];
      if (remappedRanges && remappedRanges.length > 0 && charMapStr) {
        try {
          const charMap: number[] = JSON.parse(charMapStr);
          remappedRanges = remappedRanges.map((r: FormatRange): FormatRange => ({
            ...r,
            start: charMap[r.start] ?? r.start,
            end: charMap[r.end] ?? r.end,
          })).filter((r: FormatRange) => r.end > r.start);
        } catch {
          // Keep original on error
        }
      }
      return { ...block, content: translitContent, format_ranges: remappedRanges };
    });
  }, [template, blockTranslitCache]);

  // Tags currently showing placeholder (user hasn't typed)
  const placeholderTags = useMemo(() => {
    const set = new Set<string>();
    for (const [tag, val] of Object.entries(placeholderValues)) {
      if (!fieldValues[tag] && !transliteratedValues[tag]) set.add(tag);
    }
    return set;
  }, [placeholderValues, fieldValues, transliteratedValues]);

  // Check if template uses regional (non-English) font
  const needsTransliteration = useMemo(() => {
    if (!template || fontList.length === 0) return false;
    const blocks = template.text_blocks ?? [];
    for (const block of blocks) {
      const effectiveFontId = block.font_id ?? template.default_font_id;
      if (!effectiveFontId) continue;
      const f = fontList.find((ft) => ft.id === effectiveFontId);
      if (f && f.language !== "english") return true;
    }
    return false;
  }, [template, fontList]);

  // Compute effective block overrides for advanced mode
  const effectiveBlockOverrides = useMemo(() => {
    if (editorMode !== "advanced") return undefined;
    if (Object.keys(blockOverrides).length === 0 && Object.keys(transliteratedBlockOverrides).length === 0) return undefined;
    const isRegionalFont = needsTransliteration;
    const result: Record<string, string> = {};
    for (const key of Object.keys(blockOverrides)) {
      if (isRegionalFont) {
        result[key] = transliteratedBlockOverrides[key] ?? blockOverrides[key];
      } else {
        result[key] = blockOverrides[key];
      }
    }
    return Object.keys(result).length > 0 ? result : undefined;
  }, [editorMode, blockOverrides, transliteratedBlockOverrides, needsTransliteration]);

  // Remap blockFormatOverrides indices for transliterated text
  const effectiveBlockFormatOverrides = useMemo(() => {
    if (editorMode !== "advanced" || Object.keys(blockFormatOverrides).length === 0) return undefined;
    if (!needsTransliteration || Object.keys(transliteratedBlockOverrides).length === 0) {
      return blockFormatOverrides;
    }

    const remapped: Record<string, FormatRange[]> = {};
    for (const [blockId, ranges] of Object.entries(blockFormatOverrides)) {
      if (!ranges || ranges.length === 0) continue;

      const origText = blockOverrides[blockId];
      const transText = transliteratedBlockOverrides[blockId];
      if (!origText || !transText) {
        remapped[blockId] = ranges;
        continue;
      }

      // Build charMap proportionally per line for accuracy
      const origLines = origText.split("\n");
      const transLines = transText.split("\n");
      const charMap: number[] = [];
      let origOffset = 0;
      let transOffset = 0;

      for (let l = 0; l < origLines.length; l++) {
        const origLen = origLines[l].length;
        const transLen = l < transLines.length ? transLines[l].length : origLen;

        for (let c = 0; c < origLen; c++) {
          charMap[origOffset + c] = transOffset + Math.round((c / Math.max(1, origLen)) * transLen);
        }
        origOffset += origLen;
        transOffset += transLen;

        // Account for newline
        if (l < origLines.length - 1) {
          charMap[origOffset] = transOffset;
          origOffset += 1;
          transOffset += 1;
        }
      }
      charMap[origOffset] = transOffset;

      remapped[blockId] = ranges.map((r): FormatRange => ({
        ...r,
        start: charMap[r.start] ?? r.start,
        end: charMap[r.end] ?? r.end,
      })).filter((r) => r.end > r.start);
    }

    return Object.keys(remapped).length > 0 ? remapped : undefined;
  }, [editorMode, blockFormatOverrides, blockOverrides, transliteratedBlockOverrides, needsTransliteration]);

  const inputProps = useMemo(
    () => ({
      videoUrl,
      textBlocks: previewBlocks,
      tagValues: effectiveValues,
      fontFamilies,
      placeholderTags: placeholderTags.size > 0 ? Array.from(placeholderTags) : undefined,
      width: template?.width || 1080,
      height: template?.height || 1920,
      textColorOverrides: Object.keys(textColorOverrides).length > 0 ? textColorOverrides : undefined,
      defaultTextColor: template?.default_text_color,
      defaultFontFamily: template?.default_font_id ? fontFamilies[template.default_font_id] : undefined,
      overrideFontFamily: font?.family_name,
      blockOverrides: effectiveBlockOverrides,
      blockFormatOverrides: effectiveBlockFormatOverrides,
    }),
    [previewBlocks, effectiveValues, fontFamilies, videoUrl, textColorOverrides, font, placeholderTags, template?.default_font_id, template?.width, template?.height, template?.default_text_color, effectiveBlockOverrides, effectiveBlockFormatOverrides]
  );

  // Tag values ready: either no transliteration needed, or transliterated values exist
  const hasFieldInput = Object.values(fieldValues).some((v) => v.trim());
  const tagValuesReady = !needsTransliteration || !hasFieldInput || Object.keys(transliteratedValues).length > 0;
  const blockContentReady = !needsTransliteration || translitDone;
  const previewReady = tagValuesReady && blockContentReady;

  // Pause player while translating, resume when done
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    if (!previewReady) {
      if (player.isPlaying()) {
        wasPlayingRef.current = true;
        player.pause();
      }
    } else if (wasPlayingRef.current) {
      wasPlayingRef.current = false;
      player.play();
    }
  }, [previewReady]);

  // Seek to a block's start frame when the user focuses its input, then keep
  // playing from there so they see their edit in motion, not a frozen frame.
  useEffect(() => {
    if (seekToTime === null || !template) return;
    if (!playerRef.current) {
      setTimeout(() => useEditorStore.getState().clearSeek(), 0);
      return;
    }
    const fps = template.fps || 30;
    const frame = Math.round(seekToTime.time * fps);
    playerRef.current.seekTo(frame);
    if (!playerRef.current.isPlaying()) {
      playerRef.current.play();
    }
    setTimeout(() => useEditorStore.getState().clearSeek(), 0);
  }, [seekToTime, template]);

  if (!template) return null;

  return (
    <div className="card p-2.5 sm:p-3 lg:p-4 lg:sticky lg:top-20">
      <p className="hidden lg:block text-sm font-medium text-slate-500 mb-3">Live Preview</p>
      <div
        className="relative mx-auto w-40 sm:w-52 lg:w-[390px]"
        style={{ aspectRatio: `${template.width} / ${template.height}` }}
      >
        {!previewReady && (
          <div className="absolute inset-0 flex items-center justify-center rounded-xl z-10 pointer-events-none"
            style={{ background: "rgba(0,0,0,0.3)", backdropFilter: "blur(2px)" }}
          >
            <div className="text-center">
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin mx-auto mb-1.5" />
              <p className="text-[10px] text-white/70">Translating...</p>
            </div>
          </div>
        )}
        <Player
          ref={playerRef as React.RefObject<PlayerRef>}
          component={GenericTemplate}
          inputProps={inputProps}
          durationInFrames={template.duration_frames}
          fps={template.fps}
          compositionWidth={template.width}
          compositionHeight={template.height}
          style={{
            width: "100%",
            height: "100%",
            borderRadius: 12,
            overflow: "hidden",
            boxShadow: "0 4px 24px rgba(0,0,0,0.15)",
            filter: "blur(0.5px)",
          }}
          controls
          loop
          autoPlay
          numberOfSharedAudioTags={5}
        />
        {fullscreenTarget ? createPortal(watermarkOverlay, fullscreenTarget) : watermarkOverlay}
      </div>
    </div>
  );
}

const watermarkOverlay = (
  <div
    style={{
      position: "absolute",
      inset: 0,
      pointerEvents: "none",
      overflow: "hidden",
      borderRadius: 12,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 2147483647,
    }}
  >
    <div
      style={{
        transform: "rotate(-30deg)",
        whiteSpace: "nowrap",
        fontSize: 28,
        fontWeight: 700,
        color: "rgba(255, 255, 255, 0.4)",
        letterSpacing: "0.2em",
        lineHeight: "3.5em",
        textAlign: "center",
        userSelect: "none",
        width: "200%",
      }}
    >
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i}>
          PREVIEW &nbsp; PREVIEW &nbsp; PREVIEW &nbsp; PREVIEW
        </div>
      ))}
    </div>
  </div>
);
