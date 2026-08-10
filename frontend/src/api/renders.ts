import client from "./client";
import type { RenderJob } from "@/types";

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

export function getDownloadUrl(renderId: string) {
  return `${client.defaults.baseURL}/renders/${renderId}/download`;
}

export function getPdfDownloadUrl(renderId: string) {
  return `${client.defaults.baseURL}/renders/${renderId}/download-pdf`;
}
