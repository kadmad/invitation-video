import { useState, useMemo } from "react";
import { useParams } from "react-router-dom";
import { useAdminTemplateStore } from "@/store/adminTemplateStore";
import {
  createImageBlock,
  updateImageBlock,
  deleteImageBlock,
  uploadPlaceholderImage,
  uploadFrameImage,
} from "@/api/admin";
import ConfirmModal from "@/components/admin/ConfirmModal";
import type { ImageBlock } from "@/types";

const MASK_SHAPES = [
  { value: "none", label: "None" },
  { value: "circle", label: "Circle" },
  { value: "oval", label: "Oval" },
  { value: "rounded_rect", label: "Rounded Rect" },
  { value: "heart", label: "Heart" },
  { value: "diamond", label: "Diamond" },
  { value: "hexagon", label: "Hexagon" },
  { value: "arch", label: "Arch" },
  { value: "star", label: "Star" },
];

const KB_DIRECTIONS = [
  { value: "zoom_in", label: "Zoom In" },
  { value: "zoom_out", label: "Zoom Out" },
  { value: "pan_left", label: "Pan Left" },
  { value: "pan_right", label: "Pan Right" },
];

const ANIMATION_TYPES = [
  { value: "none", label: "None" },
  { value: "fade_in", label: "Fade In" },
  { value: "scale_in", label: "Scale In" },
];

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

