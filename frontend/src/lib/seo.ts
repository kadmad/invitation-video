import { useEffect } from "react";
import { SITE_NAME, SITE_URL } from "./site";
import { notifySeoReady } from "./analytics";

interface SeoOptions {
  title: string;
  description: string;
  /** Path only, e.g. "/privacy". Used for canonical + og:url. */
  path: string;
  /** Set true on pages that must stay out of search results. */
  noIndex?: boolean;
  /** Optional JSON-LD structured data injected as application/ld+json. */
  jsonLd?: Record<string, unknown>;
  /**
   * Absolute URL of the social share image. Defaults to the site logo —
   * pass a template thumbnail on per-template routes so shared links
   * preview the actual invitation rather than a generic logo.
   */
  image?: string;
  /** Describes `image` for screen readers / when the image fails to load. */
  imageAlt?: string;
}

function setMeta(selector: string, attr: "name" | "property", key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function setLink(rel: string, href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

/**
 * Client-side head management for a route: title, description, canonical,
 * Open Graph / Twitter cards and optional JSON-LD.
 */
export function useSeo({ title, description, path, noIndex, jsonLd, image, imageAlt }: SeoOptions) {
  useEffect(() => {
    const fullTitle = title.includes(SITE_NAME) ? title : `${title} | ${SITE_NAME}`;
    const url = `${SITE_URL}${path}`;
    const imageUrl = image || `${SITE_URL}/logo.png`;

    document.title = fullTitle;
    setMeta('meta[name="description"]', "name", "description", description);
    setMeta(
      'meta[name="robots"]',
      "name",
      "robots",
      noIndex ? "noindex, nofollow" : "index, follow, max-image-preview:large"
    );
    setLink("canonical", url);

    setMeta('meta[property="og:title"]', "property", "og:title", fullTitle);
    setMeta('meta[property="og:description"]', "property", "og:description", description);
    setMeta('meta[property="og:url"]', "property", "og:url", url);
    setMeta('meta[property="og:type"]', "property", "og:type", "website");
    setMeta('meta[property="og:site_name"]', "property", "og:site_name", SITE_NAME);
    setMeta('meta[property="og:locale"]', "property", "og:locale", "en_IN");
    setMeta('meta[property="og:image"]', "property", "og:image", imageUrl);
    setMeta('meta[property="og:image:alt"]', "property", "og:image:alt", imageAlt || fullTitle);
    setMeta('meta[name="twitter:card"]', "name", "twitter:card", "summary_large_image");
    setMeta('meta[name="twitter:title"]', "name", "twitter:title", fullTitle);
    setMeta('meta[name="twitter:description"]', "name", "twitter:description", description);
    setMeta('meta[name="twitter:image"]', "name", "twitter:image", imageUrl);

    let script: HTMLScriptElement | null = null;
    if (jsonLd) {
      script = document.createElement("script");
      script.type = "application/ld+json";
      script.dataset.seo = "route";
      script.textContent = JSON.stringify(jsonLd);
      document.head.appendChild(script);
    }

    // The title for this route is now correct, so any page_view queued by the
    // navigation can be sent with it rather than the previous page's title.
    notifySeoReady();

    return () => {
      script?.remove();
    };
    // jsonLd is inlined at each call site; stringify keeps the effect stable.
  }, [title, description, path, noIndex, image, imageAlt, JSON.stringify(jsonLd ?? null)]);
}
