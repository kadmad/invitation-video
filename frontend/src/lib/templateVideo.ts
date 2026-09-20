import { API_URL, IS_PROXIED_API } from "@/api/client";

const BASE_URL = API_URL;

export interface CachedTemplateVideo {
  url: string;
  expiresAt: number;
  previewStatus?: string | null;
  /** False when no admin-reviewed preview render exists yet, so `url` falls
   *  back to the raw uploaded source video. Callers that autoplay a muted
   *  background loop (landing hero, carousels) MUST check this before
   *  rendering a <video> — a raw source upload is an arbitrary-size render
   *  input, not something sized/compressed for public streaming, and has
   *  been seen at 18MB+ for a short clip. */
  hasPreview: boolean;
}

const tokenCache = new Map<string, CachedTemplateVideo>();
const inflight = new Map<string, Promise<CachedTemplateVideo>>();

function apiUrl(url: string | null | undefined): string {
  if (!url) return "";
  if (/^https?:\/\//.test(url)) return url;
  const apiOrigin = new URL(API_URL, window.location.origin).origin;
  return new URL(url, apiOrigin).toString();
}

function playbackUrl(directUrl: string | null | undefined, streamUrl: string | null | undefined): string {
  // Relative API mode is used by both production and local tunnel demos.
  // Production's HTTPS CDN is the fastest path; a local HTTP MinIO URL on an
  // HTTPS tunnel would be blocked as mixed content, so retain the proxy there.
  if (directUrl && (!IS_PROXIED_API || directUrl.startsWith("https://"))) return directUrl;
  return apiUrl(streamUrl) || directUrl || "";
}

/**
 * Signed playback URL for a template's video — the admin-reviewed preview
 * render (sample text baked in) when one exists, else the raw source video.
 * Same short-lived token cache shared by every caller, keyed by template id.
 */
export async function getTemplateVideoSrc(templateId: string, forceRefresh = false): Promise<CachedTemplateVideo> {
  const cached = tokenCache.get(templateId);
  const now = Math.floor(Date.now() / 1000);
  if (!forceRefresh && cached && cached.expiresAt > now + 30 && cached.previewStatus !== "processing") {
    return cached;
  }

  const pending = inflight.get(templateId);
  if (pending && !forceRefresh) return pending;

  const promise = (async () => {
    const res = await fetch(`${BASE_URL}/templates/${templateId}/video-token`);
    if (!res.ok) throw new Error("Failed to load template video");
    const {
      expires_at,
      has_preview,
      preview_status,
      video_url,
      preview_url,
      video_stream_url,
      preview_stream_url,
    } = await res.json();
    const url = has_preview
      ? playbackUrl(preview_url, preview_stream_url)
      : playbackUrl(video_url, video_stream_url);
    if (!url) throw new Error("Template video URL is unavailable");
    const entry: CachedTemplateVideo = {
      url,
      expiresAt: expires_at,
      previewStatus: preview_status,
      hasPreview: Boolean(has_preview),
    };
    tokenCache.set(templateId, entry);
    return entry;
  })();

  inflight.set(templateId, promise);
  try {
    return await promise;
  } finally {
    // A transient network failure must not poison this template forever.
    // Only remove the promise we installed; a forced refresh may have
    // replaced it while this request was still in flight.
    if (inflight.get(templateId) === promise) inflight.delete(templateId);
  }
}
