import client, { API_URL, IS_PROXIED_API } from "@/api/client";
import type { Category, Template, Font, TextBlock, ImageBlock } from "@/types";
import type { AdminStats, AEImportPreviewResponse } from "@/types";

// ── Stats ──────────────────────────────────────────────────────────────────────
export const getAdminStats = () =>
  client.get<AdminStats>("/admin/stats").then((r) => r.data);

// ── Categories ─────────────────────────────────────────────────────────────────
export const listAdminCategories = () =>
  client.get<Category[]>("/admin/categories").then((r) => r.data);

export const createCategory = (data: Partial<Category>) =>
  client.post<Category>("/admin/categories", data).then((r) => r.data);

export const updateCategory = (id: string, data: Partial<Category>) =>
  client.put<Category>(`/admin/categories/${id}`, data).then((r) => r.data);

export const deleteCategory = (id: string) =>
  client.delete(`/admin/categories/${id}`).then((r) => r.data);

// ── Templates ──────────────────────────────────────────────────────────────────
export const listAdminTemplates = () =>
  client.get<Template[]>("/admin/templates").then((r) => r.data);

export const createTemplate = (data: Partial<Template>) =>
  client.post<Template>("/admin/templates", data).then((r) => r.data);

export const getAdminTemplate = (id: string) =>
  client.get<Template>(`/admin/templates/${id}`).then((r) => r.data);

export const updateTemplate = (id: string, data: Partial<Template>) =>
  client.put<Template>(`/admin/templates/${id}`, data).then((r) => r.data);

export const deleteTemplate = (id: string) =>
  client.delete(`/admin/templates/${id}`).then((r) => r.data);

// ── Template Video ─────────────────────────────────────────────────────────────
export const uploadTemplateVideo = (templateId: string, file: File) => {
  const form = new FormData();
  form.append("file", file);
  return client
    .post(`/admin/templates/${templateId}/upload-video`, form, {
      headers: { "Content-Type": "multipart/form-data" },
    })
    .then((r) => r.data);
};

export const getTemplateVideoUrl = async (templateId: string): Promise<string> => {
  const baseUrl = API_URL;
  const res = await fetch(`${baseUrl}/templates/${templateId}/video-token`);
  if (!res.ok) throw new Error("Failed to get video token");
  const { video_url, video_stream_url } = await res.json();
  return IS_PROXIED_API ? video_stream_url : video_url;
};

// ── Text Blocks ────────────────────────────────────────────────────────────────
export const createTextBlock = (
  templateId: string,
  data: Partial<TextBlock>,
) =>
  client
    .post<TextBlock>(`/admin/templates/${templateId}/text-blocks`, data)
    .then((r) => r.data);

export const updateTextBlock = (
  templateId: string,
  blockId: string,
  data: Partial<TextBlock>,
) =>
  client
    .put<TextBlock>(
      `/admin/templates/${templateId}/text-blocks/${blockId}`,
      data,
    )
    .then((r) => r.data);

export const previewAeImport = (templateId: string, manifest: unknown) =>
  client
    .post<AEImportPreviewResponse>(
      `/admin/templates/${templateId}/text-blocks/import-ae`,
      manifest,
    )
    .then((r) => r.data);

export const deleteTextBlock = (templateId: string, blockId: string) =>
  client
    .delete(`/admin/templates/${templateId}/text-blocks/${blockId}`)
    .then((r) => r.data);

export const reorderTextBlocks = (
  templateId: string,
  blocks: { id: string; sort_order: number }[],
) =>
  Promise.all(
    blocks.map((b) =>
      updateTextBlock(templateId, b.id, { sort_order: b.sort_order }),
    ),
  );

// ── Image Blocks ──────────────────────────────────────────────────────────────
export const createImageBlock = (
  templateId: string,
  data: Partial<ImageBlock>,
) =>
  client
    .post<ImageBlock>(`/admin/templates/${templateId}/image-blocks`, data)
    .then((r) => r.data);

export const updateImageBlock = (
  templateId: string,
  blockId: string,
  data: Partial<ImageBlock>,
) =>
  client
    .put<ImageBlock>(
      `/admin/templates/${templateId}/image-blocks/${blockId}`,
      data,
    )
    .then((r) => r.data);

export const deleteImageBlock = (templateId: string, blockId: string) =>
  client
    .delete(`/admin/templates/${templateId}/image-blocks/${blockId}`)
    .then((r) => r.data);

export const uploadPlaceholderImage = (
  templateId: string,
  blockId: string,
  file: File,
) => {
  const form = new FormData();
  form.append("file", file);
  return client
    .post(`/admin/templates/${templateId}/image-blocks/${blockId}/placeholder`, form, {
      headers: { "Content-Type": "multipart/form-data" },
    })
    .then((r) => r.data);
};

export const uploadFrameImage = (
  templateId: string,
  blockId: string,
  file: File,
) => {
  const form = new FormData();
  form.append("file", file);
  return client
    .post(`/admin/templates/${templateId}/image-blocks/${blockId}/frame`, form, {
      headers: { "Content-Type": "multipart/form-data" },
    })
    .then((r) => r.data);
};

// ── Fonts ──────────────────────────────────────────────────────────────────────
export const listAdminFonts = () =>
  client.get<Font[]>("/admin/fonts").then((r) => r.data);

export const uploadFont = (
  data: { name: string; family_name: string; language?: string; weight?: string; style?: string },
  file: File,
) => {
  const form = new FormData();
  form.append("file", file);
  Object.entries(data).forEach(([key, value]) => {
    if (value !== undefined) form.append(key, value);
  });
  return client
    .post<Font>("/admin/fonts", form, {
      headers: { "Content-Type": "multipart/form-data" },
    })
    .then((r) => r.data);
};

export const deleteFont = (id: string) =>
  client.delete(`/admin/fonts/${id}`).then((r) => r.data);
