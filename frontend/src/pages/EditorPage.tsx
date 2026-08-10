import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { getTemplate } from "@/api/templates";
import { listFonts, getFontFileUrl } from "@/api/fonts";
import { createOrder, verifyPayment, adminRender } from "@/api/payments";
import { transliterateBatch, transliterateBatchCandidates } from "@/api/transliterate";
import type { WordCandidates } from "@/api/transliterate";
import TranslitWord from "@/components/common/TranslitWord";
import { getDraft, saveDraft, getGuestDraft, saveGuestDraft } from "@/api/drafts";
import { uploadUserImage } from "@/api/templates";
import { useEditorStore, extractTags } from "@/store/editorStore";
import { useAuthStore } from "@/store/authStore";
import type { Font, TextBlock, ImageBlock } from "@/types";
import PreviewPlayer from "@/components/editor/PreviewPlayer";
import FontPicker from "@/components/editor/FontPicker";
import PageTransition from "@/components/common/PageTransition";
import RichTextEditor from "@/components/admin/RichTextEditor";

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
    clearTextColorOverride,
    clearFont,
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
    reset,
  } = useEditorStore();
  const { token, user: authUser, openAuthModal } = useAuthStore();
  const isLoggedIn = !!token;
  const [fonts, setFonts] = useState<Font[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [showConfirmPopup, setShowConfirmPopup] = useState(false);
  const [transliteratedLabels, setTransliteratedLabels] = useState<Record<string, string>>({});
  const [transliterationCandidates, setTransliterationCandidates] = useState<Record<string, WordCandidates[]>>({});
  const [selectedCandidateIndices, setSelectedCandidateIndices] = useState<Record<string, number[]>>({});
  const [blockTransliterationCandidates, setBlockTransliterationCandidates] = useState<Record<string, WordCandidates[]>>({});
  const [selectedBlockCandidateIndices, setSelectedBlockCandidateIndices] = useState<Record<string, number[]>>({});
  const labelTranslitTimer = useRef<ReturnType<typeof setTimeout>>();
  const [linkCopied, setLinkCopied] = useState(false);
  const [actuallyRender, setActuallyRender] = useState(false);
  const [locationUrl, setLocationUrl] = useState("");
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>();
  const blockOverrideDebounceTimer = useRef<ReturnType<typeof setTimeout>>();
  const saveDraftTimer = useRef<ReturnType<typeof setTimeout>>();
  const draftApplied = useRef(false);

  useEffect(() => {
    if (slug) {
      getTemplate(slug).then(setTemplate);
    }
    listFonts().then(setFonts);
    return () => {
      draftApplied.current = false;
      reset();
    };
  }, [slug]);

  // Load draft or prefill once template AND fonts are loaded
  useEffect(() => {
    if (draftApplied.current || !template || fonts.length === 0) return;
    draftApplied.current = true;

    // Prefill from re-edit takes priority
    const prefill = consumePrefill();
    if (prefill) {
      applyDraftData(prefill.fieldValues, prefill.fontId, prefill.textColorOverrides);
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
  }, [template, fonts]);

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
    saveDraftTimer.current = setTimeout(() => {
      const hasValues = Object.values(fieldValues).some((v) => v.trim());
      const hasBlockOverrides = editorMode === "advanced" && Object.values(blockOverrides).some((v) => v.trim());
      if (!hasValues && !hasBlockOverrides) return;

      const draftData: {
        field_values: Record<string, string>;
        font_id: string | null;
        text_color_override: Record<string, string> | null;
        editor_mode?: string;
        block_overrides?: Record<string, string>;
        block_format_overrides?: Record<string, any[]>;
      } = {
        field_values: fieldValues,
        font_id: font?.id ?? null,
        text_color_override: Object.keys(textColorOverrides).length > 0 ? textColorOverrides : null,
      };

      if (editorMode === "advanced") {
        draftData.editor_mode = editorMode;
        draftData.block_overrides = blockOverrides;
        if (Object.keys(blockFormatOverrides).length > 0) {
          draftData.block_format_overrides = blockFormatOverrides;
        }
      }

      if (isLoggedIn) {
        saveDraft(template.id, draftData).catch(() => {});
      } else {
        saveGuestDraft(template.id, draftData);
      }
    }, 1000);
    return () => clearTimeout(saveDraftTimer.current);
  }, [fieldValues, font, textColorOverrides, template, isLoggedIn, editorMode, blockOverrides, blockFormatOverrides]);

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

  // Build placeholder map from tag_config
  const placeholderMap = useMemo(() => {
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

      // Express mode: tag labels
      const allTags = extractTags(template);
      const configs = getTagConfigs(template.text_blocks ?? [], allTags);
      for (const tag of allTags) {
        const label = configs[tag]?.label ?? humanizeTag(tag);
        labelsToTranslate[`label:${tag}`] = label;
      }

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

  const handleFontChange = (fontId: string) => {
    const selected = fonts.find((f) => f.id === fontId);
    if (selected) {
      const url = getFontFileUrl(fontId);
      setFont(selected, url);
    }
  };

  // Effective values: transliterated if available, otherwise raw
  const effectiveValues = useMemo(() => {
    if (Object.keys(transliteratedValues).length === 0) return fieldValues;
    const merged = { ...fieldValues };
    for (const [k, v] of Object.entries(transliteratedValues)) {
      if (v) merged[k] = v;
    }
    return merged;
  }, [fieldValues, transliteratedValues]);

  // --- Mode switch handlers ---
  const handleSwitchToAdvanced = () => {
    if (!template) return;
    // Reuse existing block overrides if user already edited in Advanced mode
    if (Object.keys(blockOverrides).length > 0) {
      initAdvancedMode(blockOverrides);
      return;
    }
    const textBlocks = template.text_blocks ?? [];
    const expanded: Record<string, string> = {};
    for (const block of textBlocks) {
      if (!block.content) continue;
      const expandedText = block.content.replace(/\{(\w+)\}/g, (_, tag) => effectiveValues[tag] ?? "");
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

  const handleSharePreview = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  // Step 2: Proceed to payment (or direct render for admin)
  const handleProceedToPayment = async () => {
    if (!template) return;
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
          skipRender
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
        locationUrl || undefined
      );

      const options = {
        key: order.key_id,
        amount: order.amount,
        currency: order.currency,
        name: "Invitation Video",
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
            const detail = err.response?.data?.detail || "Payment verification failed";
            alert(detail);
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

      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch (err: any) {
      const detail = err.response?.data?.detail || "Failed to create payment order";
      alert(detail);
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
        const re = /\{(\w+)\}/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(block.content)) !== null) {
          blockTags.push(m[1]);
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

  const [showCustomize, setShowCustomize] = useState(false);

  if (!template) return <div className="text-center py-12 text-slate-500">Loading...</div>;

  // Preview-only mode: show just the video player
  if (isPreviewOnly) {
    return (
      <PageTransition>
        <div className="flex flex-col items-center py-4">
          <h1 className="text-xl font-bold text-slate-800 mb-1">{template.name}</h1>
          <p className="text-sm text-slate-400 mb-4">Preview</p>
          <PreviewPlayer />
          <button
            onClick={() => navigate(`/editor/${slug}`)}
            className="btn-primary mt-4 px-6 py-2.5"
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
    <div className="flex flex-col lg:flex-row gap-8">
      {/* Form Panel -- order-2 on mobile (preview first), order-1 on desktop (form left) */}
      <div className="w-full lg:w-[420px] lg:flex-shrink-0 lg:overflow-y-auto lg:max-h-[calc(100vh-5rem)] order-2 lg:order-1">
        <h1 className="text-lg font-bold text-slate-800 mb-3">{template.name}</h1>

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
            Express
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
                    const label = cfg.label ?? humanizeTag(tag);
                    const regionalLabel = transliteratedLabels[`label:${tag}`];
                    return (
                      <div key={tag}>
                        <label className="block text-xs font-medium text-slate-600 mb-0.5">
                          {regionalLabel || label}
                        </label>
                        <textarea
                          placeholder={cfg.placeholder || label}
                          value={fieldValues[tag] || ""}
                          onChange={(e) => setFieldValue(tag, e.target.value)}
                          onFocus={() => seekTo(block.start_time ?? 0)}
                          minLength={cfg.min_chars}
                          maxLength={cfg.max_chars}
                          rows={1}
                          className="input-field w-full text-center resize-y placeholder:text-slate-300 text-sm py-2"
                        />
                        {isRegionalFont && transliterationCandidates[tag] && transliterationCandidates[tag].length > 0 && (
                          <div className="bg-primary-50 px-2 py-1 rounded mt-0.5 flex flex-wrap gap-1 items-center">
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
                  <div key={block.id} onClick={() => seekTo(block.start_time ?? 0)}>
                    <label className="block text-xs font-medium text-slate-600 mb-0.5">
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
                      <div className="bg-primary-50 px-2 py-1 rounded mt-0.5 flex flex-wrap gap-1 items-center">
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
              <label className="block text-xs font-medium text-slate-600 mb-0.5">
                {block.label}
              </label>
              {imageUploads[block.id] ? (
                <div className="relative">
                  <img
                    src={imageUploads[block.id]}
                    alt={block.label}
                    className="w-full h-24 object-cover rounded-lg"
                  />
                  <label className="absolute bottom-1.5 right-1.5 btn-secondary text-[10px] cursor-pointer bg-white/90 backdrop-blur-sm px-2 py-0.5">
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
                        }
                      }}
                    />
                  </label>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center w-full h-20 border-2 border-dashed border-slate-200 rounded-lg cursor-pointer hover:border-primary-300 hover:bg-primary-50/50 transition-all">
                  <svg className="w-6 h-6 text-slate-300 mb-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.41a2.25 2.25 0 013.182 0l2.909 2.91m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                  </svg>
                  <span className="text-[10px] text-slate-400">Upload {block.label}</span>
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
            <label className="block text-xs font-medium text-slate-500 mb-1">
              Google Maps Link
              <span className="text-slate-400 font-normal ml-1">(optional — for accurate location on PDF)</span>
            </label>
            <div className="relative">
              <input
                type="url"
                placeholder="Paste Google Maps link of your venue"
                value={locationUrl}
                onChange={(e) => setLocationUrl(e.target.value)}
                className="input-field w-full text-sm py-2 pl-8 placeholder:text-slate-300"
              />
              <svg className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
              </svg>
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5">
              Open Google Maps, find your venue, tap Share and paste the link here
            </p>
          </div>
        )}

        {/* Customize Colors & Font -- hidden by default */}
        <button
          onClick={() => setShowCustomize((v) => !v)}
          className="w-full flex items-center justify-center gap-2 text-sm text-slate-500 hover:text-slate-700 py-2 mb-2 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
          </svg>
          {showCustomize ? "Hide" : "Customize"} Colors & Font
          <svg className={`w-3 h-3 transition-transform ${showCustomize ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {showCustomize && (
          <div className="space-y-4 mb-4" style={{ animation: "fadeSlideIn 0.3s ease-out" }}>
            {/* Universal color override */}
            <div className="card p-4">
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={textColorOverrides._default || template.default_text_color || "#FFFFFF"}
                  onChange={(e) => setTextColorOverride("_default", e.target.value)}
                  className="w-8 h-8 rounded-lg border border-slate-200 cursor-pointer flex-shrink-0"
                />
                <span className="text-sm text-slate-600 flex-1">All text color</span>
                {textColorOverrides._default && (
                  <button
                    onClick={() => clearTextColorOverride("_default")}
                    className="text-xs text-red-400 hover:text-red-500 font-medium"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>

            {/* Font Selector */}
            <FontPicker
              fonts={fonts}
              selectedId={font?.id ?? null}
              fallbackFontId={template.default_font_id}
              onSelect={(fontId) => {
                if (!fontId) {
                  clearFont();
                } else {
                  handleFontChange(fontId);
                }
              }}
            />
          </div>
        )}

        <button
          onClick={handleRenderClick}
          disabled={submitting}
          className="btn-primary w-full py-3.5 text-base disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {submitting ? "Processing..." : "Render Video"}
        </button>

        {/* Confirm & Share popup */}
        {showConfirmPopup && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowConfirmPopup(false)} />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
              <button
                onClick={() => setShowConfirmPopup(false)}
                className="absolute top-3 right-3 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

              <h3 className="text-lg font-bold text-slate-800 mb-1">Almost there!</h3>
              <p className="text-sm text-slate-500 mb-5">
                Share this preview with your family to verify before you proceed.
              </p>

              {/* Summary of entered values */}
              <div className="bg-slate-50 rounded-xl p-3 mb-5 space-y-1">
                {tags.filter((t) => fieldValues[t]?.trim()).map((tag) => {
                  const cfg = tagConfigs[tag] ?? {};
                  return (
                    <div key={tag} className="flex justify-between text-sm">
                      <span className="text-slate-400">{cfg.label ?? humanizeTag(tag)}</span>
                      <span className="font-medium text-slate-700">{fieldValues[tag]}</span>
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
              <p className="text-xs text-slate-400 text-center mb-3">
                Only the video preview is shared — your details stay private
              </p>

              {/* Dev: actually render checkbox (admin only) */}
              {import.meta.env.DEV && authUser?.is_admin && (
                <label className="flex items-center gap-2 mb-3 px-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={actuallyRender}
                    onChange={(e) => setActuallyRender(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="text-sm text-slate-600">Actually render video</span>
                </label>
              )}

              {/* Proceed to payment / render */}
              <button
                onClick={handleProceedToPayment}
                className="btn-primary w-full py-3 text-base"
              >
                {authUser?.is_admin
                  ? (import.meta.env.DEV && !actuallyRender ? "Skip Render (Dev)" : "Render Video (Admin)")
                  : `Proceed to Payment — ₹${template ? (template.price / 100).toFixed(0) : "99"}`}
              </button>

              {!authUser?.is_admin && (
                <p className="text-xs text-slate-400 text-center mt-3">
                  You'll be redirected to a secure payment page
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Preview Panel -- order-1 on mobile (shown first), order-2 on desktop (right side) */}
      <div className="flex-1 flex justify-center order-1 lg:order-2">
        <PreviewPlayer />
      </div>
    </div>
    </PageTransition>
  );
}
