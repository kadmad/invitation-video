import type { Template } from "@/types";

const DRAFT_PREFIX = "admin-tpl-draft-";
const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface DraftEnvelope {
  template: Template;
  savedAt: number;
}

export function saveAdminDraft(templateId: string, template: Template): void {
  try {
    const envelope: DraftEnvelope = { template, savedAt: Date.now() };
    localStorage.setItem(DRAFT_PREFIX + templateId, JSON.stringify(envelope));
  } catch {
    // localStorage full or unavailable — silently ignore
  }
}

export function loadAdminDraft(templateId: string): Template | null {
  try {
    const raw = localStorage.getItem(DRAFT_PREFIX + templateId);
    if (!raw) return null;
    const envelope: DraftEnvelope = JSON.parse(raw);
    if (Date.now() - envelope.savedAt > DRAFT_TTL_MS) {
      localStorage.removeItem(DRAFT_PREFIX + templateId);
      return null;
    }
    return envelope.template;
  } catch {
    return null;
  }
}

export function clearAdminDraft(templateId: string): void {
  try {
    localStorage.removeItem(DRAFT_PREFIX + templateId);
  } catch {
    // ignore
  }
}

export function cleanExpiredDrafts(): void {
  try {
    const keys = Object.keys(localStorage).filter((k) => k.startsWith(DRAFT_PREFIX));
    for (const key of keys) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      try {
        const envelope: DraftEnvelope = JSON.parse(raw);
        if (Date.now() - envelope.savedAt > DRAFT_TTL_MS) {
          localStorage.removeItem(key);
        }
      } catch {
        localStorage.removeItem(key);
      }
    }
  } catch {
    // ignore
  }
}
