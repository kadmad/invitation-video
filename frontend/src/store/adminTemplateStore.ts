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
  removeBlocks: (blockIds: string[]) => void;
  replaceBlockId: (oldId: string, block: TextBlock) => void;
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

const HISTORY_LIMIT = 50;

/**
 * Gesture-scoped history coalescing.
 *
 * Drag/resize interactions (block position drag, block resize, timeline edge
 * drag, timeline whole-block drag) call `beginTemporalGesture()` at the start
 * and `endTemporalGesture()` at the end, pausing zundo's tracking in between
 * so the dozens of intermediate `updateBlock()` calls fired on every
 * mousemove don't each become their own undo step.
 *
 * zundo's `resume()` alone does NOT create a history checkpoint — it just
 * flips tracking back on. Without an explicit push here, the entire gesture
 * (and anything before it, back to the last real history entry) silently
 * merges into whatever unrelated edit happens to come next, so a single
 * Undo click can revert several unrelated prior actions at once. These
 * helpers close that gap by snapshotting state before the pause and pushing
 * exactly one history entry for the whole gesture after resuming.
 */
let gestureSnapshot: { template: Template | null } | null = null;

export function beginTemporalGesture() {
  gestureSnapshot = { template: useAdminTemplateStore.getState().template };
  useAdminTemplateStore.temporal.getState().pause();
}

export function endTemporalGesture() {
  const snapshot = gestureSnapshot;
  gestureSnapshot = null;
  useAdminTemplateStore.temporal.getState().resume();
  if (!snapshot) return;

  const currentTemplate = useAdminTemplateStore.getState().template;
  if (snapshot.template === currentTemplate) return; // nothing actually changed during the gesture

  const temporalApi = useAdminTemplateStore.temporal;
  const { pastStates } = temporalApi.getState();
  const nextPastStates = [...pastStates, snapshot];
  if (nextPastStates.length > HISTORY_LIMIT) nextPastStates.shift();
  temporalApi.setState({ pastStates: nextPastStates, futureStates: [] });
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
        set((state) => {
          const expanding = state.expandedBlockId !== id && id !== null;
          return {
            expandedBlockId: state.expandedBlockId === id ? null : id,
            ...(expanding ? { selectedBlockId: id, selectedBlockIds: [id] } : {}),
          };
        }),

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
            selectedBlockIds: state.selectedBlockIds.filter((id) => id !== blockId),
            expandedBlockId:
              state.expandedBlockId === blockId ? null : state.expandedBlockId,
          };
        }),

      removeBlocks: (blockIds) =>
        set((state) => {
          if (!state.template || blockIds.length === 0) return state;
          const ids = new Set(blockIds);
          debouncedSaveDraft();
          return {
            template: {
              ...state.template,
              text_blocks: state.template.text_blocks.filter((b) => !ids.has(b.id)),
            },
            selectedBlockId: state.selectedBlockId && ids.has(state.selectedBlockId)
              ? null
              : state.selectedBlockId,
            selectedBlockIds: state.selectedBlockIds.filter((id) => !ids.has(id)),
            expandedBlockId: state.expandedBlockId && ids.has(state.expandedBlockId)
              ? null
              : state.expandedBlockId,
          };
        }),

      replaceBlockId: (oldId, block) =>
        set((state) => {
          if (!state.template) return state;
          const replace = (id: string) => (id === oldId ? block.id : id);
          return {
            template: {
              ...state.template,
              text_blocks: state.template.text_blocks.map((b) =>
                b.id === oldId ? block : b,
              ),
            },
            selectedBlockId: state.selectedBlockId ? replace(state.selectedBlockId) : null,
            selectedBlockIds: state.selectedBlockIds.map(replace),
            expandedBlockId: state.expandedBlockId ? replace(state.expandedBlockId) : null,
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
      limit: HISTORY_LIMIT,
      equality: (pastState, currentState) =>
        pastState.template === currentState.template,
    },
  ),
);
