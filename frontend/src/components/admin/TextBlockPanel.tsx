import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useParams } from "react-router-dom";
import { useAdminTemplateStore } from "@/store/adminTemplateStore";
import {
  createTextBlock,
  updateTextBlock,
  deleteTextBlock,
  listAdminFonts,
} from "@/api/admin";
import { transliterateBatchCandidates } from "@/api/transliterate";
import type { WordCandidates } from "@/api/transliterate";
import TranslitWord from "@/components/common/TranslitWord";
import ConfirmModal from "@/components/admin/ConfirmModal";
import RichTextEditor from "@/components/admin/RichTextEditor";
import FontPicker from "@/components/editor/FontPicker";
import type { Font, TextBlock } from "@/types";
import { clearAdminDraft } from "@/lib/adminDraft";

const ANIMATION_TYPES = [
  { value: "none", label: "None" },
  { value: "fade_in", label: "Fade In" },
  { value: "fade_up", label: "Fade Up" },
  { value: "fade_down", label: "Fade Down" },
  { value: "slide_up", label: "Slide Up" },
  { value: "slide_down", label: "Slide Down" },
  { value: "slide_left", label: "Slide Left" },
  { value: "slide_right", label: "Slide Right" },
  { value: "scale_pop", label: "Scale Pop" },
  { value: "scale_in", label: "Scale In" },
  { value: "typewriter", label: "Typewriter" },
  { value: "reveal_up", label: "Reveal Up" },
  { value: "reveal_down", label: "Reveal Down" },
  { value: "blur_in", label: "Blur In" },
  { value: "letter_spacing", label: "Letter Spread" },
  { value: "bounce_in", label: "Bounce In" },
  { value: "rotate_in", label: "Rotate In" },
  { value: "glitch", label: "Glitch" },
  { value: "type_blur_reveal", label: "Blur Reveal" },
  { value: "pop_reveal", label: "Pop Reveal" },
  { value: "wave_in", label: "Wave In" },
  { value: "elastic_in", label: "Elastic In" },
  { value: "split_reveal", label: "Split Reveal" },
  { value: "flip_in", label: "Flip In" },
  { value: "cinematic_zoom", label: "Cinematic Zoom" },
  { value: "rubber_band", label: "Rubber Band" },
  { value: "shimmer_in", label: "Shimmer In" },
  { value: "drop_bounce", label: "Drop Bounce" },
  { value: "spiral_in", label: "Spiral In" },
];

const ANIMATION_OUT_TYPES = [
  { value: "none", label: "None" },
  { value: "fade_out", label: "Fade Out" },
  { value: "fade_out_up", label: "Fade Up" },
  { value: "fade_out_down", label: "Fade Down" },
  { value: "slide_out_left", label: "Slide Left" },
  { value: "slide_out_right", label: "Slide Right" },
  { value: "slide_out_up", label: "Slide Up" },
  { value: "slide_out_down", label: "Slide Down" },
  { value: "scale_out", label: "Scale Out" },
  { value: "blur_out", label: "Blur Out" },
  { value: "reveal_out_up", label: "Reveal Up" },
  { value: "reveal_out_down", label: "Reveal Down" },
  { value: "split_close", label: "Split Close" },
  { value: "flip_out", label: "Flip Out" },
  { value: "type_blur_out", label: "Blur Reveal Out" },
  { value: "pop_out", label: "Pop Out" },
  { value: "wave_out", label: "Wave Out" },
  { value: "cinematic_zoom_out", label: "Cinematic Zoom" },
  { value: "rubber_band_out", label: "Rubber Band" },
  { value: "spiral_out", label: "Spiral Out" },
];

const TEXT_ALIGNS = ["left", "center", "right"];
const DEFAULT_DURATION = 3;

