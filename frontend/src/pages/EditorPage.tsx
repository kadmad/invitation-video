import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { getTemplate } from "@/api/templates";
import { listFonts, getFontFileUrl } from "@/api/fonts";
import { createOrder, verifyPayment } from "@/api/payments";
import { transliterateBatch } from "@/api/transliterate";
import { getDraft, saveDraft, getGuestDraft, saveGuestDraft } from "@/api/drafts";
import { uploadUserImage } from "@/api/templates";
import { useEditorStore, extractTags } from "@/store/editorStore";
import { useAuthStore } from "@/store/authStore";
import type { Font, TextBlock, ImageBlock } from "@/types";
import PreviewPlayer from "@/components/editor/PreviewPlayer";
import FontPicker from "@/components/editor/FontPicker";
import PageTransition from "@/components/common/PageTransition";

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
): Record<string, { label?: string; min_chars?: number; max_chars?: number }> {
  const configs: Record<
    string,
    { label?: string; min_chars?: number; max_chars?: number }
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
    reset,
  } = useEditorStore();
  const { token, openAuthModal } = useAuthStore();
  const isLoggedIn = !!token;
  const [fonts, setFonts] = useState<Font[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [showConfirmPopup, setShowConfirmPopup] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>();
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
          applyDraftData(draft.field_values, draft.font_id, draft.text_color_override);
        }
      });
    } else {
      const draft = getGuestDraft(template.id);
      if (draft) {
        applyDraftData(draft.field_values, draft.font_id, draft.text_color_override);
      }
    }
  }, [template, fonts]);

  const applyDraftData = (
    values: Record<string, string>,
    fontId: string | null,
    colorOverrides: Record<string, string> | null
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
  };

  // Auto-save draft on changes (debounced)
  useEffect(() => {
    if (!template || !draftApplied.current) return;
    clearTimeout(saveDraftTimer.current);
    saveDraftTimer.current = setTimeout(() => {
      const hasValues = Object.values(fieldValues).some((v) => v.trim());
      if (!hasValues) return;

      const draftData = {
        field_values: fieldValues,
        font_id: font?.id ?? null,
        text_color_override: Object.keys(textColorOverrides).length > 0 ? textColorOverrides : null,
      };

      if (isLoggedIn) {
        saveDraft(template.id, draftData).catch(() => {});
      } else {
        saveGuestDraft(template.id, draftData);
      }
    }, 1000);
    return () => clearTimeout(saveDraftTimer.current);
  }, [fieldValues, font, textColorOverrides, template, isLoggedIn]);

  const tags = useMemo(
    () => (template ? extractTags(template) : []),
    [template]
  );

  const tagConfigs = useMemo(
    () => (template ? getTagConfigs(template.text_blocks ?? [], tags) : {}),
    [template, tags]
  );

  // Auto-transliterate when font language is hindi/gujarati
  const doTransliterate = useCallback(
    (values: Record<string, string>, language: string) => {
      if (language === "english" || !language) {
        setTransliteratedValues({});
        return;
      }
      // Filter out empty values
      const nonEmpty: Record<string, string> = {};
      for (const [k, v] of Object.entries(values)) {
        if (v.trim()) nonEmpty[k] = v;
      }
      if (Object.keys(nonEmpty).length === 0) {
        setTransliteratedValues({});
        return;
      }
      transliterateBatch(nonEmpty, language)
        .then(setTransliteratedValues)
        .catch((err) => console.error("Transliteration failed:", err));
    },
    [setTransliteratedValues]
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

  // Step 1: Auth gate → show confirm/share popup
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

  // Step 2: Proceed to payment
  const handleProceedToPayment = async () => {
    if (!template) return;
    setShowConfirmPopup(false);
    setSubmitting(true);
    try {
      const colorOverride = Object.keys(textColorOverrides).length > 0
        ? textColorOverrides
        : undefined;
      const order = await createOrder(
        template.id,
        font?.id ?? null,
        effectiveValues,
        colorOverride
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

  const uploadableImageBlocks = useMemo(() => {
    if (!template) return [];
    return (template.image_blocks ?? []).filter((b) => b.is_user_uploadable);
  }, [template]);

  // Deduplicate: only show input for a tag in first block that uses it
  const seenTags = useMemo(() => new Set<string>(), [template]);

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
      {/* Form Panel — order-2 on mobile (preview first), order-1 on desktop (form left) */}
      <div className="w-full lg:w-[420px] lg:flex-shrink-0 lg:overflow-y-auto lg:max-h-[calc(100vh-5rem)] order-2 lg:order-1">
        <h1 className="text-lg font-bold text-slate-800 mb-3">{template.name}</h1>

        {/* All tag inputs — flat list, compact */}
        <div className="space-y-2.5 mb-4">
          {(() => {
            seenTags.clear();
            return blocksWithTags.map(({ block, tags: blockTags }) => {
              const newTags = blockTags.filter((t) => !seenTags.has(t));
              newTags.forEach((t) => seenTags.add(t));
              if (newTags.length === 0) return null;
              return newTags.map((tag) => {
                const cfg = tagConfigs[tag] ?? {};
                const label = cfg.label ?? humanizeTag(tag);
                const transVal = transliteratedValues[tag];
                return (
                  <div key={tag}>
                    <label className="block text-xs font-medium text-slate-600 mb-0.5">
                      {label}
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
                    {isRegionalFont && transVal && (
                      <p className="bg-primary-50 px-2 py-1 rounded text-primary-500 text-xs font-medium mt-0.5">
                        {transVal}
                      </p>
                    )}
                  </div>
                );
              });
            });
          })()}

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

        {/* Customize Colors & Font — hidden by default */}
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

              {/* Proceed to payment */}
              <button
                onClick={handleProceedToPayment}
                className="btn-primary w-full py-3 text-base"
              >
                Proceed to Payment — ₹{template ? (template.price / 100).toFixed(0) : "99"}
              </button>

              <p className="text-xs text-slate-400 text-center mt-3">
                You'll be redirected to a secure payment page
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Preview Panel — order-1 on mobile (shown first), order-2 on desktop (right side) */}
      <div className="flex-1 flex justify-center order-1 lg:order-2">
        <PreviewPlayer />
      </div>
    </div>
    </PageTransition>
  );
}
