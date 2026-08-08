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
    reset,
  } = useAdminTemplateStore();

  const playerRef = useRef<PlayerRef | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [isPublished, setIsPublished] = useState(false);
  const [defaultTextColor, setDefaultTextColor] = useState("#FFFFFF");
  const [defaultFontId, setDefaultFontId] = useState<string | null>(null);
  const [fonts, setFonts] = useState<Font[]>([]);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [activePanel, setActivePanel] = useState<"text" | "image">("text");
  const [renderNotes, setRenderNotes] = useState("");
  const [price, setPrice] = useState(9900);
  const [draftRecovered, setDraftRecovered] = useState(false);
  const [hasDraft, setHasDraft] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  const [renderPreview, setRenderPreview] = useState(false);

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
        setPrice(tmpl.price ?? 9900);
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
        price,
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
    } catch (err) {
      console.error("Failed to save template", err);
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
        <div className="card px-5 py-3.5 h-[4.5rem] border border-slate-200" />
        <div className="flex gap-4">
          <div className="flex-1 card h-96 border border-slate-200" />
          <div className="w-80 card h-96 border border-slate-200" />
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

      {/* Top bar — single compact row */}
      <div className="card flex-shrink-0 border border-slate-200 overflow-visible relative z-20 px-3 py-1.5 flex items-center gap-3">
        {/* Back */}
        <Link
          to="/admin/templates"
          className="text-slate-400 hover:text-slate-600 transition p-1 -ml-1"
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
          className="input-field text-sm font-medium w-40"
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
          className="w-6 h-6 rounded border border-slate-200 cursor-pointer p-0.5"
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
          <span className="text-[10px] text-slate-400">₹</span>
          <input
            type="number"
            value={price / 100}
            onChange={(e) => setPrice(Math.max(0, Math.round(parseFloat(e.target.value) * 100)) || 0)}
            className="input-field text-xs w-16 text-center"
            min="0"
            step="1"
          />
        </div>

        {/* Render notes */}
        <input
          type="text"
          value={renderNotes}
          onChange={(e) => setRenderNotes(e.target.value)}
          placeholder="Render notes..."
          className="input-field text-xs flex-1 min-w-0"
        />

        <div className="w-px h-6 bg-slate-200" />

        {/* Undo/Redo */}
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => useAdminTemplateStore.temporal.getState().undo()}
            disabled={!canUndo}
            className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 disabled:opacity-30 transition"
            title="Undo (Ctrl+Z)"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
            </svg>
          </button>
          <button
            onClick={() => useAdminTemplateStore.temporal.getState().redo()}
            disabled={!canRedo}
            className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 disabled:opacity-30 transition"
            title="Redo (Ctrl+Shift+Z)"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 15l6-6m0 0l-6-6m6 6H9a6 6 0 000 12h3" />
            </svg>
          </button>
        </div>

        {/* Published toggle */}
        <Toggle checked={isPublished} onChange={setIsPublished} />

        {/* Render checkbox + Save */}
        <label className="flex items-center gap-1 cursor-pointer select-none" title="Queue preview render on save">
          <input
            type="checkbox"
            checked={renderPreview}
            onChange={(e) => setRenderPreview(e.target.checked)}
            className="w-3.5 h-3.5 rounded border-slate-300 text-primary-500 focus:ring-primary-500"
          />
          <span className="text-[10px] text-slate-500">Render</span>
        </label>
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

      {/* Editor area */}
      <div className="flex flex-1 min-h-0 overflow-hidden mt-1 relative">
        {/* Left: Video preview */}
        <div ref={canvasRef} className="flex-1 flex flex-col min-h-0">
          <VideoPreviewCanvas playerRef={playerRef} />
        </div>

        {/* Panel toggle button */}
        <button
          onClick={() => setPanelOpen(!panelOpen)}
          className="absolute right-0 top-2 z-30 bg-white border border-slate-200 rounded-l-lg px-1.5 py-3 text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition shadow-sm"
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
          className={`w-[420px] card flex flex-col flex-shrink-0 min-h-0 border border-slate-200 transition-all duration-300 ${
            panelOpen ? "ml-4" : "ml-0 translate-x-full absolute right-0 top-0 bottom-0 opacity-0 pointer-events-none"
          }`}
        >
          <div className="flex border-b border-slate-200 px-4 pt-3">
            <button
              onClick={() => setActivePanel("text")}
              className={`px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
                activePanel === "text"
                  ? "border-primary-500 text-primary-600"
                  : "border-transparent text-slate-400 hover:text-slate-600"
              }`}
            >
              Text Blocks
            </button>
            <button
              onClick={() => setActivePanel("image")}
              className={`px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
                activePanel === "image"
                  ? "border-amber-500 text-amber-600"
                  : "border-transparent text-slate-400 hover:text-slate-600"
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
        <TimelineFooter playerRef={playerRef} />
      </div>
    </div>
  );
}
