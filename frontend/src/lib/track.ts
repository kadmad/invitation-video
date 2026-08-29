import { API_URL } from "@/api/client";

/**
 * First-party funnel tracking.
 *
 * Separate from `lib/analytics.ts`, which reports page views to Google
 * Analytics. Two reasons this exists alongside it: the gtag script is blocked
 * outright for a meaningful slice of visitors, and GA's numbers can't be
 * joined against our own templates and payments tables — which is the only way
 * to answer "which template earns the previews it gets".
 *
 * Nothing here identifies a person across sites. The anon id is a random
 * string in this browser's localStorage that never leaves our own origin; the
 * backend attaches the real user id instead whenever the request happens to
 * carry a valid token.
 */

const ANON_KEY = "bmm_anon_id";
const SESSION_KEY = "bmm_session_id";

/** Batched rather than one request per event, and flushed on a timer, so a
 *  burst of typing events doesn't turn into a burst of HTTP calls. */
const FLUSH_MS = 4000;
const MAX_QUEUE = 30;

export type TrackEvent =
  | "landing_view"
  | "browse_view"
  | "template_card_click"
  | "preview_play"
  | "preview_10s"
  | "preview_complete"
  | "editor_open"
  | "customization_started"
  | "customization_complete"
  | "image_uploaded"
  | "music_uploaded"
  | "advanced_mode_opened"
  | "share_link_copied"
  | "checkout_opened"
  | "auth_wall_hit"
  | "watermark_opted_in"
  | "checkout_abandoned"
  | "render_status_viewed"
  | "render_downloaded";

interface QueuedEvent {
  event: TrackEvent;
  template_id?: string;
  anon_id: string;
  session_id: string;
  value?: number;
  meta?: Record<string, string | number | boolean>;
}

function randomId(): string {
  // crypto.randomUUID is unavailable on http:// origins in some browsers,
  // which is exactly how this app is opened from a phone on the LAN.
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }
}

/** Storage can throw outright in private-mode/blocked-cookie browsers, so
 *  every access is guarded and falls back to a per-page-load id. */
function readOrCreate(store: "local" | "session", key: string): string {
  try {
    const s = store === "local" ? localStorage : sessionStorage;
    const existing = s.getItem(key);
    if (existing) return existing;
    const created = randomId();
    s.setItem(key, created);
    return created;
  } catch {
    return randomId();
  }
}

let memoAnon: string | null = null;
let memoSession: string | null = null;

function anonId(): string {
  if (!memoAnon) memoAnon = readOrCreate("local", ANON_KEY);
  return memoAnon;
}

function sessionId(): string {
  if (!memoSession) memoSession = readOrCreate("session", SESSION_KEY);
  return memoSession;
}

let queue: QueuedEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

function send(events: QueuedEvent[], viaBeacon: boolean) {
  if (events.length === 0) return;
  const url = `${API_URL}/events/`;
  const body = JSON.stringify({ events });

  // On pagehide the tab may be gone before fetch resolves. sendBeacon is the
  // only transport the browser promises to finish — and it's the one that
  // matters most, because abandonment is exactly what we're measuring.
  if (viaBeacon && navigator.sendBeacon) {
    // Beacon can't set an Authorization header, so these land anonymous; the
    // anon id still ties them to the same person's earlier events.
    navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
    return;
  }

  const token = (() => {
    try {
      return localStorage.getItem("token");
    } catch {
      return null;
    }
  })();

  void fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body,
    keepalive: true,
  }).catch(() => {
    // Tracking must never surface an error into a customer's flow, and a lost
    // event is not worth a retry queue.
  });
}

export function flushEvents(viaBeacon = false) {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
  const batch = queue;
  queue = [];
  send(batch, viaBeacon);
}

/**
 * Queue one funnel event. Safe to call from render paths — it never throws and
 * never blocks.
 */
export function track(
  event: TrackEvent,
  opts: { templateId?: string; value?: number; meta?: Record<string, string | number | boolean> } = {}
) {
  queue.push({
    event,
    template_id: opts.templateId,
    anon_id: anonId(),
    session_id: sessionId(),
    value: opts.value,
    meta: opts.meta,
  });

  if (queue.length >= MAX_QUEUE) {
    flushEvents();
    return;
  }
  if (timer === null) {
    timer = setTimeout(() => flushEvents(), FLUSH_MS);
  }
}

/**
 * Fire an event at most once per key for the lifetime of this tab. The 10-second
 * preview milestone is the reason this exists: replaying a preview five times is
 * one interested visitor, not five, and the dashboard counts people.
 */
const firedOnce = new Set<string>();

export function trackOnce(
  key: string,
  event: TrackEvent,
  opts: { templateId?: string; value?: number; meta?: Record<string, string | number | boolean> } = {}
) {
  if (firedOnce.has(key)) return;
  firedOnce.add(key);
  track(event, opts);
}

if (typeof window !== "undefined") {
  // pagehide rather than beforeunload: it fires on mobile Safari's bfcache
  // path, where beforeunload does not, and abandonment on a phone is the case
  // we most need to catch.
  window.addEventListener("pagehide", () => flushEvents(true));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushEvents(true);
  });
}
