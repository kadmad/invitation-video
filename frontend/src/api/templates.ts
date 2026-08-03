import client from "./client";
import type { Template } from "@/types";

export async function listTemplates(categoryId?: string, search?: string) {
  const params: Record<string, string> = {};
  if (categoryId) params.category_id = categoryId;
  if (search) params.search = search;
  const { data } = await client.get<Template[]>("/templates", { params });
  return data;
}

export async function getTemplate(slug: string) {
  const { data } = await client.get<Template>(`/templates/${slug}`);
  return data;
}

export async function fetchVideoUrl(templateId: string): Promise<string> {
  const baseUrl = import.meta.env.VITE_API_URL || "http://localhost:8000/api";
  const res = await fetch(`${baseUrl}/templates/${templateId}/video-token`);
  if (!res.ok) throw new Error("Failed to get video token");
  const { token } = await res.json();
  return `${baseUrl}/templates/${templateId}/video?token=${token}`;
}

/** @deprecated use fetchVideoUrl (async) */
export function getTemplateVideoUrl(templateId: string) {
  const baseUrl = import.meta.env.VITE_API_URL || "http://localhost:8000/api";
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
