import client, { API_URL } from "./client";
import type { Template } from "@/types";

export async function listTemplates(categoryId?: string, search?: string) {
  const params: Record<string, string> = {};
  if (categoryId) params.category_id = categoryId;
  if (search) params.search = search;
  const { data } = await client.get<Template[]>("/templates/", { params });
  return data;
}

/** The template's own soundtrack, streamed same-origin so the editor can both
 *  play it and fetch its bytes for waveform analysis. */
export function templateMusicUrl(templateId: string): string {
  return `${API_URL}/templates/${templateId}/music-file`;
}

export async function getTemplate(slug: string) {
  const { data } = await client.get<Template>(`/templates/${slug}`);
  return data;
}

/** The raw source video is never handed out as a direct storage link (see
 * backend get_video_token) — always streamed through the token-gated proxy,
 * built from API_URL so it resolves correctly regardless of deployment
 * topology (unlike the relative video_stream_url string the backend also
 * returns, which only works when the frontend and API share an origin). */
export async function fetchVideoUrl(templateId: string): Promise<string> {
  const baseUrl = API_URL;
  const res = await fetch(`${baseUrl}/templates/${templateId}/video-token`);
  if (!res.ok) throw new Error("Failed to get video token");
  const { token } = await res.json();
  return `${baseUrl}/templates/${templateId}/video-file?token=${token}`;
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
