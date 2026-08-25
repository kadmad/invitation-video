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
    const {
      expires_at,
      has_preview,
      preview_status,
      video_url,
      preview_url,
      video_stream_url,
      preview_stream_url,
    } = await res.json();
    const url = IS_PROXIED_API
      ? (has_preview && preview_stream_url ? preview_stream_url : video_stream_url)
      : (has_preview && preview_url ? preview_url : video_url);
    const entry: CachedTemplateVideo = {
      url,
      expiresAt: expires_at,
      previewStatus: preview_status,
      hasPreview: Boolean(has_preview),
    };
    tokenCache.set(templateId, entry);
    inflight.delete(templateId);
    return entry;
  })();

  inflight.set(templateId, promise);
  return promise;
}
