import client from "./client";
import type { Font } from "@/types";

export async function listFonts(language?: string) {
  const params: Record<string, string> = {};
  if (language) params.language = language;
  const { data } = await client.get<Font[]>("/fonts", { params });
  return data;
}

export function getFontFileUrl(fontId: string) {
  const baseUrl = import.meta.env.VITE_API_URL || "http://localhost:8000/api";
  return `${baseUrl}/fonts/${fontId}/file`;
}
