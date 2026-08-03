import { create } from "zustand";
import { temporal } from "zundo";
import type { Template, TextBlock, ImageBlock } from "@/types";
import { saveAdminDraft } from "@/lib/adminDraft";

interface AdminTemplateState {
  template: Template | null;
  selectedBlockId: string | null;
  selectedBlockIds: string[];
  expandedBlockId: string | null;
  selectedImageBlockId: string | null;
  videoUrl: string | null;
  saving: boolean;
  previewBlockTrigger: number;
  previewEndFrame: number | null;
  currentTime: number;
  setTemplate: (t: Template) => void;
  setVideoUrl: (url: string) => void;
  selectBlock: (id: string | null) => void;
  selectBlockMulti: (id: string, shiftKey: boolean) => void;
  makePrimary: (id: string) => void;
  expandBlock: (id: string | null) => void;
  triggerBlockPreview: () => void;
  setPreviewEndFrame: (f: number | null) => void;
  setCurrentTime: (t: number) => void;
  toggleBlock: (id: string) => void;
  updateBlock: (blockId: string, updates: Partial<TextBlock>) => void;
  addBlock: (block: TextBlock) => void;
  removeBlock: (blockId: string) => void;
  selectImageBlock: (id: string | null) => void;
  toggleImageBlock: (id: string) => void;
  updateImageBlock: (blockId: string, updates: Partial<ImageBlock>) => void;
  addImageBlock: (block: ImageBlock) => void;
  removeImageBlock: (blockId: string) => void;
  reorderBlocks: (fromIndex: number, toIndex: number) => void;
  setSaving: (s: boolean) => void;
  reset: () => void;
}

// Debounced auto-save to localStorage
let draftTimer: ReturnType<typeof setTimeout> | null = null;
function debouncedSaveDraft() {
  if (draftTimer) clearTimeout(draftTimer);
  draftTimer = setTimeout(() => {
    const { template } = useAdminTemplateStore.getState();
    if (template?.id) saveAdminDraft(template.id, template);
  }, 500);
}

export const useAdminTemplateStore = create<AdminTemplateState>()(
  temporal(
    (set) => ({
      template: null,
      selectedBlockId: null,
      selectedBlockIds: [],
      expandedBlockId: null,
      selectedImageBlockId: null,
      videoUrl: null,
      saving: false,
      previewBlockTrigger: 0,
      previewEndFrame: null,
      currentTime: 0,

      setTemplate: (template) => set({ template }),

      setVideoUrl: (url) => set({ videoUrl: url }),

      selectBlock: (id) => set({ selectedBlockId: id, selectedBlockIds: id ? [id] : [] }),

      selectBlockMulti: (id, shiftKey) =>
        set((state) => {
          if (!shiftKey) {
            return { selectedBlockId: id, selectedBlockIds: [id] };
          }
          const ids = state.selectedBlockIds.includes(id)
            ? state.selectedBlockIds.filter((x) => x !== id)
            : [...state.selectedBlockIds, id];
          return {
            selectedBlockId: ids.length === 1 ? ids[0] : state.selectedBlockId,
            selectedBlockIds: ids,
          };
        }),

      makePrimary: (id) =>
        set((state) => {
          if (!state.selectedBlockIds.includes(id)) return state;
          return {
            selectedBlockId: id,
            selectedBlockIds: [id, ...state.selectedBlockIds.filter((x) => x !== id)],
          };
        }),

      expandBlock: (id) =>
        set((state) => ({
          expandedBlockId: state.expandedBlockId === id ? null : id,
        })),

      triggerBlockPreview: () =>
        set((s) => ({ previewBlockTrigger: s.previewBlockTrigger + 1 })),

      setPreviewEndFrame: (previewEndFrame) => set({ previewEndFrame }),

      setCurrentTime: (currentTime) => set({ currentTime }),

      toggleBlock: (id) =>
        set((state) => ({
          selectedBlockId: state.selectedBlockId === id ? null : id,
        })),

      updateBlock: (blockId, updates) =>
        set((state) => {
          if (!state.template) return state;
          const next = {
            template: {
              ...state.template,
              text_blocks: state.template.text_blocks.map((b) =>
                b.id === blockId ? { ...b, ...updates } : b,
              ),
            },
          };
          debouncedSaveDraft();
          return next;
        }),

      addBlock: (block) =>
        set((state) => {
          if (!state.template) return state;
          debouncedSaveDraft();
          return {
            template: {
              ...state.template,
              text_blocks: [...state.template.text_blocks, block],
            },
            selectedBlockId: block.id,
          };
        }),

      reorderBlocks: (fromIndex, toIndex) =>
        set((state) => {
          if (!state.template) return state;
          const blocks = [...state.template.text_blocks];
          const [moved] = blocks.splice(fromIndex, 1);
          blocks.splice(toIndex, 0, moved);
          const reordered = blocks.map((b, i) => ({ ...b, sort_order: i }));
          debouncedSaveDraft();
          return {
            template: { ...state.template, text_blocks: reordered },
          };
        }),

      removeBlock: (blockId) =>
        set((state) => {
          if (!state.template) return state;
          debouncedSaveDraft();
          return {
            template: {
              ...state.template,
              text_blocks: state.template.text_blocks.filter(
                (b) => b.id !== blockId,
              ),
            },
            selectedBlockId:
              state.selectedBlockId === blockId ? null : state.selectedBlockId,
          };
        }),

      selectImageBlock: (id) => set({ selectedImageBlockId: id }),

      toggleImageBlock: (id) =>
        set((state) => ({
          selectedImageBlockId: state.selectedImageBlockId === id ? null : id,
        })),

      updateImageBlock: (blockId, updates) =>
        set((state) => {
          if (!state.template) return state;
          debouncedSaveDraft();
          return {
            template: {
              ...state.template,
              image_blocks: state.template.image_blocks.map((b) =>
                b.id === blockId ? { ...b, ...updates } : b,
              ),
            },
          };
        }),

      addImageBlock: (block) =>
        set((state) => {
          if (!state.template) return state;
          debouncedSaveDraft();
          return {
            template: {
              ...state.template,
              image_blocks: [...state.template.image_blocks, block],
            },
            selectedImageBlockId: block.id,
          };
        }),

      removeImageBlock: (blockId) =>
        set((state) => {
          if (!state.template) return state;
          debouncedSaveDraft();
          return {
            template: {
              ...state.template,
              image_blocks: state.template.image_blocks.filter(
                (b) => b.id !== blockId,
              ),
            },
            selectedImageBlockId:
              state.selectedImageBlockId === blockId
                ? null
                : state.selectedImageBlockId,
          };
        }),

      setSaving: (saving) => set({ saving }),

      reset: () =>
        set({
          template: null,
          selectedBlockId: null,
          selectedBlockIds: [],
          expandedBlockId: null,
          selectedImageBlockId: null,
          videoUrl: null,
          saving: false,
          previewBlockTrigger: 0,
          previewEndFrame: null,
          currentTime: 0,
        }),
    }),
    {
      partialize: (state) => {
        const { template } = state;
        return { template } as AdminTemplateState;
      },
      limit: 50,
      equality: (pastState, currentState) =>
        pastState.template === currentState.template,
    },
  ),
);
