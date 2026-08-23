import client, { API_URL, IS_PROXIED_API } from "./client";
import type { Template } from "@/types";

export async function listTemplates(categoryId?: string, search?: string) {
  const params: Record<string, string> = {};
  if (categoryId) params.category_id = categoryId;
  if (search) params.search = search;
  const { data } = await client.get<Template[]>("/templates/", { params });
  return data;
}

export async function getTemplate(slug: string) {
  const { data } = await client.get<Template>(`/templates/${slug}`);
  return data;
}

export async function fetchVideoUrl(templateId: string): Promise<string> {
  const baseUrl = API_URL;
  const res = await fetch(`${baseUrl}/templates/${templateId}/video-token`);
  if (!res.ok) throw new Error("Failed to get video token");
  const { video_url, video_stream_url } = await res.json();
  return IS_PROXIED_API ? video_stream_url : video_url;
}

/** @deprecated use fetchVideoUrl (async) */
export function getTemplateVideoUrl(templateId: string) {
  const baseUrl = API_URL;
  return `${baseUrl}/templates/${templateId}/video`;
}

export async function uploadUserImage(
  templateId: string,
  blockId: string,
  file: File,
): Promise<{ image_key: string; url: string }> {
  const form = new FormData();
  form.append("file", file);
  const { data } = await client.post(
    `/templates/${templateId}/image-blocks/${blockId}/upload`,
    form,
    { headers: { "Content-Type": "multipart/form-data" } },
  );
  return data;
}

export async function uploadUserMusic(
  templateId: string,
  file: File,
): Promise<{ music_key: string; duration_seconds: number }> {
  const form = new FormData();
  form.append("file", file);
  const { data } = await client.post(
    `/templates/${templateId}/upload-music`,
    form,
    { headers: { "Content-Type": "multipart/form-data" } },
  );
  return data;
}
