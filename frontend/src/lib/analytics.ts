import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/**
 * SPA page-view tracking for Google Analytics.
 *
 * gtag.js only auto-sends a page_view on the initial document load. Every
 * subsequent navigation here is client-side (React Router swaps components,
 * the document never reloads), so without this the whole site reported as a
 * single page view on "/" and per-page numbers were meaningless.
 *
 * The automatic hit is therefore switched OFF in index.html
 * (`send_page_view: false`) and this module becomes the single place a
 * page_view is sent — otherwise the first load would be counted twice.
 *
 * Title timing is the subtle part. Route components are lazy-loaded, so on a
 * navigation the route changes *before* the new page's chunk has downloaded
 * and run its `useSeo` effect. Sending immediately would attach the previous
 * page's `document.title` to the new path. So a view is queued on navigation
 * and flushed either when `useSeo` reports the title is set (the normal case)
 * or after a short fallback timeout (routes that never call `useSeo`).
 */

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

/** How long to wait for a route's `useSeo` before sending with whatever title
 *  is currently set. Long enough to cover a lazy chunk fetch on a slow
 *  connection, short enough that the hit still lands within the session. */
const TITLE_WAIT_MS = 3000;

let pendingPath: string | null = null;
let pendingTimer: ReturnType<typeof setTimeout> | null = null;

function clearPending() {
  if (pendingTimer !== null) {
    clearTimeout(pendingTimer);
    pendingTimer = null;
  }
  pendingPath = null;
}

function send(path: string) {
  window.gtag?.("event", "page_view", {
    page_path: path,
    page_location: window.location.href,
    page_title: document.title,
  });
}

/** Flush the queued view for `path`, if it is still the one we're waiting on. */
function flush(path: string) {
  if (pendingPath !== path) return;
  clearPending();
  send(path);
}

/**
 * Called by `useSeo` once it has written the document title for the current
 * route. Turns the queued page_view into a hit carrying the real title.
 *
 * Safe to call from routes that render while a different view is queued — the
 * path check in `flush` discards stale notifications.
 */
export function notifySeoReady() {
  if (!window.gtag || pendingPath === null) return;
  flush(window.location.pathname + window.location.search);
}

/**
 * Queues a page_view for the current location on every navigation, including
 * the first render. Mount once, inside the Router.
 */
export function usePageViews() {
  const location = useLocation();
  const path = location.pathname + location.search;

  useEffect(() => {
    // Not the production hostname — index.html never loaded gtag.js, so there
    // is nothing to report to and no timers worth starting.
    if (!window.gtag) return;

    clearPending();
    pendingPath = path;
    pendingTimer = setTimeout(() => flush(path), TITLE_WAIT_MS);

    // Navigating away before the title arrived: send what we have rather than
    // drop the view, so every navigation produces exactly one hit.
    return () => flush(path);
  }, [path]);
}