function BlockEditForm({
  block,
  templateId,
  saving,
  saveSuccess,
  onUpdateField,
  onSave,
}: {
  block: ImageBlock;
  templateId: string;
  saving: boolean;
  saveSuccess: boolean;
  onUpdateField: (field: keyof ImageBlock, value: unknown) => void;
  onSave: () => void;
}) {
  const [uploadingPlaceholder, setUploadingPlaceholder] = useState(false);
  const [uploadingFrame, setUploadingFrame] = useState(false);

  const handlePlaceholderUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPlaceholder(true);
    try {
      const result = await uploadPlaceholderImage(templateId, block.id, file);
      onUpdateField("placeholder_key", result.placeholder_key);
    } catch (err) {
      console.error("Failed to upload placeholder", err);
    } finally {
      setUploadingPlaceholder(false);
    }
  };

  const handleFrameUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingFrame(true);
    try {
      const result = await uploadFrameImage(templateId, block.id, file);
      onUpdateField("frame_image_key", result.frame_image_key);
    } catch (err) {
      console.error("Failed to upload frame", err);
    } finally {
      setUploadingFrame(false);
    }
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

      <CollapsibleSection title="General" defaultOpen={false}>
        <div>
          <label className="block text-xs text-ink-muted mb-1">Label</label>
          <input
            type="text"
            value={block.label}
            onChange={(e) => onUpdateField("label", e.target.value)}
            className="input-field text-sm w-full"
            placeholder="e.g. Bride Photo"
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={block.is_user_uploadable}
            onChange={(e) => onUpdateField("is_user_uploadable", e.target.checked)}
            className="rounded border-slate-300"
          />
          <label className="text-xs text-ink-muted">User can upload</label>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Images" defaultOpen={false}>
        <div>
          <label className="block text-xs text-ink-muted mb-1">Placeholder Image</label>
          <label className="btn-secondary text-xs cursor-pointer inline-block">
            {uploadingPlaceholder ? "Uploading..." : block.placeholder_key ? "Replace" : "Upload"}
            <input
              type="file"
              accept="image/*"
              onChange={handlePlaceholderUpload}
              className="hidden"
              disabled={uploadingPlaceholder}
            />
          </label>
          {block.placeholder_key && (
            <span className="text-[10px] text-ink-muted ml-2">Uploaded</span>
          )}
        </div>
        <div>
          <label className="block text-xs text-ink-muted mb-1">Frame Overlay (PNG)</label>
          <label className="btn-secondary text-xs cursor-pointer inline-block">
            {uploadingFrame ? "Uploading..." : block.frame_image_key ? "Replace" : "Upload"}
            <input
              type="file"
              accept="image/png"
              onChange={handleFrameUpload}
              className="hidden"
              disabled={uploadingFrame}
            />
          </label>
          {block.frame_image_key && (
            <span className="text-[10px] text-ink-muted ml-2">Uploaded</span>
          )}
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Mask Shape" defaultOpen={false}>
        <div className="grid grid-cols-3 gap-1.5">
          {MASK_SHAPES.map((shape) => (
            <button
              key={shape.value}
              type="button"
              onClick={() => onUpdateField("mask_shape", shape.value)}
              className={`px-2 py-1.5 rounded-lg text-xs font-medium transition-all ${
                block.mask_shape === shape.value
                  ? "bg-primary-500 text-white"
                  : "bg-surface-alt text-ink-muted hover:bg-slate-200"
              }`}
            >
              {shape.label}
            </button>
          ))}
        </div>
        <div>
          <label className="block text-xs text-ink-muted mb-1">
            Feather: {block.mask_feather.toFixed(0)}px
          </label>
          <input
            type="range"
            min="0"
            max="50"
            step="1"
            value={block.mask_feather}
            onChange={(e) => onUpdateField("mask_feather", parseFloat(e.target.value))}
            className="w-full accent-primary-500"
          />
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Ken Burns" defaultOpen={false}>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={block.ken_burns_enabled}
            onChange={(e) => onUpdateField("ken_burns_enabled", e.target.checked)}
            className="rounded border-slate-300"
          />
          <label className="text-xs text-ink-muted">Enable Ken Burns</label>
        </div>
        {block.ken_burns_enabled && (
          <>
            <div>
              <label className="block text-xs text-ink-muted mb-1">Direction</label>
              <select
                value={block.ken_burns_direction}
                onChange={(e) => onUpdateField("ken_burns_direction", e.target.value)}
                className="input-field text-sm w-full"
              >
                {KB_DIRECTIONS.map((d) => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-ink-muted mb-1">
                Zoom: {block.ken_burns_zoom.toFixed(2)}x
              </label>
              <input
                type="range"
                min="1.0"
                max="1.5"
                step="0.05"
                value={block.ken_burns_zoom}
                onChange={(e) => onUpdateField("ken_burns_zoom", parseFloat(e.target.value))}
                className="w-full accent-primary-500"
              />
            </div>
          </>
        )}
      </CollapsibleSection>

      <CollapsibleSection title="Display" defaultOpen={false}>
        <div>
          <label className="block text-xs text-ink-muted mb-1">
            Opacity: {block.opacity.toFixed(2)}
          </label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={block.opacity}
            onChange={(e) => onUpdateField("opacity", parseFloat(e.target.value))}
            className="w-full accent-primary-500"
          />
        </div>
        <div>
          <label className="block text-xs text-ink-muted mb-1">Animation</label>
          <select
            value={block.animation_type}
            onChange={(e) => onUpdateField("animation_type", e.target.value)}
            className="input-field text-sm w-full"
          >
            {ANIMATION_TYPES.map((a) => (
              <option key={a.value} value={a.value}>{a.label}</option>
            ))}
          </select>
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
              value={block.start_time}
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
              value={block.end_time}
              onChange={(e) => onUpdateField("end_time", parseFloat(e.target.value) || 0)}
              className="input-field text-sm w-full"
            />
          </div>
        </div>
      </CollapsibleSection>

      <button
        onClick={onSave}
        disabled={saving}
        className="btn-primary w-full text-sm disabled:opacity-50 mt-2 sticky bottom-0"
      >
        {saving ? "Saving..." : "Save Block"}
      </button>
    </div>
  );
}