function CollapsibleSection({
  title,
  defaultOpen = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-edge last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full py-2 text-xs font-semibold text-ink-muted uppercase tracking-wider hover:text-ink transition"
      >
        {title}
        <svg
          className={`w-3.5 h-3.5 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      <div className={`accordion-content ${open ? "open" : ""}`}>
        <div>
          <div className="pb-3 space-y-3">{children}</div>
        </div>
      </div>
    </div>
  );
}

// Chevron icon
function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`w-4 h-4 text-ink-muted transition-transform duration-200 ${open ? "rotate-180" : ""}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
    </svg>
  );
}

/** CSS keyframe names matching animation_type values */
const ANIMATION_CSS: Record<string, string> = {
  none: "",
  fade_in: "anim-fade-in",
  fade_up: "anim-fade-up",
  fade_down: "anim-fade-down",
  slide_up: "anim-slide-up",
  slide_down: "anim-slide-down",
  slide_left: "anim-slide-left",
  slide_right: "anim-slide-right",
  scale_pop: "anim-scale-pop",
  scale_in: "anim-scale-in",
  typewriter: "anim-fade-in",
  reveal_up: "anim-reveal-up",
  reveal_down: "anim-reveal-down",
  blur_in: "anim-blur-in",
  letter_spacing: "anim-letter-spread",
  bounce_in: "anim-bounce-in",
  rotate_in: "anim-rotate-in",
  glitch: "anim-glitch",
  type_blur_reveal: "anim-type-blur-reveal",
  pop_reveal: "anim-pop-reveal",
  wave_in: "anim-wave-in",
  elastic_in: "anim-elastic-in",
  split_reveal: "anim-split-reveal",
  flip_in: "anim-flip-in",
  cinematic_zoom: "anim-scale-pop",
  rubber_band: "anim-elastic-in",
  shimmer_in: "anim-blur-in",
  drop_bounce: "anim-bounce-in",
  spiral_in: "anim-rotate-in",
};

const ANIMATION_OUT_CSS: Record<string, string> = {
  none: "",
  fade_out: "anim-fade-out",
  fade_out_up: "anim-fade-out-up",
  fade_out_down: "anim-fade-out-down",
  slide_out_left: "anim-slide-out-left",
  slide_out_right: "anim-slide-out-right",
  slide_out_up: "anim-slide-out-up",
  slide_out_down: "anim-slide-out-down",
  scale_out: "anim-scale-out",
  blur_out: "anim-blur-out",
  reveal_out_up: "anim-reveal-out-up",
  reveal_out_down: "anim-reveal-out-down",
  split_close: "anim-split-close",
  flip_out: "anim-flip-out",
  type_blur_out: "anim-blur-out",
  pop_out: "anim-scale-out",
  wave_out: "anim-fade-out-down",
  cinematic_zoom_out: "anim-scale-out",
  rubber_band_out: "anim-scale-out",
  spiral_out: "anim-rotate-in",
};

function AnimationPickerItem({
  value,
  label,
  selected,
  onClick,
  cssMap,
}: {
  value: string;
  label: string;
  selected: boolean;
  onClick: () => void;
  cssMap: Record<string, string>;
}) {
  const cssClass = cssMap[value] || "";
  const [playing, setPlaying] = useState(false);

  const handleClick = () => {
    onClick();
    if (cssClass) {
      setPlaying(false);
      requestAnimationFrame(() => setPlaying(true));
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`relative flex flex-col items-center gap-1 px-1.5 py-2 rounded-lg text-[10px] font-medium transition border ${
        selected
          ? "border-primary-400 bg-primary-50 text-primary-700"
          : "border-slate-150 bg-surface text-ink-muted hover:border-slate-300 hover:bg-surface-alt"
      }`}
    >
      <span
        className={`text-sm font-bold ${playing && cssClass ? cssClass : ""}`}
        onAnimationEnd={() => setPlaying(false)}
        style={{ display: "inline-block" }}
      >
        Aa
      </span>
      <span className="truncate w-full text-center">{label}</span>
    </button>
  );
}

function BlockEditForm({
  block,
  fonts,
  saving,
  saveSuccess,
  onUpdateField,
  onSave,
  onPreviewAnimation,
  contentRef,
  fallbackFontId,
}: {
  block: TextBlock;
  fonts: Font[];
  saving: boolean;
  saveSuccess: boolean;
  onUpdateField: (field: keyof TextBlock, value: unknown) => void;
  onSave: (extraFields?: Partial<TextBlock>) => void;
  onPreviewAnimation: () => void;
  contentRef: React.RefObject<HTMLTextAreaElement | null>;
  fallbackFontId: string | null;
}) {
  // Transliteration preview with candidates for regional fonts
  const effectiveFontId = block.font_id ?? fallbackFontId;
  const selectedFont = effectiveFontId ? fonts.find((f) => f.id === effectiveFontId) : null;
  const fontLanguage = selectedFont?.language ?? "english";
  const isRegionalFont = fontLanguage !== "english" && !!effectiveFontId;
  const [translitCandidates, setTranslitCandidates] = useState<WordCandidates[]>([]);
  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
  const translitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Placeholder transliteration candidates
  const [placeholderCandidates, setPlaceholderCandidates] = useState<Record<string, WordCandidates[]>>({});
  const [placeholderIndices, setPlaceholderIndices] = useState<Record<string, number[]>>({});
  const placeholderTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Build overrides map from current selections and save to block
  const buildOverridesMap = useCallback(() => {
    const overrides: Record<string, string> = {};
    // Content word overrides
    translitCandidates.forEach((wc, idx) => {
      const selIdx = selectedIndices[idx] ?? 0;
      if (wc.candidates[selIdx]) {
        overrides[wc.word] = wc.candidates[selIdx];
      }
    });
    // Placeholder word overrides
    for (const tag of Object.keys(placeholderCandidates)) {
      const words = placeholderCandidates[tag];
      const indices = placeholderIndices[tag] || [];
      words.forEach((wc, idx) => {
        const selIdx = indices[idx] ?? 0;
        if (wc.candidates[selIdx]) {
          overrides[wc.word] = wc.candidates[selIdx];
        }
      });
    }
    return Object.keys(overrides).length > 0 ? overrides : null;
  }, [translitCandidates, selectedIndices, placeholderCandidates, placeholderIndices]);

  // Save handler that includes transliteration overrides. Only actually
  // passes transliteration_overrides through when it changed — passing it
  // unconditionally replaces the block reference in the store on every
  // save, which re-arms the autosave effect below (it keys off `block`),
  // which saves again, forever, for any block with a regional font set.
  const handleSaveWithOverrides = useCallback(() => {
    if (isRegionalFont) {
      const overrides = buildOverridesMap();
      const unchanged = JSON.stringify(overrides) === JSON.stringify(block.transliteration_overrides ?? null);
      onSave(unchanged ? undefined : { transliteration_overrides: overrides });
    } else {
      onSave();
    }
  }, [isRegionalFont, buildOverridesMap, onSave, block.transliteration_overrides]);

  // Auto-save to the server a moment after the last edit, and flush
  // immediately if this block is collapsed/switched away from before that
  // timer fires. Previously an edit only lived in local component state
  // until "Save Block" was clicked, so switching blocks or navigating away
  // without remembering to click it silently discarded the change.
  const pendingSaveRef = useRef(false);
  const isFirstRenderRef = useRef(true);
  const saveRef = useRef(handleSaveWithOverrides);
  saveRef.current = handleSaveWithOverrides;

  useEffect(() => {
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false;
      return;
    }
    pendingSaveRef.current = true;
    const timer = setTimeout(() => {
      pendingSaveRef.current = false;
      saveRef.current();
    }, 1200);
    return () => clearTimeout(timer);
  }, [block]);

  useEffect(() => {
    return () => {
      if (pendingSaveRef.current) {
        saveRef.current();
      }
    };
  }, []);

  useEffect(() => {
    if (!isRegionalFont || !block.content.trim()) {
      setTranslitCandidates([]);
      setSelectedIndices([]);
      return;
    }
    if (translitTimer.current) clearTimeout(translitTimer.current);
    translitTimer.current = setTimeout(() => {
      transliterateBatchCandidates({ content: block.content }, fontLanguage)
        .then((result) => {
          const candidates = result.content || [];
          setTranslitCandidates(candidates);
          // Restore from saved overrides if available, otherwise default to index 0
          const saved = block.transliteration_overrides;
          if (saved) {
            const indices = candidates.map((wc) => {
              const savedVal = saved[wc.word];
              if (savedVal) {
                const idx = wc.candidates.indexOf(savedVal);
                return idx >= 0 ? idx : 0;
              }
              return 0;
            });
            setSelectedIndices(indices);
          } else {
            setSelectedIndices((prev) =>
              prev.length === candidates.length ? prev : new Array(candidates.length).fill(0)
            );
          }
        })
        .catch(() => {
          setTranslitCandidates([]);
          setSelectedIndices([]);
        });
    }, 400);
    return () => {
      if (translitTimer.current) clearTimeout(translitTimer.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [block.content, block.font_id, fontLanguage, isRegionalFont]);

  // Fetch transliteration candidates for placeholder values
  useEffect(() => {
    if (!isRegionalFont || !block.tag_config) {
      setPlaceholderCandidates({});
      setPlaceholderIndices({});
      return;
    }
    const placeholders: Record<string, string> = {};
    for (const [tag, cfg] of Object.entries(block.tag_config)) {
      const ph = cfg?.placeholder;
      if (ph && ph.trim()) placeholders[tag] = ph;
    }
    if (Object.keys(placeholders).length === 0) {
      setPlaceholderCandidates({});
      setPlaceholderIndices({});
      return;
    }
    if (placeholderTimer.current) clearTimeout(placeholderTimer.current);
    placeholderTimer.current = setTimeout(() => {
      transliterateBatchCandidates(placeholders, fontLanguage)
        .then((result) => {
          setPlaceholderCandidates(result);
          const saved = block.transliteration_overrides;
          const newIndices: Record<string, number[]> = {};
          for (const [tag, words] of Object.entries(result)) {
            if (saved) {
              newIndices[tag] = words.map((wc) => {
                const savedVal = saved[wc.word];
                if (savedVal) {
                  const idx = wc.candidates.indexOf(savedVal);
                  return idx >= 0 ? idx : 0;
                }
                return 0;
              });
            } else {
              newIndices[tag] = new Array(words.length).fill(0);
            }
          }
          setPlaceholderIndices(newIndices);
        })
        .catch(() => {
          setPlaceholderCandidates({});
          setPlaceholderIndices({});
        });
    }, 400);
    return () => {
      if (placeholderTimer.current) clearTimeout(placeholderTimer.current);
    };
    // Note: block.transliteration_overrides intentionally excluded — only used for initial restore
    // Live updates go through pushOverridesToStore, not re-fetching candidates
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [block.tag_config, fontLanguage, isRegionalFont]);

  // Push overrides to store so VideoPreviewCanvas picks them up immediately
  const pushOverridesToStore = useCallback((
    nextContentIndices: number[],
    nextPlaceholderIndices: Record<string, number[]>,
  ) => {
    const overrides: Record<string, string> = {};
    translitCandidates.forEach((wc, idx) => {
      const selIdx = nextContentIndices[idx] ?? 0;
      if (wc.candidates[selIdx]) overrides[wc.word] = wc.candidates[selIdx];
    });
    for (const tag of Object.keys(placeholderCandidates)) {
      const words = placeholderCandidates[tag];
      const indices = nextPlaceholderIndices[tag] || [];
      words.forEach((wc, idx) => {
        const selIdx = indices[idx] ?? 0;
        if (wc.candidates[selIdx]) overrides[wc.word] = wc.candidates[selIdx];
      });
    }
    onUpdateField("transliteration_overrides", Object.keys(overrides).length > 0 ? overrides : null);
  }, [translitCandidates, placeholderCandidates, onUpdateField]);

  const handleTranslitSelect = (wordIdx: number, candidateIdx: number) => {
    setSelectedIndices((prev) => {
      const next = [...prev];
      next[wordIdx] = candidateIdx;
      pushOverridesToStore(next, placeholderIndices);
      return next;
    });
  };

  const handlePlaceholderTranslitSelect = (tag: string, wordIdx: number, candidateIdx: number) => {
    setPlaceholderIndices((prev) => {
      const tagIndices = [...(prev[tag] || [])];
      tagIndices[wordIdx] = candidateIdx;
      const next = { ...prev, [tag]: tagIndices };
      pushOverridesToStore(selectedIndices, next);
      return next;
    });
  };

  const tagKeys = block.tag_config ? Object.keys(block.tag_config) : [];

  const addTag = () => {
    const existing = block.tag_config ?? {};
    const newKey = `tag_${Object.keys(existing).length + 1}`;
    onUpdateField("tag_config", { ...existing, [newKey]: { label: "New Tag" } });
  };

  const removeTag = (key: string) => {
    if (!block.tag_config) return;
    const updated = { ...block.tag_config };
    delete updated[key];
    onUpdateField("tag_config", Object.keys(updated).length > 0 ? updated : null);
  };

  const updateTag = (oldKey: string, newKey: string, patch: Record<string, any>) => {
    if (!block.tag_config) return;
    const updated = { ...block.tag_config };
    const config = updated[oldKey] ?? {};
    if (newKey !== oldKey) delete updated[oldKey];
    updated[newKey] = { ...config, ...patch };
    onUpdateField("tag_config", updated);
  };

  return (
    <div className="px-3 pb-3 space-y-1">
      {saveSuccess && (
        <div className="mb-2 px-3 py-1.5 bg-accent-50 text-accent-700 rounded-lg text-xs font-medium flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
          Block saved
        </div>
      )}

      {/* Font picker outside accordion to avoid overflow:hidden clipping */}
      <FontPicker
        fonts={fonts}
        selectedId={block.font_id}
        onSelect={(id) => onUpdateField("font_id", id)}
        fallbackFontId={fallbackFontId}
      />

      <CollapsibleSection title="Content" defaultOpen={false}>
        <div>
          <RichTextEditor
            content={block.content}
            formatRanges={block.format_ranges ?? null}
            onChange={(newContent, newRanges) => {
              onUpdateField("content", newContent);
              onUpdateField("format_ranges", newRanges.length > 0 ? newRanges : null);
            }}
            tagKeys={tagKeys}
          />
          {isRegionalFont && translitCandidates.length > 0 && (
            <div className="bg-primary-50 px-3 py-1.5 rounded-lg mt-1 flex flex-wrap gap-1 items-center">
              {translitCandidates.map((wc, wordIdx) => (
                <TranslitWord
                  key={wordIdx}
                  word={wc}
                  selectedIndex={selectedIndices[wordIdx] ?? 0}
                  onSelect={(idx) => handleTranslitSelect(wordIdx, idx)}
                />
              ))}
            </div>
          )}
          {/* Auto-detected tag placeholders */}
          {(() => {
            const detectedTags = Array.from(block.content.matchAll(/\{(\w+)\}/g), (m) => m[1]);
            const unique = [...new Set(detectedTags)];
            if (unique.length === 0) return null;
            return (
              <div className="mt-2 space-y-1.5">
                {unique.map((tag) => (
                  <div key={tag}>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-ink-muted font-mono shrink-0 w-20 truncate" title={tag}>{`{${tag}}`}</span>
                      <input
                        type="text"
                        value={block.tag_config?.[tag]?.placeholder ?? ""}
                        onChange={(e) => {
                          const existing = block.tag_config ?? {};
                          const cfg = existing[tag] ?? {};
                          onUpdateField("tag_config", {
                            ...existing,
                            [tag]: { ...cfg, placeholder: e.target.value },
                          });
                        }}
                        className="input-field text-xs flex-1 text-ink-muted"
                        placeholder={`Default for ${tag}`}
                      />
                    </div>
                    {isRegionalFont && placeholderCandidates[tag]?.length > 0 && (
                      <div className="bg-primary-50 px-2 py-1 rounded mt-0.5 ml-[5.5rem] flex flex-wrap gap-1 items-center">
                        {placeholderCandidates[tag].map((wc, wordIdx) => (
                          <TranslitWord
                            key={wordIdx}
                            word={wc}
                            selectedIndex={placeholderIndices[tag]?.[wordIdx] ?? 0}
                            onSelect={(idx) => handlePlaceholderTranslitSelect(tag, wordIdx, idx)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                <p className="text-[10px] text-slate-300">Leave empty to show tag name as-is</p>
              </div>
            );
          })()}
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Styling" defaultOpen={true}>
        <div>
          <label className="block text-xs text-ink-muted mb-1">
            Font Size Ratio: {(block.font_size_ratio ?? 0.04).toFixed(3)}
          </label>
          <input
            type="range"
            min="0.01"
            max="0.2"
            step="0.005"
            value={block.font_size_ratio ?? 0.04}
            onChange={(e) => onUpdateField("font_size_ratio", parseFloat(e.target.value))}
            className="w-full accent-primary-500"
          />
        </div>
        <div>
          <label className="block text-xs text-ink-muted mb-1">
            Max Width: {(block.max_width ?? 0.8).toFixed(2)}
          </label>
          <input
            type="range"
            min="0.1"
            max="1.0"
            step="0.05"
            value={block.max_width ?? 0.8}
            onChange={(e) => onUpdateField("max_width", parseFloat(e.target.value))}
            className="w-full accent-primary-500"
          />
        </div>
        <div>
          <label className="block text-xs text-ink-muted mb-1">Text Color</label>
          <input
            type="color"
            value={block.text_color || "#ffffff"}
            onChange={(e) => onUpdateField("text_color", e.target.value)}
            className="w-full h-8 rounded-xl border border-edge cursor-pointer"
          />
        </div>
        <div>
          <label className="block text-xs text-ink-muted mb-1">Text Align</label>
          <select
            value={block.text_align || "center"}
            onChange={(e) => onUpdateField("text_align", e.target.value)}
            className="input-field text-sm w-full"
          >
            {TEXT_ALIGNS.map((a) => (
              <option key={a} value={a}>
                {a.charAt(0).toUpperCase() + a.slice(1)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-ink-muted mb-1">
            Letter Spacing: {(block.letter_spacing ?? 0).toFixed(2)}em
          </label>
          <input
            type="range"
            min="-0.1"
            max="0.5"
            step="0.01"
            value={block.letter_spacing ?? 0}
            onChange={(e) => onUpdateField("letter_spacing", parseFloat(e.target.value))}
            className="w-full accent-primary-500"
          />
        </div>
        <div>
          <label className="block text-xs text-ink-muted mb-1">Font Weight</label>
          <select
            value={block.font_weight || ""}
            onChange={(e) => onUpdateField("font_weight", e.target.value || null)}
            className="input-field text-sm w-full"
          >
            <option value="">Default (font's own weight)</option>
            <option value="300">Light (300)</option>
            <option value="normal">Normal (400)</option>
            <option value="500">Medium (500)</option>
            <option value="600">SemiBold (600)</option>
            <option value="bold">Bold (700)</option>
            <option value="800">ExtraBold (800)</option>
            <option value="900">Black (900)</option>
          </select>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Entry Animation" defaultOpen={false}>
        <div>
          <label className="block text-xs text-ink-muted mb-1.5">Effect</label>
          <div className="grid grid-cols-3 gap-1.5">
            {ANIMATION_TYPES.map((a) => (
              <AnimationPickerItem
                key={a.value}
                value={a.value}
                label={a.label}
                selected={block.animation_type === a.value}
                onClick={() => { onUpdateField("animation_type", a.value); onPreviewAnimation(); }}
                cssMap={ANIMATION_CSS}
              />
            ))}
          </div>
        </div>
        {["type_blur_reveal", "pop_reveal", "wave_in"].includes(block.animation_type) && (
          <div className="flex items-center gap-2">
            <label className="text-xs text-ink-muted">Direction</label>
            <div className="flex rounded-lg border border-edge overflow-hidden">
              <button
                onClick={() => { onUpdateField("anim_in_direction", "ltr"); onPreviewAnimation(); }}
                className={`px-2.5 py-1 text-xs font-medium transition ${
                  (block.anim_in_direction ?? "ltr") === "ltr" ? "bg-primary-500 text-white" : "bg-surface text-ink-muted hover:bg-surface-alt"
                }`}
                title="Left to Right"
              >A → Z</button>
              <button
                onClick={() => { onUpdateField("anim_in_direction", "rtl"); onPreviewAnimation(); }}
                className={`px-2.5 py-1 text-xs font-medium transition ${
                  (block.anim_in_direction ?? "ltr") === "rtl" ? "bg-primary-500 text-white" : "bg-surface text-ink-muted hover:bg-surface-alt"
                }`}
                title="Right to Left"
              >Z → A</button>
            </div>
          </div>
        )}
        <div>
          <label className="block text-xs text-ink-muted mb-1">
            Duration: {(block.anim_in_duration ?? 1.0).toFixed(1)}s
          </label>
          <input
            type="range"
            min="0.1"
            max="5.0"
            step="0.1"
            value={block.anim_in_duration ?? 1.0}
            onChange={(e) => onUpdateField("anim_in_duration", parseFloat(e.target.value))}
            className="w-full accent-primary-500"
          />
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Exit Animation" defaultOpen={false}>
        <div>
          <label className="block text-xs text-ink-muted mb-1.5">Effect</label>
          <div className="grid grid-cols-3 gap-1.5">
            {ANIMATION_OUT_TYPES.map((a) => (
              <AnimationPickerItem
                key={a.value}
                value={a.value}
                label={a.label}
                selected={(block.animation_out ?? "none") === a.value}
                onClick={() => { onUpdateField("animation_out", a.value); onPreviewAnimation(); }}
                cssMap={ANIMATION_OUT_CSS}
              />
            ))}
          </div>
        </div>
        {["type_blur_out", "pop_out", "wave_out"].includes(block.animation_out ?? "none") && (
          <div className="flex items-center gap-2">
            <label className="text-xs text-ink-muted">Direction</label>
            <div className="flex rounded-lg border border-edge overflow-hidden">
              <button
                onClick={() => { onUpdateField("anim_out_direction", "ltr"); onPreviewAnimation(); }}
                className={`px-2.5 py-1 text-xs font-medium transition ${
                  (block.anim_out_direction ?? "ltr") === "ltr" ? "bg-primary-500 text-white" : "bg-surface text-ink-muted hover:bg-surface-alt"
                }`}
                title="Left to Right (first char exits first)"
              >A → Z</button>
              <button
                onClick={() => { onUpdateField("anim_out_direction", "rtl"); onPreviewAnimation(); }}
                className={`px-2.5 py-1 text-xs font-medium transition ${
                  (block.anim_out_direction ?? "ltr") === "rtl" ? "bg-primary-500 text-white" : "bg-surface text-ink-muted hover:bg-surface-alt"
                }`}
                title="Right to Left (last char exits first)"
              >Z → A</button>
            </div>
          </div>
        )}
        <div>
          <label className="block text-xs text-ink-muted mb-1">
            Duration: {(block.anim_out_duration ?? 1.0).toFixed(1)}s
          </label>
          <input
            type="range"
            min="0.1"
            max="5.0"
            step="0.1"
            value={block.anim_out_duration ?? 1.0}
            onChange={(e) => onUpdateField("anim_out_duration", parseFloat(e.target.value))}
            className="w-full accent-primary-500"
          />
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Timing" defaultOpen={false}>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs text-ink-muted mb-1">Start (s)</label>
            <input
              type="number"
              step="0.1"
              min="0"
              value={block.start_time ?? 0}
              onChange={(e) => onUpdateField("start_time", parseFloat(e.target.value) || 0)}
              className="input-field text-sm w-full"
            />
          </div>
          <div>
            <label className="block text-xs text-ink-muted mb-1">End (s)</label>
            <input
              type="number"
              step="0.1"
              min="0"
              value={block.end_time ?? 5}
              onChange={(e) => onUpdateField("end_time", parseFloat(e.target.value) || 0)}
              className="input-field text-sm w-full"
            />
          </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Advanced" defaultOpen={false}>
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs text-ink-muted">Tag Config</label>
            <button
              type="button"
              onClick={addTag}
              className="text-xs text-primary-500 hover:text-primary-700 font-medium"
            >
              + Add Tag
            </button>
          </div>
          {tagKeys.length === 0 ? (
            <p className="text-xs text-ink-muted">No tags configured</p>
          ) : (
            <div className="space-y-2">
              {tagKeys.map((key) => (
                <div key={key} className="bg-surface-alt rounded-lg p-2 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={key}
                      onChange={(e) =>
                        updateTag(key, e.target.value, { label: block.tag_config?.[key]?.label ?? "" })
                      }
                      className="input-field text-xs flex-1 font-mono"
                      placeholder="tag_key"
                    />
                    <input
                      type="text"
                      value={block.tag_config?.[key]?.label ?? ""}
                      onChange={(e) => updateTag(key, key, { label: e.target.value })}
                      className="input-field text-xs flex-1"
                      placeholder="Label"
                    />
                    <button
                      type="button"
                      onClick={() => removeTag(key)}
                      className="text-red-400 hover:text-red-600 text-xs"
                    >
                      x
                    </button>
                  </div>
                  <input
                    type="text"
                    value={block.tag_config?.[key]?.placeholder ?? ""}
                    onChange={(e) => updateTag(key, key, { placeholder: e.target.value })}
                    className="input-field text-xs w-full text-ink-muted"
                    placeholder="Placeholder text (e.g. Rahul & Priya)"
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </CollapsibleSection>

      <button
        onClick={handleSaveWithOverrides}
        disabled={saving}
        className="btn-primary w-full text-sm disabled:opacity-50 mt-2 sticky bottom-0"
      >
        {saving ? "Saving..." : "Save Block"}
      </button>
    </div>
  );
}

export default function TextBlockPanel() {
  const { id: templateId } = useParams<{ id: string }>();
  const {
    template,
    selectedBlockId,
    selectedBlockIds,
    expandedBlockId,
    currentTime,
    selectBlock,
    selectBlockMulti,
    expandBlock,
    updateBlock,
    addBlock,
    removeBlock,
    triggerBlockPreview,
  } = useAdminTemplateStore();

  const [fonts, setFonts] = useState<Font[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleteAllTarget, setDeleteAllTarget] = useState(false);
  const [showAllBlocks, setShowAllBlocks] = useState(false);
  const contentInputRef = useRef<HTMLTextAreaElement | null>(null);
  const blockListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listAdminFonts().then(setFonts).catch(console.error);
  }, []);

  const allBlocks = useMemo(() => {
    if (!template?.text_blocks) return [];
    return [...template.text_blocks].sort((a, b) => a.start_time - b.start_time || a.sort_order - b.sort_order);
  }, [template?.text_blocks]);

  // Blocks visible at current frame
  const visibleBlocks = useMemo(() => {
    return allBlocks.filter((b) => currentTime >= b.start_time && currentTime <= b.end_time);
  }, [allBlocks, currentTime]);

  // Off-screen blocks (exist but not at current time)
  const offscreenCount = allBlocks.length - visibleBlocks.length;

  // Blocks to display based on eye toggle
  const displayedBlocks = showAllBlocks ? allBlocks : visibleBlocks;

  const defaultColor = template?.default_text_color || "#FFFFFF";
  const defaultFontId = template?.default_font_id ?? null;

  // Auto-focus content input when block expanded
  useEffect(() => {
    if (expandedBlockId && contentInputRef.current) {
      const timer = setTimeout(() => {
        contentInputRef.current?.focus();
        contentInputRef.current?.select();
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [expandedBlockId]);

  // Scroll expanded block into view
  useEffect(() => {
    if (!expandedBlockId || !blockListRef.current) return;
    const el = blockListRef.current.querySelector(`[data-block-id="${expandedBlockId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [expandedBlockId]);

  // Add block at current playhead position
  const handleAddBlock = async () => {
    if (!templateId) return;
    const startTime = Math.round(currentTime * 10) / 10; // snap to 0.1s
    const endTime = startTime + DEFAULT_DURATION;
    setSaving(true);
    try {
      const block = await createTextBlock(templateId, {
        content: "New Text",
        sort_order: allBlocks.length,
        position_x: 0.5,
        position_y: 0.5,
        max_width: 0.8,
        font_size_ratio: 0.04,
        text_color: defaultColor,
        text_align: "center",
        animation_type: "none",
        animation_out: "none",
        anim_in_direction: "ltr",
        anim_out_direction: "ltr",
        anim_in_duration: 1.0,
        anim_out_duration: 1.0,
        start_time: startTime,
        end_time: endTime,
      });
      addBlock(block);
      // addBlock auto-selects, auto-focus will fire via effect
    } catch (err) {
      console.error("Failed to add block", err);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteBlock = async (blockId?: string) => {
    const target = blockId || deleteTarget;
    if (!templateId || !target) return;
    try {
      await deleteTextBlock(templateId, target);
    } catch (err) {
      console.error("Failed to delete block from server", err);
      // Still remove from UI even if server fails (block may not be saved yet)
    }
    removeBlock(target);
    if (deleteTarget) setDeleteTarget(null);
  };

  const handleDeleteAllVisible = async () => {
    if (!templateId) return;
    const blocksToDelete = showAllBlocks ? allBlocks : visibleBlocks;
    try {
      await Promise.all(blocksToDelete.map((b) => deleteTextBlock(templateId, b.id)));
      blocksToDelete.forEach((b) => removeBlock(b.id));
      setDeleteAllTarget(false);
      selectBlock(null);
    } catch (err) {
      console.error("Failed to delete blocks", err);
    }
  };

  const handleSaveBlock = async (blockId: string, extraFields?: Partial<TextBlock>) => {
    if (!templateId) return;
    const block = allBlocks.find((b) => b.id === blockId);
    if (!block) return;
    setSaving(true);
    try {
      const payload = extraFields ? { ...block, ...extraFields } : block;
      await updateTextBlock(templateId, block.id, payload);
      if (extraFields) updateBlock(blockId, extraFields);
      clearAdminDraft(templateId);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err) {
      console.error("Failed to save block", err);
    } finally {
      setSaving(false);
    }
  };

  const handleCloneBlock = async (source: TextBlock) => {
    if (!templateId) return;
    setSaving(true);
    try {
      const cloned = await createTextBlock(templateId, {
        content: source.content,
        sort_order: allBlocks.length,
        position_x: Math.min(1, source.position_x + 0.02),
        position_y: Math.min(1, source.position_y + 0.02),
        max_width: source.max_width,
        font_size_ratio: source.font_size_ratio,
        text_color: source.text_color,
        text_align: source.text_align,
        letter_spacing: source.letter_spacing,
        font_weight: source.font_weight,
        font_id: source.font_id,
        animation_type: source.animation_type,
        animation_out: source.animation_out,
        anim_in_direction: source.anim_in_direction,
        anim_out_direction: source.anim_out_direction,
        anim_in_duration: source.anim_in_duration,
        anim_out_duration: source.anim_out_duration,
        start_time: source.start_time,
        end_time: source.end_time,
        tag_config: source.tag_config,
        format_ranges: source.format_ranges,
        transliteration_overrides: source.transliteration_overrides,
      });
      addBlock(cloned);
    } catch (err) {
      console.error("Failed to clone block", err);
    } finally {
      setSaving(false);
    }
  };

  const updateField = (blockId: string, field: keyof TextBlock, value: unknown) => {
    updateBlock(blockId, { [field]: value } as Partial<TextBlock>);
  };

  // Click block header: select (shift for multi-select) + show transform on canvas
  const handleBlockClick = (blockId: string, shiftKey: boolean) => {
    selectBlockMulti(blockId, shiftKey);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-xs font-semibold text-ink-muted uppercase tracking-wider">
            Text Blocks
          </h3>
          <p className="text-[10px] text-ink-muted mt-0.5">
            {showAllBlocks
              ? `${allBlocks.length} total`
              : `${visibleBlocks.length} visible at ${currentTime.toFixed(1)}s`}
            {!showAllBlocks && offscreenCount > 0 && (
              <span className="text-slate-300"> &middot; {offscreenCount} off-screen</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {/* Eye toggle: filter by current time vs show all */}
          <button
            onClick={() => setShowAllBlocks(!showAllBlocks)}
            className={`p-1.5 rounded-lg transition ${
              showAllBlocks
                ? "text-primary-500 bg-primary-50"
                : "text-ink-muted hover:text-ink-muted hover:bg-surface-alt"
            }`}
            title={showAllBlocks ? "Showing all blocks" : "Showing blocks at current time"}
          >
            {showAllBlocks ? (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
              </svg>
            )}
          </button>
          {/* Delete all visible blocks */}
          {displayedBlocks.length > 0 && (
            <button
              onClick={() => setDeleteAllTarget(true)}
              className="p-1.5 rounded-lg text-ink-muted hover:text-red-500 hover:bg-red-50 transition"
              title={`Delete ${showAllBlocks ? "all" : "visible"} blocks (${displayedBlocks.length})`}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Block list — only blocks visible at current frame */}
      <div ref={blockListRef} className="flex-1 overflow-y-auto space-y-1.5">
        {displayedBlocks.length === 0 ? (
          <div className="text-center py-8">
            <svg className="w-8 h-8 text-slate-300 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" />
            </svg>
            <p className="text-xs text-ink-muted mb-1">
              {allBlocks.length === 0
                ? "No text blocks yet"
                : "No blocks at this frame"
              }
            </p>
            <p className="text-[10px] text-slate-300">
              Scrub to a position and add a block
            </p>
          </div>
        ) : (
          displayedBlocks.map((block) => {
            const isSelected = selectedBlockIds.includes(block.id);
            const isExpanded = block.id === expandedBlockId;

            return (
              <div
                key={block.id}
                data-block-id={block.id}
                className={`rounded-xl transition-all duration-200 ${
                  isSelected
                    ? "bg-primary-50 ring-1 ring-primary-200"
                    : "bg-surface ring-1 ring-slate-100 hover:ring-edge"
                }`}
              >
                {/* Block header row */}
                <div
                  className="flex items-center gap-2 px-3 py-2.5 cursor-pointer select-none"
                  onClick={(e) => handleBlockClick(block.id, e.shiftKey)}
                >
                  {/* Time badge */}
                  <span className="flex-shrink-0 text-[9px] font-mono bg-surface-alt text-ink-muted rounded px-1.5 py-0.5">
                    {block.start_time.toFixed(1)}–{block.end_time.toFixed(1)}s
                  </span>

                  {/* Block label */}
                  <span className={`truncate flex-1 text-sm ${isSelected ? "text-primary-700 font-medium" : "text-ink"}`}>
                    {block.content.replace(/\{(\w+)\}/g, (_, t) => t) || "Empty block"}
                  </span>

                  {/* Chevron — expand/collapse on click */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      expandBlock(block.id);
                    }}
                    className="p-0.5 rounded hover:bg-slate-200 transition flex-shrink-0"
                  >
                    <ChevronIcon open={isExpanded} />
                  </button>

                  {/* Clone button */}
                  <button
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCloneBlock(block);
                    }}
                    className="text-ink-muted hover:text-primary-600 p-1 flex items-center justify-center flex-shrink-0"
                    title="Clone block"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
                    </svg>
                  </button>

                  {/* Delete button — direct delete, undo via Ctrl+Z */}
                  <button
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteBlock(block.id);
                    }}
                    className="text-red-400 hover:text-red-600 p-1 flex items-center justify-center flex-shrink-0"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                    </svg>
                  </button>
                </div>

                {/* Accordion edit form */}
                <div className={`accordion-content ${isExpanded ? "open" : ""}`}>
                  <div>
                    {isExpanded && (
                      <BlockEditForm
                        block={block}
                        fonts={fonts}
                        saving={saving}
                        saveSuccess={saveSuccess}
                        onUpdateField={(field, value) => updateField(block.id, field, value)}
                        onSave={(extra) => handleSaveBlock(block.id, extra)}
                        onPreviewAnimation={triggerBlockPreview}
                        contentRef={contentInputRef}
                        fallbackFontId={defaultFontId}
                      />
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}

        {/* Add block at current frame */}
        <button
          onClick={handleAddBlock}
          disabled={saving}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border-2 border-dashed border-edge text-ink-muted hover:border-primary-300 hover:text-primary-600 hover:bg-primary-50/50 transition-all duration-200 text-xs font-medium disabled:opacity-50"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Add Block at {currentTime.toFixed(1)}s
        </button>
      </div>

      {/* All blocks overview — collapsed list of off-screen blocks (hidden when eye toggle shows all) */}
      {!showAllBlocks && offscreenCount > 0 && (
        <div className="pt-2 mt-2 border-t border-edge">
          <details className="group">
            <summary className="text-[10px] text-ink-muted cursor-pointer hover:text-ink-muted select-none list-none flex items-center gap-1">
              <svg className="w-3 h-3 transition-transform group-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
              {offscreenCount} block{offscreenCount !== 1 ? "s" : ""} at other times
            </summary>
            <div className="mt-1.5 space-y-0.5 max-h-32 overflow-y-auto">
              {allBlocks
                .filter((b) => !visibleBlocks.includes(b))
                .map((b) => (
                  <div
                    key={b.id}
                    className="flex items-center gap-2 px-2 py-1 rounded text-[10px] text-ink-muted hover:bg-surface-alt cursor-default"
                  >
                    <span className="font-mono">{b.start_time.toFixed(1)}–{b.end_time.toFixed(1)}s</span>
                    <span className="truncate">{b.content.replace(/\{(\w+)\}/g, (_, t) => t)}</span>
                  </div>
                ))}
            </div>
          </details>
        </div>
      )}

      <ConfirmModal
        open={!!deleteTarget}
        title="Delete Text Block"
        message="Are you sure you want to delete this text block? This action cannot be undone."
        onConfirm={handleDeleteBlock}
        onCancel={() => setDeleteTarget(null)}
      />

      <ConfirmModal
        open={deleteAllTarget}
        title="Delete All Blocks"
        message={`Delete ${displayedBlocks.length} ${showAllBlocks ? "" : "visible "}text block${displayedBlocks.length !== 1 ? "s" : ""}? This cannot be undone.`}
        onConfirm={handleDeleteAllVisible}
        onCancel={() => setDeleteAllTarget(false)}
      />

    </div>
  );
}
