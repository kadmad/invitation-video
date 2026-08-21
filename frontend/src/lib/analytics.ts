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
 * The tag loads on every hostname, so local dev and the :5174 prod-worker
 * stack report into the live property too.
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
/** Last path queued, so re-renders of the same route don't queue it twice. */
let claimedPath: string | null = null;

function clearTimer() {
  if (pendingTimer !== null) {
    clearTimeout(pendingTimer);
    pendingTimer = null;
  }
}

function clearPending() {
  clearTimer();
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

  // Queue during render, not in the effect. Effects run child-before-parent,
  // so the route's `useSeo` (a child) calls `notifySeoReady` BEFORE this
  // component's own effect would have queued anything — the flush would find
  // nothing pending and every hit would be left to the fallback timer three
  // seconds later. Rendering happens parent-first, so claiming the slot here
  // is what lets `notifySeoReady` send immediately.
  if (window.gtag && claimedPath !== path) {
    claimedPath = path;
    pendingPath = path;
  }

  useEffect(() => {
    // No gtag stub on the page: an ad blocker or privacy extension stripped
    // the inline tag. Nothing to report to, so skip the timers entirely.
    if (!window.gtag) return;

    clearTimer();
    pendingTimer = setTimeout(() => flush(path), TITLE_WAIT_MS);

    // Navigating away before the title arrived: send what we have rather than
    // drop the view, so every navigation produces exactly one hit.
    return () => flush(path);
  }, [path]);
}
