import client from "./client";
import type { RenderJob } from "@/types";

export interface RenderPublic {
  id: string;
  template_name: string | null;
  video_url: string;
  thumbnail_url: string | null;
}

/** Unauthenticated summary of a completed render — backs the public
 * /watch/:id share page (Copy Link / WhatsApp). 404s until the render is
 * actually done. */
export async function getPublicRender(renderId: string) {
  const { data } = await client.get<RenderPublic>(`/renders/${renderId}/public`);
  return data;
}

export async function submitRender(
  templateId: string,
  fontId: string,
  fieldValues: Record<string, string>,
  textColorOverride?: Record<string, string>
) {
  const body: Record<string, unknown> = {
    template_id: templateId,
    field_values: fieldValues,
  };
  if (fontId) body.font_id = fontId;
  if (textColorOverride) body.text_color_override = textColorOverride;
  const { data } = await client.post<RenderJob>("/renders", body);
  return data;
}

export async function listRenders() {
  const { data } = await client.get<RenderJob[]>("/renders");
  return data;
}

export async function getRender(renderId: string) {
  const { data } = await client.get<RenderJob>(`/renders/${renderId}`);
  return data;
}

export interface RenderUpdatePayload {
  font_id?: string | null;
  field_values?: Record<string, string>;
  text_color_override?: Record<string, string> | null;
  block_overrides?: Record<string, string> | null;
  block_format_overrides?: Record<string, unknown> | null;
  location_url?: string | null;
}

/** Amend a manual-render order's details — only works while it's still
 * editable (render.can_edit), i.e. no admin has claimed it yet. */
export async function updateRender(renderId: string, payload: RenderUpdatePayload) {
  const { data } = await client.patch<RenderJob>(`/renders/${renderId}`, payload);
  return data;
}

export function getDownloadUrl(renderId: string) {
  return `${client.defaults.baseURL}/renders/${renderId}/download`;
}

export function getPdfDownloadUrl(renderId: string) {
  return `${client.defaults.baseURL}/renders/${renderId}/download-pdf`;
}