export default function ImageBlockPanel() {
  const { id: templateId } = useParams<{ id: string }>();
  const {
    template,
    selectedImageBlockId,
    selectImageBlock,
    toggleImageBlock,
    updateImageBlock: updateStore,
    addImageBlock,
    removeImageBlock,
  } = useAdminTemplateStore();

  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const blocks = template?.image_blocks
    ? [...template.image_blocks].sort((a, b) => a.sort_order - b.sort_order)
    : [];

  // Group blocks into slides by 3-second time windows
  const SLIDE_WINDOW = 3;
  const slides = useMemo(() => {
    if (blocks.length === 0) return [];
    const bucketMap = new Map<number, ImageBlock[]>();
    const orderedBuckets: number[] = [];
    for (const block of blocks) {
      const bucket = Math.floor(block.start_time / SLIDE_WINDOW);
      if (!bucketMap.has(bucket)) {
        bucketMap.set(bucket, []);
        orderedBuckets.push(bucket);
      }
      bucketMap.get(bucket)!.push(block);
    }
    orderedBuckets.sort((a, b) => a - b);
    return orderedBuckets.map((b) => ({
      bucket: b,
      startSec: b * SLIDE_WINDOW,
      endSec: (b + 1) * SLIDE_WINDOW,
      blocks: bucketMap.get(b)!,
    }));
  }, [blocks]);

  const [currentSlide, setCurrentSlide] = useState(0);
  const safeSlide = Math.min(currentSlide, Math.max(0, slides.length - 1));
  const currentSlideData = slides[safeSlide];
  const slideBlocks = currentSlideData?.blocks ?? [];

  const handleAddBlock = async () => {
    if (!templateId) return;
    const startTime = currentSlideData ? currentSlideData.startSec : 0;
    const endTime = currentSlideData ? currentSlideData.endSec : SLIDE_WINDOW;
    setSaving(true);
    try {
      const block = await createImageBlock(templateId, {
        label: "New Photo",
        sort_order: blocks.length,
        position_x: 0.25,
        position_y: 0.25,
        width: 0.3,
        height: 0.3,
        start_time: startTime,
        end_time: endTime,
      });
      addImageBlock(block);
    } catch (err) {
      console.error("Failed to add image block", err);
    } finally {
      setSaving(false);
    }
  };

  const handleAddSlide = async () => {
    if (!templateId) return;
    const maxEnd = blocks.reduce((max, b) => Math.max(max, b.end_time), 0);
    const nextBucket = Math.ceil(maxEnd / SLIDE_WINDOW);
    const startTime = nextBucket * SLIDE_WINDOW;
    const endTime = startTime + SLIDE_WINDOW;
    setSaving(true);
    try {
      const block = await createImageBlock(templateId, {
        label: "New Photo",
        sort_order: blocks.length,
        position_x: 0.25,
        position_y: 0.25,
        width: 0.3,
        height: 0.3,
        start_time: startTime,
        end_time: endTime,
      });
      addImageBlock(block);
      setCurrentSlide(slides.length);
    } catch (err) {
      console.error("Failed to add slide", err);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteBlock = async () => {
    if (!templateId || !deleteTarget) return;
    try {
      await deleteImageBlock(templateId, deleteTarget);
      removeImageBlock(deleteTarget);
      setDeleteTarget(null);
    } catch (err) {
      console.error("Failed to delete image block", err);
    }
  };

  const handleSaveBlock = async (blockId: string) => {
    if (!templateId) return;
    const block = blocks.find((b) => b.id === blockId);
    if (!block) return;
    setSaving(true);
    try {
      await updateImageBlock(templateId, block.id, block);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err) {
      console.error("Failed to save image block", err);
    } finally {
      setSaving(false);
    }
  };

  const updateField = (blockId: string, field: keyof ImageBlock, value: unknown) => {
    updateStore(blockId, { [field]: value } as Partial<ImageBlock>);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Slide navigation */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold text-ink-muted uppercase tracking-wider">Image Blocks</h3>
          <span className="text-[10px] text-ink-muted">
            {blocks.length} block{blocks.length !== 1 ? "s" : ""}
          </span>
        </div>

        {slides.length > 0 && (
          <div className="flex items-center gap-2">
            <button
              disabled={safeSlide === 0}
              onClick={() => setCurrentSlide((s) => Math.max(0, s - 1))}
              className="p-1 rounded-lg hover:bg-surface-alt disabled:opacity-30 transition"
            >
              <svg className="w-4 h-4 text-ink-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
            </button>

            <div className="flex-1 flex items-center gap-1 justify-center">
              {slides.map((s, i) => (
                <button
                  key={s.bucket}
                  onClick={() => setCurrentSlide(i)}
                  className={`px-2 py-1 rounded-lg text-xs font-medium transition-all ${
                    i === safeSlide
                      ? "bg-amber-500 text-white shadow-sm"
                      : "bg-surface-alt text-ink-muted hover:bg-slate-200"
                  }`}
                >
                  {s.startSec}-{s.endSec}s
                </button>
              ))}
            </div>

            <button
              disabled={safeSlide >= slides.length - 1}
              onClick={() => setCurrentSlide((s) => Math.min(slides.length - 1, s + 1))}
              className="p-1 rounded-lg hover:bg-surface-alt disabled:opacity-30 transition"
            >
              <svg className="w-4 h-4 text-ink-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Blocks list */}
      <div className="flex-1 overflow-y-auto space-y-1">
        {slideBlocks.length === 0 && blocks.length === 0 ? (
          <div className="text-center py-6">
            <svg className="w-8 h-8 text-slate-300 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.41a2.25 2.25 0 013.182 0l2.909 2.91m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
            </svg>
            <p className="text-xs text-ink-muted">No image blocks yet</p>
          </div>
        ) : (
          slideBlocks.map((block) => {
            const isSelected = block.id === selectedImageBlockId;
            return (
              <div
                key={block.id}
                className={`rounded-xl transition-all duration-200 ${
                  isSelected
                    ? "bg-amber-50 ring-1 ring-amber-200"
                    : "bg-surface ring-1 ring-slate-100 hover:ring-edge"
                }`}
              >
                <div
                  className="flex items-center gap-2 px-3 py-2.5 cursor-pointer select-none min-h-[44px]"
                  onClick={() => toggleImageBlock(block.id)}
                >
                  <span className={`truncate flex-1 text-sm ${isSelected ? "text-amber-700 font-medium" : "text-ink"}`}>
                    {block.label || "Unnamed"}
                  </span>

                  <span className="text-[10px] text-ink-muted bg-surface-alt px-1.5 py-0.5 rounded">
                    {block.mask_shape}
                  </span>

                  <svg
                    className={`w-4 h-4 text-ink-muted transition-transform duration-200 ${isSelected ? "rotate-180" : ""}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteTarget(block.id);
                    }}
                    className="text-red-400 hover:text-red-600 p-1 min-w-[44px] min-h-[44px] flex items-center justify-center flex-shrink-0"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                    </svg>
                  </button>
                </div>

                <div className={`accordion-content ${isSelected ? "open" : ""}`}>
                  <div>
                    {isSelected && templateId && (
                      <BlockEditForm
                        block={block}
                        templateId={templateId}
                        saving={saving}
                        saveSuccess={saveSuccess}
                        onUpdateField={(field, value) => updateField(block.id, field, value)}
                        onSave={() => handleSaveBlock(block.id)}
                      />
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}

        <button
          onClick={handleAddBlock}
          disabled={saving}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border-2 border-dashed border-edge text-ink-muted hover:border-amber-300 hover:text-amber-600 hover:bg-amber-50/50 transition-all duration-200 text-xs font-medium disabled:opacity-50 min-h-[40px]"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Add Image Block
        </button>
      </div>

      <div className="pt-3 mt-2 border-t border-edge">
        <button
          onClick={handleAddSlide}
          disabled={saving}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-amber-50 text-amber-600 hover:bg-amber-100 transition-all duration-200 text-xs font-semibold disabled:opacity-50"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          New Slide
        </button>
      </div>

      <ConfirmModal
        open={!!deleteTarget}
        title="Delete Image Block"
        message="Are you sure you want to delete this image block? This action cannot be undone."
        onConfirm={handleDeleteBlock}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
