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

/** Prefer direct storage/CDN playback so the API server never becomes the
 * media bottleneck. The stream URL remains a fallback for local proxy mode. */
export async function fetchVideoUrl(templateId: string): Promise<string> {
  const baseUrl = API_URL;
  const res = await fetch(`${baseUrl}/templates/${templateId}/video-token`);
  if (!res.ok) throw new Error("Failed to get video token");
  const { video_url, video_stream_url } = await res.json();
  if (video_url && (!API_URL.startsWith("/") || video_url.startsWith("https://"))) {
    return video_url;
  }
  if (!video_stream_url) throw new Error("Video URL is unavailable");
  const apiOrigin = new URL(API_URL, window.location.origin).origin;
  return new URL(video_stream_url, apiOrigin).toString();
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
