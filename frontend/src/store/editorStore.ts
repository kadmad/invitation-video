import { create } from "zustand";
import type { Template, Font, FormatRange } from "@/types";

/** Extract unique {tag} names from all text_blocks' content. */
export function extractTags(template: Template): string[] {
  const tagSet = new Set<string>();
  for (const block of template.text_blocks ?? []) {
    const re = /\{(\w+)\}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(block.content)) !== null) {
      tagSet.add(m[1]);
    }
  }
  return Array.from(tagSet);
}

interface PrefillData {
  fieldValues: Record<string, string>;
  fontId: string | null;
  textColorOverrides: Record<string, string> | null;
}

interface EditorState {
  template: Template | null;
  font: Font | null;
  fontUrl: string | null;
  fieldValues: Record<string, string>;
  transliteratedValues: Record<string, string>;
  textColorOverrides: Record<string, string>;
  prefill: PrefillData | null;
  imageUploads: Record<string, string>;
  seekToTime: { time: number; id: number } | null;
  editorMode: "express" | "advanced";
  blockOverrides: Record<string, string>;
  blockFormatOverrides: Record<string, FormatRange[]>;
  transliteratedBlockOverrides: Record<string, string>;
  setImageUpload: (blockId: string, url: string) => void;
  clearImageUpload: (blockId: string) => void;
  setTemplate: (template: Template) => void;
  setFont: (font: Font, url: string) => void;
  setFieldValue: (key: string, value: string) => void;
  setFieldValues: (values: Record<string, string>) => void;
  setTransliteratedValues: (values: Record<string, string>) => void;
  setTextColorOverride: (key: string, color: string) => void;
  clearTextColorOverride: (key: string) => void;
  clearFont: () => void;
  setPrefill: (data: PrefillData) => void;
  consumePrefill: () => PrefillData | null;
  seekTo: (time: number) => void;
  clearSeek: () => void;
  initAdvancedMode: (expandedBlocks: Record<string, string>) => void;
  exitAdvancedMode: () => void;
  setBlockOverride: (blockId: string, text: string) => void;
  setBlockOverrides: (overrides: Record<string, string>) => void;
  setBlockFormatOverrides: (overrides: Record<string, FormatRange[]>) => void;
  setBlockFormatOverride: (blockId: string, ranges: FormatRange[]) => void;
  setTransliteratedBlockOverrides: (overrides: Record<string, string>) => void;
  reset: () => void;
}

export const useEditorStore = create<EditorState>((set, get) => ({
  template: null,
  font: null,
  fontUrl: null,
  fieldValues: {},
  transliteratedValues: {},
  textColorOverrides: {},
  prefill: null,
  imageUploads: {},
  seekToTime: null,
  editorMode: "express",
  blockOverrides: {},
  blockFormatOverrides: {},
  transliteratedBlockOverrides: {},

  setTemplate: (template) => {
    const fieldValues: Record<string, string> = {};
    const tags = extractTags(template);
    tags.forEach((tag) => {
      fieldValues[tag] = "";
    });
    set({ template, fieldValues, transliteratedValues: {}, textColorOverrides: {} });
  },

  setFont: (font, url) => set({ font, fontUrl: url }),

  setFieldValue: (key, value) =>
    set((state) => ({
      fieldValues: { ...state.fieldValues, [key]: value },
    })),

  setFieldValues: (values) => set({ fieldValues: values }),

  setTransliteratedValues: (values) => set({ transliteratedValues: values }),

  setTextColorOverride: (key, color) =>
    set((state) => ({
      textColorOverrides: { ...state.textColorOverrides, [key]: color },
    })),

  clearTextColorOverride: (key) =>
    set((state) => {
      const next = { ...state.textColorOverrides };
      delete next[key];
      return { textColorOverrides: next };
    }),

  clearFont: () => set({ font: null, fontUrl: null, transliteratedValues: {} }),

  setPrefill: (data) => set({ prefill: data }),

  consumePrefill: () => {
    const { prefill } = get();
    if (prefill) {
      set({ prefill: null });
    }
    return prefill;
  },

  setImageUpload: (blockId, url) =>
    set((state) => ({
      imageUploads: { ...state.imageUploads, [blockId]: url },
    })),

  clearImageUpload: (blockId) =>
    set((state) => {
      const next = { ...state.imageUploads };
      delete next[blockId];
      return { imageUploads: next };
    }),

  seekTo: (time) => set({ seekToTime: { time, id: Date.now() } }),
  clearSeek: () => set({ seekToTime: null }),

  initAdvancedMode: (expandedBlocks) =>
    set({ editorMode: "advanced", blockOverrides: expandedBlocks }),

  exitAdvancedMode: () =>
    set({ editorMode: "express" }),

  setBlockOverride: (blockId, text) =>
    set((state) => ({
      blockOverrides: { ...state.blockOverrides, [blockId]: text },
    })),

  setBlockOverrides: (overrides) => set({ blockOverrides: overrides }),

  setBlockFormatOverrides: (overrides) => set({ blockFormatOverrides: overrides }),

  setBlockFormatOverride: (blockId, ranges) =>
    set((state) => ({
      blockFormatOverrides: { ...state.blockFormatOverrides, [blockId]: ranges },
    })),

  setTransliteratedBlockOverrides: (overrides) =>
    set({ transliteratedBlockOverrides: overrides }),

  reset: () =>
    set((state) => ({
      template: null,
      font: null,
      fontUrl: null,
      fieldValues: {},
      transliteratedValues: {},
      textColorOverrides: {},
      imageUploads: {},
      seekToTime: null,
      editorMode: "express",
      blockOverrides: {},
      blockFormatOverrides: {},
      transliteratedBlockOverrides: {},
      prefill: state.prefill, // preserve
    })),
}));
