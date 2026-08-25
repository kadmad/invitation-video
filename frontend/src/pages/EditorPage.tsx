import { useEffect, useMemo, useState, useRef, useCallback, type ChangeEvent } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { getTemplate } from "@/api/templates";
import { API_URL } from "@/api/client";
import { useSeo } from "@/lib/seo";
import { toast, errorMessage } from "@/store/toastStore";
import { SITE_NAME, SITE_URL, SITE_DESCRIPTION } from "@/lib/site";
import { listFonts, getFontFileUrl } from "@/api/fonts";
import { createOrder, verifyPayment, adminRender } from "@/api/payments";
import { getRender, updateRender } from "@/api/renders";
import { transliterateBatch, transliterateBatchCandidates } from "@/api/transliterate";
import type { WordCandidates } from "@/api/transliterate";
import TranslitWord from "@/components/common/TranslitWord";
import { getDraft, saveDraft, getGuestDraft, saveGuestDraft } from "@/api/drafts";
import { uploadUserImage, uploadUserMusic } from "@/api/templates";
import { useEditorStore, extractTags } from "@/store/editorStore";
import { useAuthStore } from "@/store/authStore";
import type { Font, TextBlock, ImageBlock, RenderJob } from "@/types";
import PreviewPlayer from "@/components/editor/PreviewPlayer";
import WatermarkPreviewPopup from "@/components/editor/WatermarkPreviewPopup";
import PageTransition from "@/components/common/PageTransition";
import RichTextEditor from "@/components/admin/RichTextEditor";
import { loadRazorpayCheckout } from "@/lib/razorpay";

