import { useEffect, useRef, useState } from "react";
import { useStore } from "zustand";
import { useParams, Link } from "react-router-dom";
import type { PlayerRef } from "@remotion/player";
import {
  getAdminTemplate,
  updateTemplate,
  updateTextBlock,
  deleteTextBlock,
  getTemplateVideoUrl,
  listAdminCategories,
  listAdminFonts,
} from "@/api/admin";
import { useAdminTemplateStore } from "@/store/adminTemplateStore";
import VideoPreviewCanvas from "@/components/admin/VideoPreviewCanvas";
import TimelineFooter from "@/components/admin/TimelineFooter";
import TextBlockPanel from "@/components/admin/TextBlockPanel";
import ImageBlockPanel from "@/components/admin/ImageBlockPanel";
import AEImportModal from "@/components/admin/AEImportModal";
import Toggle from "@/components/common/Toggle";
import FontPicker from "@/components/editor/FontPicker";
import type { Category, Font } from "@/types";
import {
  loadAdminDraft,
  clearAdminDraft,
  cleanExpiredDrafts,
} from "@/lib/adminDraft";

export default function AdminTemplateEditorPage() {
  const { id } = useParams<{ id: string }>();
  const {
    template,
    saving,
    setTemplate,
    setVideoUrl,
    setSaving,
    addBlock,
    reset,
  } = useAdminTemplateStore();

  const playerRef = useRef<PlayerRef | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [showAeImport, setShowAeImport] = useState(false);
  const [isPublished, setIsPublished] = useState(false);
  const [defaultTextColor, setDefaultTextColor] = useState("#FFFFFF");
  const [defaultFontId, setDefaultFontId] = useState<string | null>(null);
  const [fonts, setFonts] = useState<Font[]>([]);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [activePanel, setActivePanel] = useState<"text" | "image">("text");
  const [renderNotes, setRenderNotes] = useState("");
  const [seoDescription, setSeoDescription] = useState("");
  const [price, setPrice] = useState<number | null>(null);
  const [discountAmount, setDiscountAmount] = useState<number | null>(null);
  const [watermarkX, setWatermarkX] = useState(0.39);
  const [watermarkY, setWatermarkY] = useState(0.88);
  const [watermarkWidth, setWatermarkWidth] = useState(0.22);
  const [watermarkRotation, setWatermarkRotation] = useState(0);
  const [watermarkOpacity, setWatermarkOpacity] = useState(0.85);
  const [editingWatermark, setEditingWatermark] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [draftRecovered, setDraftRecovered] = useState(false);
  const [hasDraft, setHasDraft] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  const [renderPreview, setRenderPreview] = useState(false);
  const [pdfSnapshotTimestamps, setPdfSnapshotTimestamps] = useState<number[]>([]);
  const [newTimestamp, setNewTimestamp] = useState("");

  // Undo/redo reactive state
  const canUndo = useStore(useAdminTemplateStore.temporal, (s) => s.pastStates.length > 0);
  const canRedo = useStore(useAdminTemplateStore.temporal, (s) => s.futureStates.length > 0);

  useEffect(() => {
    cleanExpiredDrafts();
  }, []);

  // Seek to block midpoint when selection changes
  const prevSelectedRef = useRef<string | null>(null);
  useEffect(() => {
    const unsub = useAdminTemplateStore.subscribe((state) => {
      const blockId = state.selectedBlockId;
      if (blockId === prevSelectedRef.current) return;
      prevSelectedRef.current = blockId;
      if (!blockId || !playerRef.current) return;
      const block = state.template?.text_blocks?.find((b) => b.id === blockId);
      if (!block) return;
      const fps = state.template?.fps || 30;
      const midTime = (block.start_time + block.end_time) / 2;
      const midFrame = Math.round(midTime * fps);
      playerRef.current.seekTo(midFrame);
      state.setCurrentTime(midTime);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!id) return;

    const loadData = async () => {
      setLoading(true);
      try {
        const [tmpl, cats, fontList] = await Promise.all([
          getAdminTemplate(id),
          listAdminCategories(),
          listAdminFonts(),
        ]);
        setFonts(fontList);

        // Check for recovered draft
        const draft = loadAdminDraft(id);
        if (draft) {
          setTemplate(draft);
          setDraftRecovered(true);
          setHasDraft(true);
        } else {
          setTemplate(tmpl);
        }

        setName(tmpl.name);
        setCategoryId(tmpl.category_id);
        setIsPublished(tmpl.is_published ?? false);
        setDefaultTextColor(tmpl.default_text_color ?? "#FFFFFF");
        setDefaultFontId(tmpl.default_font_id ?? null);
        setRenderNotes(tmpl.render_notes ?? "");
        setSeoDescription(tmpl.seo_description ?? "");
        setPrice(tmpl.price ?? null);
        setDiscountAmount(tmpl.discount_amount_paise ?? null);
        setWatermarkX(tmpl.watermark_position_x ?? 0.39);
        setWatermarkY(tmpl.watermark_position_y ?? 0.88);
        setWatermarkWidth(tmpl.watermark_width ?? 0.22);
        setWatermarkRotation(tmpl.watermark_rotation ?? 0);
        setWatermarkOpacity(tmpl.watermark_opacity ?? 0.85);
        setPdfSnapshotTimestamps(tmpl.pdf_snapshot_timestamps ?? []);
        setCategories(cats);

        if (tmpl.video_key) {
          const url = await getTemplateVideoUrl(id);
          setVideoUrl(url);
        }
      } catch (err) {
        console.error("Failed to load template", err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
    return () => {
      reset();
      useAdminTemplateStore.temporal.getState().clear();
    };
  }, [id]);

  // Click outside block panel + canvas to deselect
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      // Keep selection when clicking inside panel or canvas (overlays handle own selection)
      if (panelRef.current?.contains(target)) return;
      if (canvasRef.current?.contains(target)) return;
      const state = useAdminTemplateStore.getState();
      if (state.selectedBlockId || state.selectedBlockIds.length > 0) state.selectBlock(null);
      if (state.selectedImageBlockId) state.selectImageBlock(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Keyboard shortcuts: spacebar play/pause + undo/redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const tag = target.tagName;
      const inInput = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;

      // Ctrl/Cmd+Z = undo, Ctrl/Cmd+Shift+Z = redo
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        if (inInput) return; // let browser handle undo in inputs
        e.preventDefault();
        if (e.shiftKey) {
          useAdminTemplateStore.temporal.getState().redo();
        } else {
          useAdminTemplateStore.temporal.getState().undo();
        }
        return;
      }

      // Ctrl/Cmd+Y = redo (Windows convention)
      if ((e.ctrlKey || e.metaKey) && e.key === "y") {
        if (inInput) return;
        e.preventDefault();
        useAdminTemplateStore.temporal.getState().redo();
        return;
      }

      // Delete/Backspace = delete selected blocks
      if (e.key === "Delete" || e.key === "Backspace") {
        if (inInput) return;
        const state = useAdminTemplateStore.getState();
        const ids = state.selectedBlockIds;
        if (ids.length === 0 || !id) return;
        e.preventDefault();
        ids.forEach(async (bid) => {
          try {
            await deleteTextBlock(id, bid);
            state.removeBlock(bid);
          } catch (err) { console.error("Failed to delete block", err); }
        });
        return;
      }

      // Spacebar play/pause
      if (e.code !== "Space") return;
      if (inInput) return;
      e.preventDefault();
      const player = playerRef.current;
      if (!player) return;
      if (player.isPlaying()) {
        player.pause();
      } else {
        useAdminTemplateStore.getState().setPreviewEndFrame(null);
        player.play();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleSave = async () => {
    if (!id || !template) return;
    if (isPublished && (!price || !discountAmount || discountAmount >= price)) {
      setPublishError("Price and a watermark discount smaller than price are required before publishing.");
      return;
    }
    setPublishError(null);
    setSaving(true);
    try {
      // Save all text blocks FIRST (so preview render picks up latest data)
      const blocks = template.text_blocks ?? [];
      if (blocks.length > 0) {
        await Promise.all(
          blocks.map((block) => updateTextBlock(id, block.id, block))
        );
      }

      // Save template metadata (triggers preview re-render only when checkbox ticked)
      const updated = await updateTemplate(id, {
        name,
        category_id: categoryId,
        is_published: isPublished,
        default_text_color: defaultTextColor,
        default_font_id: defaultFontId,
        render_notes: renderNotes || null,
        seo_description: seoDescription || null,
        price,
        discount_amount_paise: discountAmount,
        watermark_position_x: watermarkX,
        watermark_position_y: watermarkY,
        watermark_width: watermarkWidth,
        watermark_rotation: watermarkRotation,
        watermark_opacity: watermarkOpacity,
        pdf_snapshot_timestamps: pdfSnapshotTimestamps.length > 0 ? pdfSnapshotTimestamps : null,
        render_preview: renderPreview,
      } as any);

      // Merge: use server metadata but keep local text_blocks (already saved above)
      setTemplate({ ...updated, text_blocks: blocks, image_blocks: template.image_blocks ?? [] });
      clearAdminDraft(id);
      setHasDraft(false);
      setDraftRecovered(false);
      setRenderPreview(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err: any) {
      console.error("Failed to save template", err);
      setPublishError(err?.response?.data?.detail ?? "Failed to save template");
    } finally {
      setSaving(false);
    }
  };

  const handleDiscardDraft = async () => {
    if (!id) return;
    clearAdminDraft(id);
    setDraftRecovered(false);
    setHasDraft(false);
    // Reload from DB
    try {
      const tmpl = await getAdminTemplate(id);
      setTemplate(tmpl);
      useAdminTemplateStore.temporal.getState().clear();
    } catch (err) {
      console.error("Failed to reload template", err);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="card px-5 py-3.5 h-[4.5rem] border border-edge" />
        <div className="flex gap-4">
          <div className="flex-1 card h-96 border border-edge" />
          <div className="w-80 card h-96 border border-edge" />
        </div>
      </div>
    );
  }

  if (!template) {
    return <p className="text-red-500">Template not found.</p>;
  }

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 2.5rem)" }}>
      {/* Save success toast */}
      {saveSuccess && (
        <div className="fixed top-4 right-4 z-50 bg-accent-500 text-white px-5 py-2.5 rounded-xl shadow-lg text-sm font-medium animate-slide-up flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
          Template saved
        </div>
      )}

      {/* Draft recovery banner */}
      {draftRecovered && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-amber-50 border border-amber-200 text-amber-800 px-5 py-2.5 rounded-xl shadow-lg text-sm font-medium flex items-center gap-3 animate-slide-up">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
          Unsaved changes recovered
          <button
            onClick={handleDiscardDraft}
            className="ml-1 text-xs font-semibold text-amber-600 hover:text-amber-800 underline"
          >
            Discard
          </button>
          <button
            onClick={() => setDraftRecovered(false)}
            className="text-amber-400 hover:text-amber-600 ml-1"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Top bar. Wraps instead of squeezing — with ~13 controls this was
          compressing inputs (and Save) to unusable widths on smaller screens.
          Fields wrap onto additional lines; the action group is pinned right
          via ml-auto and never shrinks, so Save is always reachable. */}
      <div className="card flex-shrink-0 border border-edge overflow-visible relative z-20 px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-2">
        {/* Back */}
        <Link
          to="/admin/templates"
          className="text-ink-muted hover:text-ink-muted transition p-1 -ml-1"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
        </Link>

        <div className="w-px h-6 bg-slate-200" />

        {/* Name */}
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="input-field text-sm font-medium w-40 flex-shrink-0"
          title="Template name"
        />

        {/* Category */}
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="input-field text-xs w-28"
        >
          <option value="">Category</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        <div className="w-px h-6 bg-slate-200" />

        {/* Default color */}
        <input
          type="color"
          value={defaultTextColor}
          onChange={(e) => {
            setDefaultTextColor(e.target.value);
            if (template) setTemplate({ ...template, default_text_color: e.target.value });
          }}
          className="w-6 h-6 rounded border border-edge cursor-pointer p-0.5"
          title="Default text color"
        />

        {/* Default font */}
        <div className="w-44">
          <FontPicker
            fonts={fonts}
            selectedId={defaultFontId}
            onSelect={(id) => {
              setDefaultFontId(id);
              if (template) setTemplate({ ...template, default_font_id: id });
            }}
            compact
          />
        </div>

        {/* Price */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <span className="text-[10px] text-ink-muted">₹</span>
          <input
            type="number"
            value={price === null ? "" : price / 100}
            onChange={(e) => {
              const v = e.target.value;
              setPrice(v === "" ? null : Math.max(0, Math.round(parseFloat(v) * 100)) || 0);
            }}
            placeholder="Price"
            title="Price (required before publishing)"
            className={`input-field text-xs w-16 text-center ${price === null ? "border-red-300" : ""}`}
            min="0"
            step="1"
          />
        </div>

        {/* Watermark discount */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <span className="text-[10px] text-ink-muted">−₹</span>
          <input
            type="number"
            value={discountAmount === null ? "" : discountAmount / 100}
            onChange={(e) => {
              const v = e.target.value;
              setDiscountAmount(v === "" ? null : Math.max(0, Math.round(parseFloat(v) * 100)) || 0);
            }}
            placeholder="Discount"
            title="Watermarked-render discount (required before publishing)"
            className={`input-field text-xs w-16 text-center ${discountAmount === null ? "border-red-300" : ""}`}
            min="0"
            step="1"
          />
        </div>

        {/* Watermark placement */}
        <button
          onClick={() => setEditingWatermark((v) => !v)}
          className={`text-[10px] font-medium px-2 py-1.5 rounded-lg transition flex-shrink-0 ${
            editingWatermark ? "bg-amber-100 text-amber-700" : "text-ink-muted hover:text-ink-muted hover:bg-surface-alt"
          }`}
          title="Only ONE small watermark, placed in a corner — drag/resize/rotate to place it. Keep it small: it's a discreet brand mark on the discounted render, not a full-frame overlay."
        >
          Watermark
        </button>
        {editingWatermark && (
          <>
            <label className="flex items-center gap-1.5 flex-shrink-0" title="Watermark opacity on the rendered video">
              <span className="text-[10px] text-ink-muted">Opacity</span>
              <input
                type="range"
                min={0.1}
                max={1}
                step={0.05}
                value={watermarkOpacity}
                onChange={(e) => setWatermarkOpacity(parseFloat(e.target.value))}
                className="w-20 accent-amber-500 cursor-pointer"
              />
              <span className="text-[10px] text-ink-muted tabular-nums w-7">
                {Math.round(watermarkOpacity * 100)}%
              </span>
            </label>
            <span className="text-[10px] text-amber-600 flex-shrink-0">
              One small watermark only — place it in a corner
            </span>
          </>
        )}

        {/* Render notes */}
        <input
          type="text"
          value={renderNotes}
          onChange={(e) => setRenderNotes(e.target.value)}
          placeholder="Render notes..."
          className="input-field text-xs flex-1 min-w-[10rem]"
        />

        {/* SEO meta description for this template's public /editor/{slug}
            page. Left blank, the page falls back to a generated sentence —
            hand-written copy mentioning occasion/style/language ranks better. */}
        <input
          type="text"
          value={seoDescription}
          onChange={(e) => setSeoDescription(e.target.value)}
          placeholder="SEO description..."
          title="Meta description for this template's public page (~150-160 chars). Blank = auto-generated."
          maxLength={300}
          className="input-field text-xs flex-1 min-w-[12rem]"
        />

        {/* Actions — pinned right, never shrink. */}
        <div className="flex items-center gap-3 ml-auto flex-shrink-0">
        <div className="w-px h-6 bg-edge" />

        {/* Undo/Redo */}
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => useAdminTemplateStore.temporal.getState().undo()}
            disabled={!canUndo}
            className="p-1 rounded text-ink-muted hover:text-ink-muted hover:bg-surface-alt disabled:opacity-30 transition"
            title="Undo (Ctrl+Z)"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
            </svg>
          </button>
          <button
            onClick={() => useAdminTemplateStore.temporal.getState().redo()}
            disabled={!canRedo}
            className="p-1 rounded text-ink-muted hover:text-ink-muted hover:bg-surface-alt disabled:opacity-30 transition"
            title="Redo (Ctrl+Shift+Z)"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 15l6-6m0 0l-6-6m6 6H9a6 6 0 000 12h3" />
            </svg>
          </button>
        </div>

        {/* Published toggle */}
        <Toggle checked={isPublished} onChange={(v) => { setIsPublished(v); setPublishError(null); }} />

        {/* Render checkbox + Save */}
        <label className="flex items-center gap-1 cursor-pointer select-none" title="Queue preview render on save">
          <input
            type="checkbox"
            checked={renderPreview}
            onChange={(e) => setRenderPreview(e.target.checked)}
            className="w-3.5 h-3.5 rounded border-slate-300 text-primary-500 focus:ring-primary-500"
          />
          <span className="text-[10px] text-ink-muted">Render</span>
        </label>
        <button
          onClick={() => setShowAeImport(true)}
          className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium text-primary-600 bg-primary-50 hover:bg-primary-100 transition"
          title="Import from After Effects (font, color, position, timing)"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
          Import AE
        </button>

        <div className="relative">
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary text-xs px-3 py-1.5 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
          {canUndo && (
            <span className="absolute -top-1 -right-1 w-2 h-2 bg-amber-400 rounded-full border-2 border-white" />
          )}
        </div>
        </div>
      </div>

      {publishError && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-red-50 border border-red-200 text-red-700 px-5 py-2.5 rounded-xl shadow-lg text-sm font-medium flex items-center gap-3 animate-slide-up">
          {publishError}
          <button onClick={() => setPublishError(null)} className="text-red-400 hover:text-red-600 ml-1">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {showAeImport && id && (
        <AEImportModal
          templateId={id}
          sortOrderStart={template?.text_blocks?.length ?? 0}
          fallbackFontId={template?.default_font_id ?? null}
          onClose={() => setShowAeImport(false)}
          onImported={(blocks) => blocks.forEach((b) => addBlock(b))}
        />
      )}

      {/* PDF Snapshot Timestamps */}
      <div className="card flex-shrink-0 border border-edge px-3 py-1.5 mt-1 flex items-center gap-2 flex-wrap">
        <span className="text-[10px] font-medium text-ink-muted uppercase tracking-wider flex-shrink-0">PDF Snapshots</span>
        <div className="w-px h-5 bg-slate-200" />
        {pdfSnapshotTimestamps.map((ts, idx) => (
          <span key={idx} className="inline-flex items-center gap-1 bg-primary-50 text-primary-700 text-xs font-medium px-2 py-0.5 rounded-full">
            {ts}s
            <button
              onClick={() => setPdfSnapshotTimestamps((prev) => prev.filter((_, i) => i !== idx))}
              className="text-primary-400 hover:text-red-500 transition"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </span>
        ))}
        <button
          onClick={() => {
            const player = playerRef.current;
            if (!player || !template) return;
            const frame = player.getCurrentFrame();
            const sec = Math.round((frame / template.fps) * 10) / 10;
            if (!pdfSnapshotTimestamps.includes(sec)) {
              setPdfSnapshotTimestamps((prev) => [...prev, sec].sort((a, b) => a - b));
            }
          }}
          className="btn-secondary text-xs px-2 py-1 flex items-center gap-1"
          title="Add current video time as PDF page"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Capture
        </button>
        <div className="flex items-center gap-1">
          <input
            type="number"
            value={newTimestamp}
            onChange={(e) => setNewTimestamp(e.target.value)}
            placeholder="0.0"
            step="0.1"
            min="0"
            className="input-field text-xs w-16 text-center"
          />
          <button
            onClick={() => {
              const val = parseFloat(newTimestamp);
              if (!isNaN(val) && val >= 0) {
                setPdfSnapshotTimestamps((prev) => [...prev, val].sort((a, b) => a - b));
                setNewTimestamp("");
              }
            }}
            className="btn-secondary text-xs px-2 py-1"
          >
            Add
          </button>
        </div>
        {pdfSnapshotTimestamps.length === 0 && (
          <span className="text-[10px] text-ink-muted">No timestamps — PDF generation disabled</span>
        )}
      </div>

      {/* Editor area */}
      <div className="flex flex-1 min-h-0 overflow-hidden mt-1 relative">
        {/* Left: Video preview */}
        <div ref={canvasRef} className="flex-1 flex flex-col min-h-0">
          <VideoPreviewCanvas
            playerRef={playerRef}
            watermarkEditing={editingWatermark}
            watermarkX={watermarkX}
            watermarkY={watermarkY}
            watermarkWidth={watermarkWidth}
            watermarkRotation={watermarkRotation}
            watermarkOpacity={watermarkOpacity}
            onWatermarkChange={(x, y, w, r) => {
              setWatermarkX(x);
              setWatermarkY(y);
              setWatermarkWidth(w);
              setWatermarkRotation(r);
            }}
          />
        </div>

        {/* Panel toggle button */}
        <button
          onClick={() => setPanelOpen(!panelOpen)}
          className="absolute right-0 top-2 z-30 bg-surface border border-edge rounded-l-lg px-1.5 py-3 text-ink-muted hover:text-ink-muted hover:bg-surface-alt transition shadow-sm"
          style={{ right: panelOpen ? "420px" : 0 }}
          title={panelOpen ? "Hide panel" : "Show panel"}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            {panelOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            )}
          </svg>
        </button>

        {/* Right: Block panel with tabs */}
        <div
          ref={panelRef}
          className={`w-[420px] card flex flex-col flex-shrink-0 min-h-0 border border-edge transition-all duration-300 ${
            panelOpen ? "ml-4" : "ml-0 translate-x-full absolute right-0 top-0 bottom-0 opacity-0 pointer-events-none"
          }`}
        >
          <div className="flex border-b border-edge px-4 pt-3">
            <button
              onClick={() => setActivePanel("text")}
              className={`px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
                activePanel === "text"
                  ? "border-primary-500 text-primary-600"
                  : "border-transparent text-ink-muted hover:text-ink-muted"
              }`}
            >
              Text Blocks
            </button>
            <button
              onClick={() => setActivePanel("image")}
              className={`px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
                activePanel === "image"
                  ? "border-amber-500 text-amber-600"
                  : "border-transparent text-ink-muted hover:text-ink-muted"
              }`}
            >
              Image Blocks
            </button>
          </div>
          <div className="p-4 overflow-y-auto flex-1 min-h-0">
            {activePanel === "text" ? <TextBlockPanel /> : <ImageBlockPanel />}
          </div>
        </div>
      </div>

      {/* Full-width timeline footer */}
      <div className="mt-1">
        <TimelineFooter
          playerRef={playerRef}
          pdfSnapshotTimestamps={pdfSnapshotTimestamps}
          onPdfSnapshotTimestampsChange={setPdfSnapshotTimestamps}
        />
      </div>
    </div>
  );
}
