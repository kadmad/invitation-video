import { useEffect, useMemo, useRef, useState } from "react";
import { Player } from "@remotion/player";
import GenericTemplate from "@/remotion/compositions/GenericTemplate";
import { useEditorStore } from "@/store/editorStore";
import { listFonts, getFontFileUrl } from "@/api/fonts";
import { fetchVideoUrl } from "@/api/templates";
import { transliterateBatch } from "@/api/transliterate";
import type { Font, TextBlock } from "@/types";

export default function PreviewPlayer() {
  const { template, font, fontUrl, fieldValues, transliteratedValues, textColorOverrides } = useEditorStore();

  // Use transliterated values when available
  const effectiveValues = useMemo(() => {
    if (Object.keys(transliteratedValues).length === 0) return fieldValues;
    const merged = { ...fieldValues };
    for (const [k, v] of Object.entries(transliteratedValues)) {
      if (v) merged[k] = v;
    }
    return merged;
  }, [fieldValues, transliteratedValues]);
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
  const [blockTranslitCache, setBlockTranslitCache] = useState<Record<string, string>>({});
  const blockTranslitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      return;
    }

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
      const results: Record<string, string> = {};
      for (const [blockId, { parts }] of Object.entries(blockSegments)) {
        const assembled = parts.map((part, i) => {
          if (i % 2 === 1) return part; // tag like {purush} — keep as-is
          const key = `seg:${blockId}:${i}`;
          const translated = segResults[key];
          if (!translated) return part;
          // Preserve original leading/trailing whitespace
          const leadMatch = part.match(/^(\s*)/);
          const trailMatch = part.match(/(\s*)$/);
          const lead = leadMatch ? leadMatch[1] : "";
          const trail = trailMatch ? trailMatch[1] : "";
          return lead + translated.trim() + trail;
        }).join("");
        results[`block:${blockId}`] = assembled;
      }
      setBlockTranslitCache(results);
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
      return translitContent ? { ...block, content: translitContent } : block;
    });
  }, [template, blockTranslitCache]);

  const inputProps = useMemo(
    () => ({
      videoUrl,
      textBlocks: previewBlocks,
      tagValues: effectiveValues,
      fontFamilies,
      width: template?.width || 1080,
      height: template?.height || 1920,
      textColorOverrides: Object.keys(textColorOverrides).length > 0 ? textColorOverrides : undefined,
      defaultTextColor: template?.default_text_color,
      defaultFontFamily: template?.default_font_id ? fontFamilies[template.default_font_id] : undefined,
      overrideFontFamily: font?.family_name,
    }),
    [previewBlocks, effectiveValues, fontFamilies, videoUrl, textColorOverrides, font, template?.default_font_id, template?.width, template?.height, template?.default_text_color]
  );

  if (!template) return null;

  return (
    <div className="card p-4 sticky top-20">
      <p className="text-sm font-medium text-slate-500 mb-3">Live Preview</p>
      <div style={{ position: "relative", width: 360, height: 640 }}>
        <Player
          component={GenericTemplate}
          inputProps={inputProps}
          durationInFrames={template.duration_frames}
          fps={template.fps}
          compositionWidth={template.width}
          compositionHeight={template.height}
          style={{
            width: 360,
            height: 640,
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
      </div>
    </div>
  );
}