/** Convert snake_case tag to human-readable label. */
function humanizeTag(tag: string): string {
  return tag
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** For each unique tag, find the first tag_config entry across blocks. */
function getTagConfigs(
  textBlocks: TextBlock[],
  tags: string[]
): Record<string, { label?: string; placeholder?: string; min_chars?: number; max_chars?: number }> {
  const configs: Record<
    string,
    { label?: string; placeholder?: string; min_chars?: number; max_chars?: number }
  > = {};
  for (const tag of tags) {
    for (const block of textBlocks) {
      if (block.tag_config && block.tag_config[tag]) {
        configs[tag] = block.tag_config[tag];
        break;
      }
    }
  }
  return configs;
}

export default function EditorPage() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const isPreviewOnly = searchParams.get("preview") === "1";
  const editRenderId = searchParams.get("editRender");
  const navigate = useNavigate();
  const {
    template,
    font,
    fieldValues,
    transliteratedValues,
    textColorOverrides,
    editorMode,
    blockOverrides,
    blockFormatOverrides,
    transliteratedBlockOverrides,
    setTemplate,
    setFont,
    setFieldValue,
    setFieldValues,
    setTransliteratedValues,
    setTextColorOverride,
    consumePrefill,
    imageUploads,
    setImageUpload,
    seekTo,
    initAdvancedMode,
    exitAdvancedMode,
    setBlockOverride,
    setBlockOverrides,
    setBlockFormatOverrides,
    setBlockFormatOverride,
    setTransliteratedBlockOverrides,
    watermarkPreview: watermarkOptIn,
    setWatermarkPreview: setWatermarkOptIn,
    musicFile,
    musicDurationSeconds,
    musicStartSeconds,
    setMusic,
    setMusicStartSeconds,
    clearMusic,
    reset,
  } = useEditorStore();
  const { token, user: authUser, openAuthModal } = useAuthStore();
  const isLoggedIn = !!token;
  const [fonts, setFonts] = useState<Font[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [showConfirmPopup, setShowConfirmPopup] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [transliteratedLabels, setTransliteratedLabels] = useState<Record<string, string>>({});
  const [transliterationCandidates, setTransliterationCandidates] = useState<Record<string, WordCandidates[]>>({});
  const [selectedCandidateIndices, setSelectedCandidateIndices] = useState<Record<string, number[]>>({});
  const [blockTransliterationCandidates, setBlockTransliterationCandidates] = useState<Record<string, WordCandidates[]>>({});
  const [selectedBlockCandidateIndices, setSelectedBlockCandidateIndices] = useState<Record<string, number[]>>({});
  const labelTranslitTimer = useRef<ReturnType<typeof setTimeout>>();
  const [linkCopied, setLinkCopied] = useState(false);
  const [actuallyRender, setActuallyRender] = useState(false);
  const [locationUrl, setLocationUrl] = useState("");
  const [editingRender, setEditingRender] = useState<RenderJob | null>(null);
  const [editRenderError, setEditRenderError] = useState("");
  const [musicError, setMusicError] = useState("");
  const [musicLimitHit, setMusicLimitHit] = useState(false);
  const musicLimitTimer = useRef<ReturnType<typeof setTimeout>>();
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>();
  const blockOverrideDebounceTimer = useRef<ReturnType<typeof setTimeout>>();
  const saveDraftTimer = useRef<ReturnType<typeof setTimeout>>();
  const draftApplied = useRef(false);

  // Reads live state straight from the stores (never a stale closure) so it is
  // safe to call from cleanup / unload handlers, not just the debounced effect.
  const flushDraftSave = useCallback(() => {
    const state = useEditorStore.getState();
    if (!state.template || !draftApplied.current) return;

    const hasValues = Object.values(state.fieldValues).some((v) => v.trim());
    const hasBlockOverrides = state.editorMode === "advanced" && Object.values(state.blockOverrides).some((v) => v.trim());
    if (!hasValues && !hasBlockOverrides) return;

    const draftData: {
      field_values: Record<string, string>;
      font_id: string | null;
      text_color_override: Record<string, string> | null;
      editor_mode?: string;
      block_overrides?: Record<string, string>;
      block_format_overrides?: Record<string, any[]>;
    } = {
      field_values: state.fieldValues,
      font_id: state.font?.id ?? null,
      text_color_override: Object.keys(state.textColorOverrides).length > 0 ? state.textColorOverrides : null,
    };

    if (state.editorMode === "advanced") {
      draftData.editor_mode = state.editorMode;
      draftData.block_overrides = state.blockOverrides;
      if (Object.keys(state.blockFormatOverrides).length > 0) {
        draftData.block_format_overrides = state.blockFormatOverrides;
      }
    }

    if (useAuthStore.getState().token) {
      saveDraft(state.template.id, draftData).catch(() => {});
    } else {
      saveGuestDraft(state.template.id, draftData);
    }
  }, []);

  // Save immediately when the browser tab closes or refreshes mid-edit, so the
  // 1s autosave debounce below can't lose the last few keystrokes.
  useEffect(() => {
    window.addEventListener("beforeunload", flushDraftSave);
    window.addEventListener("pagehide", flushDraftSave);
    return () => {
      window.removeEventListener("beforeunload", flushDraftSave);
      window.removeEventListener("pagehide", flushDraftSave);
    };
  }, [flushDraftSave]);

  useEffect(() => {
    if (slug) {
      getTemplate(slug).then(setTemplate);
    }
    listFonts().then(setFonts);
    return () => {
      // Same reason as above, for in-app navigation away from the editor —
      // flush before reset() clears the store the cleanup is reading from.
      clearTimeout(saveDraftTimer.current);
      flushDraftSave();
      draftApplied.current = false;
      reset();
    };
  }, [slug, flushDraftSave]);

  // Load draft or prefill once template AND fonts are loaded
  useEffect(() => {
    if (draftApplied.current || !template || fonts.length === 0) return;
    draftApplied.current = true;

    // Editing an existing paid (manual-render) order takes priority over
    // everything else — load its saved values instead of any draft.
    if (editRenderId) {
      getRender(editRenderId).then((render) => {
        // Server-rendered orders were never editable here — that's the one
        // real block. Manual orders always load below regardless of
        // status/can_edit: the user can look and try to save, and if it's
        // already been picked up for rendering, the save itself fails with
        // the backend's "already picked" message (handleSaveRenderEdit).
        if (render.render_method !== "manual") {
          setEditRenderError("This order can't be edited here.");
          return;
        }
        applyDraftData(
          render.field_values,
          render.font_id,
          render.text_color_override,
          render.block_overrides ? "advanced" : undefined,
          render.block_overrides ?? undefined,
          render.block_format_overrides ?? undefined
        );
        setLocationUrl(render.location_url ?? "");
        setEditingRender(render);
      }).catch(() => setEditRenderError("Couldn't load that order — it may not exist or isn't yours."));
      return;
    }

    // Prefill from re-edit takes priority
    const prefill = consumePrefill();
    if (prefill) {
      applyDraftData(
        prefill.fieldValues,
        prefill.fontId,
        prefill.textColorOverrides,
        prefill.editorMode ?? undefined,
        prefill.blockOverrides ?? undefined,
        prefill.blockFormatOverrides ?? undefined
      );
      return;
    }

    // Otherwise load saved draft
    if (isLoggedIn) {
      getDraft(template.id).then((draft) => {
        if (draft) {
          applyDraftData(draft.field_values, draft.font_id, draft.text_color_override, draft.editor_mode, draft.block_overrides, draft.block_format_overrides);
        }
      });
    } else {
      const draft = getGuestDraft(template.id);
      if (draft) {
        applyDraftData(draft.field_values, draft.font_id, draft.text_color_override, draft.editor_mode, draft.block_overrides, draft.block_format_overrides);
      }
    }
  }, [template, fonts, editRenderId]);

  const applyDraftData = (
    values: Record<string, string>,
    fontId: string | null,
    colorOverrides: Record<string, string> | null,
    savedEditorMode?: string,
    savedBlockOverrides?: Record<string, string>,
    savedBlockFormatOverrides?: Record<string, any[]>
  ) => {
    if (!template) return;
    const tags = extractTags(template);
    const restored: Record<string, string> = {};
    for (const tag of tags) {
      restored[tag] = values[tag] ?? "";
    }
    setFieldValues(restored);

    if (colorOverrides && Object.keys(colorOverrides).length > 0) {
      for (const [key, color] of Object.entries(colorOverrides)) {
        setTextColorOverride(key, color);
      }
    }

    if (fontId) {
      const match = fonts.find((f) => f.id === fontId);
      if (match) {
        setFont(match, getFontFileUrl(match.id));
      }
    }

    // Restore advanced mode if saved
    if (savedEditorMode === "advanced" && savedBlockOverrides && Object.keys(savedBlockOverrides).length > 0) {
      initAdvancedMode(savedBlockOverrides);
      if (savedBlockFormatOverrides && Object.keys(savedBlockFormatOverrides).length > 0) {
        setBlockFormatOverrides(savedBlockFormatOverrides);
      }
    }
  };

  // Auto-save draft on changes (debounced)
  useEffect(() => {
    if (!template || !draftApplied.current) return;
    clearTimeout(saveDraftTimer.current);
    saveDraftTimer.current = setTimeout(flushDraftSave, 1000);
    return () => clearTimeout(saveDraftTimer.current);
  }, [fieldValues, font, textColorOverrides, template, isLoggedIn, editorMode, blockOverrides, blockFormatOverrides, flushDraftSave]);

  const tags = useMemo(
    () => (template ? extractTags(template) : []),
    [template]
  );

  const tagConfigs = useMemo(
    () => (template ? getTagConfigs(template.text_blocks ?? [], tags) : {}),
    [template, tags]
  );

  // Build transliterated value from selected candidate indices
  const buildFromCandidates = useCallback(
    (candidates: WordCandidates[], indices: number[]): string => {
      return candidates
        .map((wc, i) => {
          const idx = indices[i] ?? 0;
          return wc.candidates[idx] ?? wc.candidates[0] ?? wc.word;
        })
        .join(" ");
    },
    []
  );

  const handleCandidateSelect = useCallback(
    (tag: string, wordIdx: number, candidateIdx: number) => {
      setSelectedCandidateIndices((prev) => {
        const tagIndices = [...(prev[tag] ?? [])];
        tagIndices[wordIdx] = candidateIdx;
        const next = { ...prev, [tag]: tagIndices };

        // Rebuild transliterated value
        const candidates = transliterationCandidates[tag];
        if (candidates) {
          const rebuilt = buildFromCandidates(candidates, tagIndices);
          const current = useEditorStore.getState().transliteratedValues;
          setTransliteratedValues({ ...current, [tag]: rebuilt });
        }
        return next;
      });
    },
    [transliterationCandidates, buildFromCandidates, setTransliteratedValues]
  );

  const handleBlockCandidateSelect = useCallback(
    (blockId: string, wordIdx: number, candidateIdx: number) => {
      setSelectedBlockCandidateIndices((prev) => {
        const indices = [...(prev[blockId] ?? [])];
        indices[wordIdx] = candidateIdx;
        const next = { ...prev, [blockId]: indices };

        const candidates = blockTransliterationCandidates[blockId];
        if (candidates) {
          const rebuilt = buildFromCandidates(candidates, indices);
          const current = useEditorStore.getState().transliteratedBlockOverrides;
          setTransliteratedBlockOverrides({ ...current, [blockId]: rebuilt });
        }
        return next;
      });
    },
    [blockTransliterationCandidates, buildFromCandidates, setTransliteratedBlockOverrides]
  );

  // Merge all blocks' transliteration_overrides into one map: {latin_word: chosen_transliteration}
  const adminTranslitOverrides = useMemo(() => {
    const merged: Record<string, string> = {};
    for (const block of template?.text_blocks ?? []) {
      if (block.transliteration_overrides) {
        Object.assign(merged, block.transliteration_overrides);
      }
    }
    return merged;
  }, [template]);

  // Auto-transliterate when font language is hindi/gujarati
  const doTransliterate = useCallback(
    (values: Record<string, string>, language: string) => {
      if (language === "english" || !language) {
        setTransliteratedValues({});
        setTransliterationCandidates({});
        setSelectedCandidateIndices({});
        return;
      }
      const nonEmpty: Record<string, string> = {};
      for (const [k, v] of Object.entries(values)) {
        if (v.trim()) nonEmpty[k] = v;
      }
      if (Object.keys(nonEmpty).length === 0) {
        setTransliteratedValues({});
        setTransliterationCandidates({});
        setSelectedCandidateIndices({});
        return;
      }
      // Single API call returns candidates; first candidate = default transliteration
      transliterateBatchCandidates(nonEmpty, language)
        .then((result) => {
          setTransliterationCandidates(result);
          // Build default transliterated values — use admin-selected overrides where available
          const transliterated: Record<string, string> = {};
          const indices: Record<string, number[]> = {};
          for (const [key, words] of Object.entries(result)) {
            const wordIndices: number[] = [];
            transliterated[key] = words
              .map((wc, i) => {
                // Check if admin selected a specific candidate for this word
                const adminChoice = adminTranslitOverrides[wc.word];
                if (adminChoice) {
                  const idx = wc.candidates.indexOf(adminChoice);
                  if (idx >= 0) {
                    wordIndices[i] = idx;
                    return adminChoice;
                  }
                }
                wordIndices[i] = 0;
                return wc.candidates[0] ?? wc.word;
              })
              .join(" ");
            indices[key] = wordIndices;
          }
          setTransliteratedValues(transliterated);
          // Set initial indices from admin overrides (user can change later)
          setSelectedCandidateIndices((prev) => {
            const next = { ...prev };
            for (const [key, idx] of Object.entries(indices)) {
              // Only set if user hasn't already made a selection
              if (!next[key] || next[key].length === 0) next[key] = idx;
            }
            return next;
          });
        })
        .catch((err) => console.error("Transliteration failed:", err));
    },
    [setTransliteratedValues, adminTranslitOverrides]
  );

  // Determine effective language: user override font > block fonts > template default font
  const effectiveLanguage = useMemo(() => {
    // User-selected override font takes priority
    if (font && font.language !== "english") return font.language;
    // Check template default font
    if (template?.default_font_id) {
      const defFont = fonts.find((f) => f.id === template.default_font_id);
      if (defFont && defFont.language !== "english") return defFont.language;
    }
    // Check if any block has a regional font
    for (const block of template?.text_blocks ?? []) {
      if (block.font_id) {
        const blockFont = fonts.find((f) => f.id === block.font_id);
        if (blockFont && blockFont.language !== "english") return blockFont.language;
      }
    }
    return "english";
  }, [font, template, fonts]);

  // The tag text itself is the default value — feed it through transliteration
  // too, same as PreviewPlayer, so an untouched field still shows correctly
  // scripted default text in regional-font templates.
  const placeholderMap = useMemo(() => {
    if (!template) return {};
    const map: Record<string, string> = {};
    for (const tag of extractTags(template)) {
      map[tag] = tag;
    }
    return map;
  }, [template]);

  // Debounced transliteration on field value or font change
  useEffect(() => {
    if (effectiveLanguage === "english") {
      setTransliteratedValues({});
      return;
    }
    clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      // Merge placeholders for unfilled tags so they get transliterated too
      const merged = { ...placeholderMap };
      for (const [k, v] of Object.entries(fieldValues)) {
        if (v) merged[k] = v;
      }
      doTransliterate(merged, effectiveLanguage);
    }, 400);
    return () => clearTimeout(debounceTimer.current);
  }, [fieldValues, effectiveLanguage, doTransliterate, placeholderMap]);

  // Debounced transliteration for block overrides in advanced mode
  useEffect(() => {
    if (editorMode !== "advanced" || effectiveLanguage === "english") {
      setTransliteratedBlockOverrides({});
      setBlockTransliterationCandidates({});
      setSelectedBlockCandidateIndices({});
      return;
    }
    clearTimeout(blockOverrideDebounceTimer.current);
    blockOverrideDebounceTimer.current = setTimeout(() => {
      const nonEmpty: Record<string, string> = {};
      for (const [k, v] of Object.entries(blockOverrides)) {
        if (v.trim()) nonEmpty[k] = v;
      }
      if (Object.keys(nonEmpty).length === 0) {
        setTransliteratedBlockOverrides({});
        setBlockTransliterationCandidates({});
        setSelectedBlockCandidateIndices({});
        return;
      }
      transliterateBatchCandidates(nonEmpty, effectiveLanguage)
        .then((result) => {
          setBlockTransliterationCandidates(result);
          const transliterated: Record<string, string> = {};
          const indices: Record<string, number[]> = {};
          for (const [key, words] of Object.entries(result)) {
            const wordIndices: number[] = [];
            transliterated[key] = words
              .map((wc, i) => {
                const adminChoice = adminTranslitOverrides[wc.word];
                if (adminChoice) {
                  const idx = wc.candidates.indexOf(adminChoice);
                  if (idx >= 0) {
                    wordIndices[i] = idx;
                    return adminChoice;
                  }
                }
                wordIndices[i] = 0;
                return wc.candidates[0] ?? wc.word;
              })
              .join(" ");
            indices[key] = wordIndices;
          }
          setTransliteratedBlockOverrides(transliterated);
          setSelectedBlockCandidateIndices((prev) => {
            const next = { ...prev };
            for (const [key, idx] of Object.entries(indices)) {
              if (!next[key] || next[key].length === 0) next[key] = idx;
            }
            return next;
          });
        })
        .catch((err) => console.error("Block override transliteration failed:", err));
    }, 400);
    return () => clearTimeout(blockOverrideDebounceTimer.current);
  }, [blockOverrides, editorMode, effectiveLanguage, setTransliteratedBlockOverrides]);

  // Transliterate UI labels when regional font selected
  useEffect(() => {
    if (effectiveLanguage === "english" || !template) {
      setTransliteratedLabels({});
      return;
    }
    clearTimeout(labelTranslitTimer.current);
    labelTranslitTimer.current = setTimeout(() => {
      const labelsToTranslate: Record<string, string> = {};

      // Advanced mode: "Block 1", "Block 2", etc.
      const blocks = [...(template.text_blocks ?? [])]
        .filter((b) => b.content?.trim())
        .sort((a, b) => (a.start_time ?? 0) - (b.start_time ?? 0));
      blocks.forEach((_, idx) => {
        labelsToTranslate[`block:${idx}`] = `Block ${idx + 1}`;
      });

      transliterateBatch(labelsToTranslate, effectiveLanguage)
        .then(setTransliteratedLabels)
        .catch(() => {});
    }, 300);
    return () => clearTimeout(labelTranslitTimer.current);
  }, [effectiveLanguage, template]);

  // Effective values: transliterated if available, otherwise raw
  const effectiveValues = useMemo(() => {
    if (Object.keys(transliteratedValues).length === 0) return fieldValues;
    const merged = { ...fieldValues };
    for (const [k, v] of Object.entries(transliteratedValues)) {
      if (v) merged[k] = v;
    }
    return merged;
  }, [fieldValues, transliteratedValues]);

  // --- Music: customer's own uploaded track ---
  const videoDurationSeconds = template ? template.duration_frames / template.fps : 0;
  const musicMaxStartSeconds = musicDurationSeconds
    ? Math.max(0, musicDurationSeconds - videoDurationSeconds)
    : 0;

  const formatMmSs = (seconds: number) => {
    const s = Math.max(0, Math.round(seconds));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };

  const handleMusicFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file after an error
    if (!file) return;
    setMusicError("");

    const objectUrl = URL.createObjectURL(file);
    const probe = new Audio();
    probe.preload = "metadata";
    probe.onloadedmetadata = () => {
      const duration = probe.duration;
      if (!isFinite(duration) || duration <= 0) {
        setMusicError("Couldn't read that audio file.");
        URL.revokeObjectURL(objectUrl);
        return;
      }
      if (duration < videoDurationSeconds) {
        setMusicError(
          `That track is ${formatMmSs(duration)} long — needs to be at least ${formatMmSs(videoDurationSeconds)} (the video's length).`
        );
        URL.revokeObjectURL(objectUrl);
        return;
      }
      setMusic(file, objectUrl, duration);
    };
    probe.onerror = () => {
      setMusicError("Couldn't read that audio file.");
      URL.revokeObjectURL(objectUrl);
    };
    probe.src = objectUrl;
  };

  // The slider spans the whole uploaded track, but dragging past the point
  // where the remaining audio would run out before the video ends clamps
  // back to that limit and flashes a brief "limit reached" note instead.
  const handleMusicSliderChange = (e: ChangeEvent<HTMLInputElement>) => {
    const raw = parseFloat(e.target.value);
    if (raw > musicMaxStartSeconds) {
      setMusicStartSeconds(musicMaxStartSeconds);
      setMusicLimitHit(true);
      clearTimeout(musicLimitTimer.current);
      musicLimitTimer.current = setTimeout(() => setMusicLimitHit(false), 1800);
    } else {
      setMusicStartSeconds(raw);
      setMusicLimitHit(false);
    }
  };

  // Seek preview to the midpoint of a block's time range — same as the admin
  // editor does when a text block is selected, so the customer sees the
  // frame where the tag's text actually looks like it will in the video.
  const seekToBlockMid = (block: TextBlock) => {
    const start = block.start_time ?? 0;
    const end = block.end_time ?? start;
    seekTo((start + end) / 2);
  };

  // --- Mode switch handlers ---
  const handleSwitchToAdvanced = () => {
    if (!template) return;
    // Always re-expand from the current Basic-mode field values — reusing
    // stale blockOverrides here meant a value changed in Basic after a
    // previous Advanced visit wouldn't show up when switching back.
    const textBlocks = template.text_blocks ?? [];
    const expanded: Record<string, string> = {};
    for (const block of textBlocks) {
      if (!block.content) continue;
      const expandedText = block.content.replace(/\{([^{}]+)\}/g, (_, rawTag) => {
        const tag = rawTag.trim();
        return fieldValues[tag] || tag;
      });
      expanded[block.id] = expandedText;
    }
    initAdvancedMode(expanded);
  };

  const handleSwitchToExpress = () => {
    exitAdvancedMode();
  };

  // Step 1: Auth gate -> show confirm/share popup
  const handleRenderClick = () => {
    if (!template) return;
    if (!isLoggedIn) {
      openAuthModal(() => {
        setShowConfirmPopup(true);
      });
      return;
    }
    setShowConfirmPopup(true);
  };

  // Shared price label (with slash-out animation on watermark opt-in) for
  // both the main-page render button and the confirm popup's proceed
  // button, so the customer sees the same price feedback wherever they look.
  const renderPriceLabel = (actionLabel: string) => {
    const fullPaise = template?.price ?? 9900;
    const discountPaise = template?.discount_amount_paise ?? 0;
    const finalPaise = watermarkOptIn ? Math.max(fullPaise - discountPaise, 0) : fullPaise;
    return (
      <span className="inline-flex items-center gap-2">
        <span>{actionLabel} —</span>
        <span className="relative inline-flex items-center gap-1.5">
          {watermarkOptIn && discountPaise > 0 && (
            <span key="struck" className="relative text-white/60 text-sm">
              ₹{(fullPaise / 100).toFixed(0)}
              <span className="absolute left-0 top-1/2 w-full h-[1.5px] bg-white/70 origin-left animate-slice-in" />
            </span>
          )}
          <span key={finalPaise} className="inline-block animate-slide-up">
            ₹{(finalPaise / 100).toFixed(0)}
          </span>
        </span>
      </span>
    );
  };

  // Editing an already-paid manual-render order: no payment, just PATCH the
  // existing job with whatever's currently in the editor and go back.
  const handleSaveRenderEdit = async () => {
    if (!editingRender) return;
    setSubmitting(true);
    try {
      const colorOverride = Object.keys(textColorOverrides).length > 0 ? textColorOverrides : null;
      const advancedBlockOverrides = editorMode === "advanced"
        ? (Object.keys(transliteratedBlockOverrides).length > 0
          ? { ...blockOverrides, ...transliteratedBlockOverrides }
          : blockOverrides)
        : null;
      const advancedBlockFormatOverrides = editorMode === "advanced" && Object.keys(blockFormatOverrides).length > 0
        ? blockFormatOverrides
        : null;

      const currentTagValues: Record<string, string> = {};
      for (const tag of tags) {
        if (effectiveValues[tag] !== undefined) currentTagValues[tag] = effectiveValues[tag];
      }

      await updateRender(editingRender.id, {
        font_id: font?.id ?? null,
        field_values: currentTagValues,
        text_color_override: colorOverride,
        block_overrides: advancedBlockOverrides,
        block_format_overrides: advancedBlockFormatOverrides,
        location_url: locationUrl || null,
      });
      navigate(`/render/${editingRender.id}`);
    } catch (err: any) {
      toast.error(errorMessage(err, "Failed to save changes"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSharePreview = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  // Step 2: Proceed to payment (or direct render for admin)
  const handleProceedToPayment = async () => {
    if (!template) return;
    // Kicked off in parallel with order creation below (not awaited yet) so
    // loading the SDK on demand here, instead of unconditionally on every
    // page via index.html, doesn't add serial latency to checkout.
    const razorpayReady = loadRazorpayCheckout();
    if (!authUser?.is_admin && !authUser?.phone_number) {
      const digits = phoneNumber.replace(/\D/g, "");
      if (!/^[6-9]\d{9}$/.test(digits)) {
        setPhoneError("Enter a valid 10-digit mobile number");
        return;
      }
      setPhoneError("");
    }
    setShowConfirmPopup(false);
    setSubmitting(true);
    try {
      const colorOverride = Object.keys(textColorOverrides).length > 0
        ? textColorOverrides
        : undefined;
      const advancedBlockOverrides = editorMode === "advanced"
        ? (Object.keys(transliteratedBlockOverrides).length > 0
          ? { ...blockOverrides, ...transliteratedBlockOverrides }
          : blockOverrides)
        : undefined;
      const advancedBlockFormatOverrides = editorMode === "advanced" && Object.keys(blockFormatOverrides).length > 0
        ? blockFormatOverrides
        : undefined;

      const currentTagValues: Record<string, string> = {};
      for (const tag of tags) {
        if (effectiveValues[tag] !== undefined) currentTagValues[tag] = effectiveValues[tag];
      }

      // Music is only uploaded now, at confirm time — not when picked — so an
      // abandoned selection never leaves an orphan file in storage.
      let musicKey: string | undefined;
      if (musicFile) {
        const musicUpload = await uploadUserMusic(template.id, musicFile);
        musicKey = musicUpload.music_key;
      }

      if (authUser?.is_admin) {
        const skipRender = import.meta.env.DEV && !actuallyRender;
        const result = await adminRender(
          template.id,
          font?.id ?? null,
          currentTagValues,
          colorOverride,
          advancedBlockOverrides,
          advancedBlockFormatOverrides,
          locationUrl || undefined,
          skipRender,
          musicKey,
          musicStartSeconds
        );
        navigate(`/render/${result.render_job_id}`);
        return;
      }

      const order = await createOrder(
        template.id,
        font?.id ?? null,
        currentTagValues,
        colorOverride,
        advancedBlockOverrides,
        advancedBlockFormatOverrides,
        locationUrl || undefined,
        watermarkOptIn,
        musicKey,
        musicStartSeconds,
        !authUser?.phone_number ? phoneNumber.replace(/\D/g, "") : undefined
      );

      // Order succeeded, so the backend accepted (and saved) the phone
      // number — reflect it locally now so the field never asks again for
      // this account, without waiting on a full profile refetch.
      if (!authUser?.phone_number && phoneNumber) {
        useAuthStore.setState((s) => ({
          user: s.user ? { ...s.user, phone_number: `+91${phoneNumber.replace(/\D/g, "")}` } : s.user,
        }));
      }

      const options = {
        key: order.key_id,
        amount: order.amount,
        currency: order.currency,
        name: "Bring My Matter",
        description: "Video Render",
        order_id: order.razorpay_order_id,
        handler: async (response: {
          razorpay_order_id: string;
          razorpay_payment_id: string;
          razorpay_signature: string;
        }) => {
          try {
            const result = await verifyPayment(
              order.payment_id,
              response.razorpay_order_id,
              response.razorpay_payment_id,
              response.razorpay_signature
            );
            navigate(`/render/${result.render_job_id}`);
          } catch (err: any) {
            toast.error(errorMessage(err, "Payment verification failed"));
          }
        },
        modal: {
          ondismiss: () => {
            setSubmitting(false);
          },
        },
        method: {
          upi: true,
          card: true,
          netbanking: true,
          wallet: true,
        },
        theme: {
          color: "#6366f1",
        },
      };

      await razorpayReady;
      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch (err: any) {
      toast.error(errorMessage(err, "Failed to create payment order"));
      setSubmitting(false);
    }
  };

  // Group blocks: those with tags (user inputs) and static-only blocks
  const blocksWithTags = useMemo(() => {
    if (!template) return [];
    return [...(template.text_blocks ?? [])]
      .sort((a, b) => (a.start_time ?? 0) - (b.start_time ?? 0))
      .map((block) => {
        const blockTags: string[] = [];
        const re = /\{([^{}]+)\}/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(block.content)) !== null) {
          blockTags.push(m[1].trim());
        }
        return { block, tags: blockTags };
      });
  }, [template]);

  // Text blocks with content, sorted by start_time (for advanced mode)
  const textBlocksWithContent = useMemo(() => {
    if (!template) return [];
    return [...(template.text_blocks ?? [])]
      .filter((b) => b.content && b.content.trim())
      .sort((a, b) => (a.start_time ?? 0) - (b.start_time ?? 0));
  }, [template]);

  const uploadableImageBlocks = useMemo(() => {
    if (!template) return [];
    return (template.image_blocks ?? []).filter((b) => b.is_user_uploadable);
  }, [template]);

  // Deduplicate: only show input for a tag in first block that uses it
  const seenTags = useMemo(() => new Set<string>(), [template]);

  const hasLocationTag = useMemo(() => tags.includes("location") || tags.includes("Location"), [tags]);


  // Per-template SEO. These /editor/{slug} URLs are what the sitemap submits
  // as the indexable page for each template, so they need their own title,
  // description, canonical and share image — without this they inherit
  // whatever the previously-viewed route left in <head> and self-canonicalise
  // to the homepage. `?preview=1` shares are noindexed: same template, no
  // unique content, and they'd compete with the canonical URL.
  const seoName = template?.name ?? "";
  const seoTitle = seoName ? `${seoName} — Invitation Video Template` : "Invitation Video Template";
  const seoDescription = template?.seo_description
    || (seoName
      ? `Personalise the ${seoName} video invitation online — add your names, date and venue in English, Hindi or Gujarati, then download an HD video and PDF card in minutes.`
      : SITE_DESCRIPTION);
  const seoImage = template?.thumbnail_key && template?.slug
    ? `${API_URL}/templates/${template.slug}/thumbnail`
    : undefined;

  useSeo({
    title: seoTitle,
    description: seoDescription,
    path: `/editor/${slug ?? ""}`,
    noIndex: isPreviewOnly,
    image: seoImage,
    imageAlt: seoName ? `${seoName} invitation video template preview` : undefined,
    jsonLd: template
      ? {
          "@context": "https://schema.org",
          "@type": "Product",
          name: seoTitle,
          description: seoDescription,
          ...(seoImage ? { image: seoImage } : {}),
          brand: { "@type": "Brand", name: SITE_NAME },
          category: "Video Invitation Template",
          ...(template.price
            ? {
                offers: {
                  "@type": "Offer",
                  price: (template.price / 100).toFixed(2),
                  priceCurrency: "INR",
                  availability: "https://schema.org/InStock",
                  url: `${SITE_URL}/editor/${template.slug}`,
                },
              }
            : {}),
        }
      : undefined,
  });

  if (!template) return <div className="text-center py-12 text-ink-muted">Loading...</div>;

  // Preview-only mode: show just the video player
  if (isPreviewOnly) {
    return (
      <PageTransition>
        <div className="flex flex-col items-center py-4">
          <h1 className="text-xl font-bold text-ink mb-1">{template.name}</h1>
          <p className="text-sm text-ink-muted mb-4">Preview</p>
          <PreviewPlayer />
          <button
            onClick={() => navigate(`/editor/${slug}`)}
            className="btn-brand mt-4 px-6 py-2.5"
          >
            Customize This Template
          </button>
        </div>
      </PageTransition>
    );
  }

  // Reset seen tags on each render
  seenTags.clear();

  const isRegionalFont = effectiveLanguage !== "english";

  return (
    <PageTransition>
    <div className="flex flex-col lg:flex-row gap-4 lg:gap-8">
      {/* Form Panel -- scrolls under the pinned preview on mobile, left column on desktop */}
      {/* Form panel. On desktop this is a flex column: the fields scroll in
          their own region while the render/pay action stays pinned to the
          bottom, so the primary CTA is never scrolled out of reach. On mobile
          the page scrolls normally (the preview is pinned instead). */}
      <div className="w-full lg:w-[420px] lg:flex-shrink-0 lg:flex lg:flex-col lg:sticky lg:top-20 lg:h-[calc(100vh-6rem)] order-2 lg:order-1">
        <div className="editor-scroll lg:flex-1 lg:min-h-0 lg:overflow-y-auto lg:pr-2">
        <h1 className="text-lg font-bold text-ink mb-3">{template.name}</h1>

        {/* Express / Advanced mode toggle */}
        <div style={{ display: "flex", gap: 0, marginBottom: 16 }}>
          <button
            onClick={() => { if (editorMode === "advanced") handleSwitchToExpress(); }}
            style={{
              flex: 1,
              padding: "8px 16px",
              border: "1px solid #d1d5db",
              borderRadius: "8px 0 0 8px",
              background: editorMode === "express" ? "#6366f1" : "#fff",
              color: editorMode === "express" ? "#fff" : "#374151",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Basic
          </button>
          <button
            onClick={() => { if (editorMode === "express") handleSwitchToAdvanced(); }}
            style={{
              flex: 1,
              padding: "8px 16px",
              border: "1px solid #d1d5db",
              borderLeft: "none",
              borderRadius: "0 8px 8px 0",
              background: editorMode === "advanced" ? "#6366f1" : "#fff",
              color: editorMode === "advanced" ? "#fff" : "#374151",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Advanced
          </button>
        </div>

        {/* Form fields */}
        <div className="space-y-2.5 mb-4">
          {editorMode === "express" ? (
            /* Express mode: tag-based inputs */
            <>
              {(() => {
                seenTags.clear();
                return blocksWithTags.map(({ block, tags: blockTags }) => {
                  const newTags = blockTags.filter((t) => !seenTags.has(t));
                  newTags.forEach((t) => seenTags.add(t));
                  if (newTags.length === 0) return null;
                  return newTags.map((tag) => {
                    const cfg = tagConfigs[tag] ?? {};
                    return (
                      <div key={tag}>
                        <textarea
                          placeholder={tag}
                          value={fieldValues[tag] || ""}
                          onChange={(e) => setFieldValue(tag, e.target.value)}
                          onFocus={() => seekToBlockMid(block)}
                          minLength={cfg.min_chars}
                          maxLength={cfg.max_chars}
                          rows={1}
                          className="input-field w-full text-center resize-y placeholder:text-slate-300 text-sm py-2"
                        />
                        {isRegionalFont && transliterationCandidates[tag] && transliterationCandidates[tag].length > 0 && (
                          <div className="bg-brand-50 px-2 py-1 rounded mt-0.5 flex flex-wrap gap-1 items-center">
                            {transliterationCandidates[tag].map((wc, wordIdx) => (
                              <TranslitWord
                                key={wordIdx}
                                word={wc}
                                selectedIndex={selectedCandidateIndices[tag]?.[wordIdx] ?? 0}
                                onSelect={(idx) => handleCandidateSelect(tag, wordIdx, idx)}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  });
                });
              })()}
            </>
          ) : (
            /* Advanced mode: one textarea per text block */
            <>
              {textBlocksWithContent.map((block, idx) => {
                const regionalBlockLabel = transliteratedLabels[`block:${idx}`];
                return (
                  <div key={block.id} onClick={() => seekToBlockMid(block)} onFocus={() => seekToBlockMid(block)}>
                    <label className="block text-xs font-medium text-ink-muted mb-0.5">
                      {regionalBlockLabel || `Block ${idx + 1}`}
                    </label>
                    <RichTextEditor
                      content={blockOverrides[block.id] ?? ""}
                      formatRanges={blockFormatOverrides[block.id] ?? null}
                      onChange={(content, ranges) => {
                        setBlockOverride(block.id, content);
                        setBlockFormatOverride(block.id, ranges);
                      }}
                      showLabel={false}
                    />
                    {isRegionalFont && blockTransliterationCandidates[block.id] && blockTransliterationCandidates[block.id].length > 0 && (
                      <div className="bg-brand-50 px-2 py-1 rounded mt-0.5 flex flex-wrap gap-1 items-center">
                        {blockTransliterationCandidates[block.id].map((wc, wordIdx) => (
                          <TranslitWord
                            key={wordIdx}
                            word={wc}
                            selectedIndex={selectedBlockCandidateIndices[block.id]?.[wordIdx] ?? 0}
                            onSelect={(idx) => handleBlockCandidateSelect(block.id, wordIdx, idx)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}

          {/* Image uploads */}
          {uploadableImageBlocks.map((block) => (
            <div key={block.id}>
              <label className="block text-xs font-medium text-ink-muted mb-0.5">
                {block.label}
              </label>
              {imageUploads[block.id] ? (
                <div className="relative">
                  <img
                    src={imageUploads[block.id]}
                    alt={block.label}
                    className="w-full h-24 object-cover rounded-lg"
                  />
                  <label className="absolute bottom-1.5 right-1.5 btn-brand-outline text-[10px] cursor-pointer bg-surface/90 backdrop-blur-sm px-2 py-0.5">
                    Replace
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file || !template) return;
                        try {
                          const result = await uploadUserImage(template.id, block.id, file);
                          setImageUpload(block.id, result.url);
                        } catch (err) {
                          console.error("Failed to upload image", err);
                        toast.error(errorMessage(err, "Couldn't upload that image. Please try another."));
                          toast.error(errorMessage(err, "Couldn't upload that image. Please try another."));
                        }
                      }}
                    />
                  </label>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center w-full h-20 border-2 border-dashed border-edge rounded-lg cursor-pointer hover:border-brand-300 hover:bg-brand-50/50 transition-all">
                  <svg className="w-6 h-6 text-slate-300 mb-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.41a2.25 2.25 0 013.182 0l2.909 2.91m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                  </svg>
                  <span className="text-[10px] text-ink-muted">Upload {block.label}</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file || !template) return;
                      try {
                        const result = await uploadUserImage(template.id, block.id, file);
                        setImageUpload(block.id, result.url);
                      } catch (err) {
                        console.error("Failed to upload image", err);
                      }
                    }}
                  />
                </label>
              )}
            </div>
          ))}
        </div>

        {/* Google Maps link — only when template has {location} tag */}
        {hasLocationTag && (
          <div className="mb-4">
            <label className="block text-xs font-medium text-ink-muted mb-1">
              Google Maps Link
              <span className="text-ink-muted font-normal ml-1">(optional — for accurate location on PDF)</span>
            </label>
            <div className="relative">
              <input
                type="url"
                placeholder="Paste Google Maps link of your venue"
                value={locationUrl}
                onChange={(e) => setLocationUrl(e.target.value)}
                className="input-field w-full text-sm py-2 pl-8 placeholder:text-slate-300"
              />
              <svg className="w-4 h-4 text-ink-muted absolute left-2.5 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
              </svg>
            </div>
            <p className="text-[10px] text-ink-muted mt-0.5">
              Open Google Maps, find your venue, tap Share and paste the link here
            </p>
          </div>
        )}

        {/* Colour/font customisation intentionally NOT offered here.
            Templates are professionally designed as a whole — letting
            customers recolour text or swap fonts on the checkout step
            mostly produced worse-looking invitations and support requests.
            Admins still control these per-template in the admin editor. */}

        </div>

        {/* Pinned action footer — deliberately OUTSIDE the scroll region above
            so the primary CTA is always visible without scrolling. */}
        <div className="sticky bottom-0 z-20 bg-page pt-3 mt-1 border-t border-edge lg:flex-shrink-0">
        {/* Your own music — replaces the template's original audio */}
        <div className="mb-3">
          <label className="block text-xs font-medium text-ink-muted mb-1">
            Your Own Music <span className="text-ink-muted font-normal">(optional)</span>
          </label>
          {!musicFile ? (
            <label className="input-field w-full text-sm py-2 flex items-center justify-center gap-2 cursor-pointer text-ink-muted">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-2v13M9 19a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm12-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
              </svg>
              Choose an audio file from your device
              <input type="file" accept="audio/*" className="hidden" onChange={handleMusicFileSelect} />
            </label>
          ) : (
            <div className="bg-surface-alt rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-ink truncate">{musicFile.name}</span>
                <button
                  type="button"
                  onClick={clearMusic}
                  className="text-xs text-red-500 hover:text-red-600 shrink-0"
                >
                  Remove
                </button>
              </div>
              {musicDurationSeconds !== null && (
                <>
                  {(() => {
                    const valuePct = (Math.min(musicStartSeconds, musicMaxStartSeconds) / musicDurationSeconds) * 100;
                    const limitPct = (musicMaxStartSeconds / musicDurationSeconds) * 100;
                    const hasBlockedZone = musicMaxStartSeconds < musicDurationSeconds;
                    return (
                      <div className="relative pt-4">
                        {hasBlockedZone && (
                          <div
                            className="absolute top-0 flex flex-col items-center pointer-events-none"
                            style={{ left: `${limitPct}%`, transform: "translateX(-50%)" }}
                            title="Track can't start any later — it would run out before the video ends"
                          >
                            <svg className="w-3.5 h-3.5 text-rose-500" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M12 1a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2h-1V6a5 5 0 0 0-5-5Zm-3 8V6a3 3 0 1 1 6 0v3H9Z" />
                            </svg>
                            <div className="w-0.5 h-2 bg-rose-500" />
                          </div>
                        )}
                        <input
                          type="range"
                          min={0}
                          max={musicDurationSeconds}
                          step={1}
                          value={Math.min(musicStartSeconds, musicMaxStartSeconds)}
                          onChange={handleMusicSliderChange}
                          className="music-slider w-full"
                          style={{
                            background: `linear-gradient(to right,
                              #B98D4C 0%, #B98D4C ${valuePct}%,
                              rgb(var(--c-surface-alt)) ${valuePct}%, rgb(var(--c-surface-alt)) ${limitPct}%,
                              #fda4af ${limitPct}%, #fda4af 100%)`,
                          }}
                          title={hasBlockedZone ? "The pink zone can't be reached — track would run out before the video ends" : undefined}
                        />
                      </div>
                    );
                  })()}
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] text-ink-muted">
                      Plays {formatMmSs(musicStartSeconds)} – {formatMmSs(musicStartSeconds + videoDurationSeconds)}
                      {" "}of {formatMmSs(musicDurationSeconds)}
                    </p>
                    {musicLimitHit && (
                      <p className="text-[11px] text-amber-600 font-medium">
                        Limit reached — track must finish by the video's end
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
          {musicError && <p className="text-[11px] text-red-500 mt-1">{musicError}</p>}
        </div>

        {editingRender ? (
          <button
            onClick={handleSaveRenderEdit}
            disabled={submitting}
            className="btn-brand w-full py-3.5 text-base disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.5 12.75l6 6 9-13.5" />
            </svg>
            {submitting ? "Saving..." : "Save Changes"}
          </button>
        ) : (
          <button
            onClick={handleRenderClick}
            disabled={submitting}
            className="btn-brand w-full py-3.5 text-base disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {submitting ? "Processing..." : "Render Video"}
          </button>
        )}

        {editRenderError && (
          <p className="text-red-500 text-sm text-center mt-2">{editRenderError}</p>
        )}
        </div>

      </div>

      {/* Preview Panel -- pinned compact bar under the navbar on mobile so the
          user can see edits update live without losing their place in the
          form; full-size sticky sidebar on desktop (order-1 mobile, order-2 desktop). */}
      <div className="sticky top-16 z-30 -mx-4 px-4 pb-3 bg-page/95 backdrop-blur-sm lg:static lg:mx-0 lg:px-0 lg:pb-0 lg:bg-transparent lg:backdrop-blur-none flex-1 flex justify-center order-1 lg:order-2">
        <PreviewPlayer />
      </div>

      {/* Modals live here, as siblings of both columns — NOT inside the form
          column. That column is `lg:sticky`, and a sticky element creates its
          own stacking context, which trapped these fixed overlays inside it
          and let the z-30 preview panel paint over the payment dialog. */}
        {/* Confirm & Share popup */}
      {!editingRender && showConfirmPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowConfirmPopup(false)} />
          {/* Vertical stack on mobile; landscape two-column layout once the
              viewport is wide enough (lg) for it, so the dialog reads as a
              wide card instead of a tall scroll on desktop. max-h + its own
              overflow-y-auto so content taller than the viewport (e.g. the
              watermark preview) scrolls inside the dialog instead of being
              clipped off-screen. */}
          <div className="relative bg-surface rounded-2xl shadow-2xl w-full max-w-sm lg:max-w-2xl max-h-[90vh] overflow-y-auto p-6 transition-[max-width] duration-300 ease-in-out my-auto">
            <button
              onClick={() => setShowConfirmPopup(false)}
              className="absolute top-3 right-3 text-ink-muted hover:text-ink-muted transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <h3 className="text-lg font-bold text-ink mb-1">Almost there!</h3>
            <p className="text-sm text-ink-muted mb-5">
              Share this preview with your family to verify before you proceed.
            </p>

            <div className="lg:flex lg:gap-6 lg:items-start">
              {/* Left column: what you entered + share */}
              <div className="lg:w-1/2">
                {/* Summary of entered values */}
                <div className="bg-surface-alt rounded-xl p-3 mb-5 space-y-1">
                  {tags.filter((t) => fieldValues[t]?.trim()).map((tag) => {
                    const cfg = tagConfigs[tag] ?? {};
                    return (
                      <div key={tag} className="flex justify-between text-sm">
                        <span className="text-ink-muted">{cfg.label ?? humanizeTag(tag)}</span>
                        <span className="font-medium text-ink">{fieldValues[tag]}</span>
                      </div>
                    );
                  })}
                </div>

                {/* WhatsApp share */}
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(`Hey! Please check this invitation video preview and let me know if it looks good:\n${window.location.origin}/editor/${slug}?preview=1\n\nThis is just a preview - no details are shared.`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold text-white bg-[#25D366] hover:bg-[#1ebe57] transition-colors mb-3"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
                  </svg>
                  Share Preview on WhatsApp
                </a>
                <p className="text-xs text-ink-muted text-center mb-5 lg:mb-0">
                  Only the video preview is shared — your details stay private
                </p>
              </div>

              {/* Right column: watermark discount opt-in, over the render
                  button, then the render button itself. */}
              <div className="lg:w-1/2 lg:border-l lg:border-edge lg:pl-6">
                {!authUser?.is_admin && !!template?.discount_amount_paise && (
                  <>
                    <label className="flex items-start gap-2.5 mb-3 px-1 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={watermarkOptIn}
                        onChange={(e) => setWatermarkOptIn(e.target.checked)}
                        className="mt-0.5 w-4 h-4 shrink-0 rounded accent-brand-500 cursor-pointer"
                      />
                      <span className="text-sm text-ink-muted leading-snug">
                        Get ₹{(template.discount_amount_paise / 100).toFixed(0)} off with a small brand watermark on one corner of the video
                      </span>
                    </label>

                    {/* Inline preview, right under the checkbox — not a
                        second stacked modal. Always mounted and animated
                        via a 0fr/1fr grid-rows transition (rather than
                        conditionally rendered) so the dialog grows/shrinks
                        as a smooth morph instead of an instant jump. */}
                    <div
                      className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${
                        watermarkOptIn ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                      }`}
                    >
                      <div className="overflow-hidden">
                        <WatermarkPreviewPopup template={template} />
                      </div>
                    </div>
                  </>
                )}

                {/* Dev: actually render checkbox (admin only) */}
                {import.meta.env.DEV && authUser?.is_admin && (
                  <label className="flex items-center gap-2 mb-3 px-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={actuallyRender}
                      onChange={(e) => setActuallyRender(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                    />
                    <span className="text-sm text-ink-muted">Actually render video</span>
                  </label>
                )}

                {/* Phone number — asked once per account, only while none is
                    on file, so order-confirmation WhatsApp has somewhere to
                    send to. */}
                {!authUser?.is_admin && !authUser?.phone_number && (
                  <div className="mb-3 px-1">
                    <label className="block text-sm text-ink-muted mb-1.5">
                      Mobile number, for your order confirmation
                    </label>
                    <div className="flex items-center border border-edge rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-brand-500">
                      <span className="px-3 py-2.5 text-sm text-ink-muted bg-surface-alt border-r border-edge">+91</span>
                      <input
                        type="tel"
                        inputMode="numeric"
                        maxLength={10}
                        placeholder="10-digit mobile number"
                        value={phoneNumber}
                        onChange={(e) => {
                          setPhoneNumber(e.target.value.replace(/\D/g, "").slice(0, 10));
                          setPhoneError("");
                        }}
                        className="flex-1 min-w-0 py-2.5 px-3 text-sm text-ink bg-surface focus:outline-none"
                      />
                    </div>
                    {phoneError && <p className="text-red-500 text-xs mt-1.5">{phoneError}</p>}
                  </div>
                )}

                {/* Proceed to payment / render */}
                <button
                  onClick={handleProceedToPayment}
                  className="btn-brand w-full py-3 text-base"
                >
                  {authUser?.is_admin
                    ? (import.meta.env.DEV && !actuallyRender ? "Skip Render (Dev)" : "Render Video (Admin)")
                    : renderPriceLabel("Proceed to Payment")}
                </button>

                {!authUser?.is_admin && (
                  <p className="text-xs text-ink-muted text-center mt-3">
                    You'll be redirected to a secure payment page
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
    </PageTransition>
  );
}
