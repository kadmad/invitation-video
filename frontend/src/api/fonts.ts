import client, { API_URL } from "./client";
import type { Font } from "@/types";

export async function listFonts(language?: string) {
  const params: Record<string, string> = {};
  if (language) params.language = language;
  const { data } = await client.get<Font[]>("/fonts/", { params });
  return data;
}

export function getFontFileUrl(fontId: string) {
  const baseUrl = API_URL;
  return `${baseUrl}/fonts/${fontId}/file`;
}
