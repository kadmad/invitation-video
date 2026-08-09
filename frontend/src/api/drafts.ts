import client from "./client";

interface DraftData {
  field_values: Record<string, string>;
  font_id: string | null;
  text_color_override: Record<string, string> | null;
  editor_mode?: string;
  block_overrides?: Record<string, string>;
  block_format_overrides?: Record<string, any[]>;
}

export interface DraftListItem {
  template_id: string;
  template_name: string;
  template_slug: string;
  field_values: Record<string, string>;
  font_id: string | null;
  text_color_override: Record<string, string> | null;
  updated_at: string;
}

export async function listDrafts(): Promise<DraftListItem[]> {
  const { data } = await client.get<DraftListItem[]>("/drafts/");
  return data;
}

export async function getDraft(templateId: string): Promise<DraftData | null> {
  try {
    const { data } = await client.get<DraftData | null>(`/drafts/${templateId}`);
    return data;
  } catch {
    return null;
  }
}

export async function saveDraft(templateId: string, draft: DraftData): Promise<void> {
  await client.put(`/drafts/${templateId}`, draft);
}

export async function deleteDraft(templateId: string): Promise<void> {
  await client.delete(`/drafts/${templateId}`);
}

// localStorage fallback for guest users
const DRAFT_KEY = "guest_drafts";

function getGuestDrafts(): Record<string, DraftData> {
  try {
    return JSON.parse(localStorage.getItem(DRAFT_KEY) || "{}");
  } catch {
    return {};
  }
}

export function getGuestDraft(templateId: string): DraftData | null {
  return getGuestDrafts()[templateId] || null;
}

export function saveGuestDraft(templateId: string, draft: DraftData): void {
  const all = getGuestDrafts();
  all[templateId] = draft;
  localStorage.setItem(DRAFT_KEY, JSON.stringify(all));
}

export function deleteGuestDraft(templateId: string): void {
  const all = getGuestDrafts();
  delete all[templateId];
  localStorage.setItem(DRAFT_KEY, JSON.stringify(all));
}
