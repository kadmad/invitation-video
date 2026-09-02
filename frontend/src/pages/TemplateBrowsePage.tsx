import { useEffect, useRef, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { listTemplates } from "@/api/templates";
import { listCategories } from "@/api/categories";
import PageTransition from "@/components/common/PageTransition";
import { DUMMY_TEMPLATES } from "@/lib/dummyTemplates";
import { track, trackOnce } from "@/lib/track";
import { useSeo } from "@/lib/seo";
import { API_URL } from "@/api/client";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import { getTemplateVideoSrc as getVideoUrl } from "@/lib/templateVideo";
import { pausePreview, playPreview } from "@/lib/previewPlayback";
import type { Template, Category } from "@/types";

const BASE_URL = API_URL;

function TemplateCard({
  template: t,
  category,
  index,
}: {
  template: Template;
  category?: Category;
  index: number;
}) {
  const [hovered, setHovered] = useState(false);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [videoReady, setVideoReady] = useState(false);
  const [previewStatus, setPreviewStatus] = useState<string | null>(t.preview_status ?? null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const cardRef = useRef<HTMLAnchorElement>(null);
  const isTouchRef = useRef(false);
  const hoveredRef = useRef(false);

  // Sync previewStatus when prop changes
  useEffect(() => {
    if (t.preview_status) setPreviewStatus(t.preview_status);
  }, [t.preview_status]);

  // Prefetch token + preload metadata when card enters viewport
  useEffect(() => {
    if (!t.has_video || !cardRef.current) return;
    const el = cardRef.current;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          // Prefetch token in background. No admin-reviewed preview yet
          // means `url` is the raw source upload — arbitrary size, not
          // safe to autoplay/preview in a card. Skip it; the static
          // thumbnail stays put until a preview exists.
          getVideoUrl(t.id).then((cached) => {
            if (cached.hasPreview) setVideoSrc(cached.url);
            if (cached.previewStatus) setPreviewStatus(cached.previewStatus);
          }).catch(() => {});
          observer.disconnect();
        }
      },
      { rootMargin: "200px" } // start 200px before visible
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [t.id, t.has_video]);

  // Poll video token while hovered if rendering or video not ready
  useEffect(() => {
    if (!hovered) return;
    const isProcessing = previewStatus === "processing" || previewStatus === "pending" || t.preview_status === "processing" || !videoReady;
    if (!isProcessing) return;

    const interval = setInterval(async () => {
      try {
        const cached = await getVideoUrl(t.id, true);
        // Raw source upload — not safe to preview until an actual preview
        // render exists. See the intersection-observer prefetch above.
        if (cached.hasPreview) setVideoSrc(cached.url);
        if (cached.previewStatus !== undefined) setPreviewStatus(cached.previewStatus);
      } catch { /* ignore */ }
    }, 2500);

    return () => clearInterval(interval);
  }, [hovered, previewStatus, t.preview_status, videoReady, t.id]);

  const startPreview = useCallback(async () => {
    hoveredRef.current = true;
    setHovered(true);
    if (!t.has_video) return;
    // Hover on a card is a deliberate act, so it counts as a play. The 10s
    // milestone below is what separates a passing cursor from real interest.
    trackOnce(`card-play-${t.id}`, "preview_play", { templateId: t.id, meta: { surface: "browse_card" } });

    // If already have src and video ready, just play
    if (videoSrc && videoReady && previewStatus !== "processing") {
      playPreview(videoRef.current);
      return;
    }

    try {
      const cached = await getVideoUrl(t.id, previewStatus === "processing");
      if (!hoveredRef.current) return;
      // Raw source upload — not safe to preview until an actual preview
      // render exists. See the intersection-observer prefetch above.
      if (cached.hasPreview) setVideoSrc(cached.url);
      if (cached.previewStatus !== undefined) setPreviewStatus(cached.previewStatus);
    } catch { /* ignore */ }
  }, [t.id, t.has_video, videoSrc, videoReady, previewStatus]);

  const stopPreview = useCallback(() => {
    hoveredRef.current = false;
    setHovered(false);
    if (videoRef.current) {
      pausePreview(videoRef.current);
      videoRef.current.currentTime = 0;
    }
  }, []);

  const handleMouseEnter = () => {
    if (isTouchRef.current) return;
    startPreview();
  };

  const handleMouseLeave = () => {
    if (isTouchRef.current) return;
    stopPreview();
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    isTouchRef.current = true;
    if (!hovered) {
      e.preventDefault();
      startPreview();
    }
  };

  return (
    <Link
      ref={cardRef}
      to={`/editor/${t.slug}`}
      className="card overflow-hidden opacity-0 animate-slide-up select-none"
      style={{
        animationDelay: `${Math.min(index * 50, 300)}ms`,
        animationFillMode: "forwards",
      }}
      onClick={() => track("template_card_click", { templateId: t.id, meta: { slug: t.slug } })}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onTouchStart={handleTouchStart}
      onContextMenu={(e) => e.preventDefault()}
      draggable={false}
    >
      {/* Thumbnail with hover overlay */}
      <div className="relative aspect-[9/16] bg-surface-alt overflow-hidden">
        {/* Static thumbnail */}
        {t.thumbnail_key ? (
          <img
            src={`${BASE_URL}/templates/${t.slug}/thumbnail`}
            alt={t.name}
            loading="lazy"
            draggable={false}
            onContextMenu={(e) => e.preventDefault()}
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-200 pointer-events-none select-none ${
              hovered && videoReady ? "opacity-0" : "opacity-100"
            }`}
          />
        ) : (
          <div
            className={`absolute inset-0 w-full h-full flex items-center justify-center text-slate-300 transition-opacity duration-200 ${
              hovered && videoReady ? "opacity-0" : "opacity-100"
            }`}
          >
            <svg
              className="w-12 h-12"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
              />
            </svg>
          </div>
        )}

        {/* Video — preloaded metadata, plays on hover */}
        {t.has_video && videoSrc && (
          <video
            ref={videoRef}
            src={videoSrc}
            muted
            loop
            playsInline
            preload="metadata"
            controlsList="nodownload nofullscreen noremoteplayback"
            disablePictureInPicture
            onContextMenu={(e) => e.preventDefault()}
            onLoadedData={() => setVideoReady(true)}
            // Watched-time milestone. currentTime rather than wall-clock so a
            // paused or backgrounded card doesn't accrue time it never played,
            // and `loop` means this fires on the first pass only.
            onTimeUpdate={(e) => {
              if (e.currentTarget.currentTime >= 10) {
                trackOnce(`card-10s-${t.id}`, "preview_10s", {
                  templateId: t.id,
                  value: 10,
                  meta: { surface: "browse_card" },
                });
              }
            }}
            onCanPlay={() => {
              setVideoReady(true);
              if (hoveredRef.current) playPreview(videoRef.current);
            }}
            onWaiting={() => {
              if (hoveredRef.current) playPreview(videoRef.current);
            }}
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-200 pointer-events-none select-none ${
              hovered && videoReady ? "opacity-100" : "opacity-0"
            }`}
          />
        )}

        {/* Faint hover veil — just enough to signal interactivity, not
            enough to obscure the video preview it's supposed to show off. */}
        <div
          className={`absolute inset-0 bg-black transition-opacity duration-200 pointer-events-none z-[5] ${
            hovered && videoReady ? "opacity-10" : "opacity-0"
          }`}
        />

        {/* Small bottom-anchored label, not a full-card block — the point
            of hovering is to see the video, not to have it covered up. */}
        <div
          className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/50 to-transparent p-2 flex justify-center pointer-events-none transition-opacity duration-200 ${
            hovered ? "opacity-100" : "opacity-0"
          }`}
        >
          <span className="btn-brand text-xs px-3 py-1.5 pointer-events-none">Use Template</span>
        </div>

        {/* Hover preview generating status notice */}
        {hovered && (previewStatus === "processing" || previewStatus === "pending" || t.preview_status === "processing") && (
          <div className="absolute inset-0 bg-slate-950/65 backdrop-blur-xs flex flex-col items-center justify-center p-3 text-center transition-all z-20 pointer-events-none">
            <div className="flex items-center gap-2 text-amber-300 font-medium text-xs bg-amber-950/85 px-3.5 py-2 rounded-full border border-amber-500/30 shadow-lg animate-pulse">
              <svg className="w-4 h-4 animate-spin text-amber-400 flex-shrink-0" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span>Preview is getting ready...</span>
            </div>
          </div>
        )}
        {/* Loading spinner when video is buffering (not rendering) */}
        {hovered && !videoReady && !(previewStatus === "processing" || previewStatus === "pending" || t.preview_status === "processing") && videoSrc && (
          <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
            <svg className="w-8 h-8 animate-spin text-white/60" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        )}
      </div>

      {/* Info section */}
      <div className="p-4">
        <h3 className="font-semibold text-ink">{t.name}</h3>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs text-ink-muted">
            {parseFloat((t.duration_frames / t.fps).toFixed(2))}s &middot; {t.width}x{t.height}
          </span>
          {category && (
            <span className="bg-brand-50 text-brand-600 rounded-full px-2 py-0.5 text-xs font-medium">
              {category.name}
            </span>
          )}
        </div>

        {/* Discounted price — anchor the higher price (struck through) next
            to the lower watermark-opt-in price so the discount reads as a
            deal at a glance, plus a "% OFF" badge for extra pull. Leads
            with the lower number since that's the price most likely to
            convert a scrolling browser into a click. */}
        {!!t.price && t.price > 0 && (() => {
          const fullPaise = t.price!;
          const discountPaise = t.discount_amount_paise ?? 0;
          return (
            <div className="mt-2">
              <div className="flex items-baseline gap-1.5 flex-wrap">
                <span className="text-lg font-extrabold text-ink">
                  ₹{Math.round((fullPaise - discountPaise) / 100)}
                </span>
                {!!discountPaise && (
                  <>
                    <span className="text-xs text-ink-muted line-through">
                      ₹{Math.round(fullPaise / 100)}
                    </span>
                    <span className="animate-scale-in bg-emerald-50 text-emerald-600 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                      {Math.round((discountPaise / fullPaise) * 100)}% OFF
                    </span>
                  </>
                )}
              </div>
            </div>
          );
        })()}
      </div>
    </Link>
  );
}

const USER_PER_PAGE = 12;

function Pagination({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (p: number) => void;
}) {
  if (totalPages <= 1) return null;
  const pages: (number | "...")[] = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || Math.abs(i - page) <= 1) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== "...") {
      pages.push("...");
    }
  }
  return (
    <div className="flex items-center justify-center gap-1 mt-8">
      <button onClick={() => onPageChange(page - 1)} disabled={page === 1} className="px-3 py-1.5 text-sm rounded-lg border border-edge disabled:opacity-40 hover:bg-surface-alt">Prev</button>
      {pages.map((p, i) =>
        p === "..." ? (
          <span key={`d${i}`} className="px-2 text-ink-muted">...</span>
        ) : (
          <button key={p} onClick={() => onPageChange(p)} className={`px-3 py-1.5 text-sm rounded-lg border ${p === page ? "bg-brand-500 text-white border-brand-500" : "border-edge hover:bg-surface-alt"}`}>{p}</button>
        ),
      )}
      <button onClick={() => onPageChange(page + 1)} disabled={page === totalPages} className="px-3 py-1.5 text-sm rounded-lg border border-edge disabled:opacity-40 hover:bg-surface-alt">Next</button>
    </div>
  );
}

export default function TemplateBrowsePage() {
  // Distinct description (not SITE_DESCRIPTION — that's the homepage's, and
  // duplicate meta descriptions across URLs waste crawl relevance). The
  // WebSite + SearchAction entity intentionally lives only on the homepage;
  // emitting it here too created two competing WebSite entities.
  useSeo({
    title: "Invitation Video Templates",
    description:
      "Browse ready-made video invitation templates for weddings, engagements, birthdays and housewarmings. Pick a design, personalise the names and dates in English, Hindi or Gujarati, and download in minutes.",
    path: "/templates",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: "Invitation Video Templates",
      url: `${SITE_URL}/templates`,
      isPartOf: { "@type": "WebSite", name: SITE_NAME, url: SITE_URL },
    },
  });

  const [templates, setTemplates] = useState<Template[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    listCategories().then(setCategories);
  }, []);

  useEffect(() => {
    trackOnce("browse", "browse_view");
  }, []);

  useEffect(() => {
    listTemplates(selectedCategory || undefined, search || undefined).then(
      setTemplates
    );
  }, [selectedCategory, search]);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [selectedCategory, search]);

  // No real data at all yet (still loading, or the API genuinely returned
  // none) and no active search/filter — show placeholder cards so the
  // section's layout/style is visible immediately rather than blank. A
  // real search or category filter that comes up empty still shows the
  // honest "No templates found" message below, not placeholders.
  const isBrowsingUnfiltered = !search && !selectedCategory;
  const displayTemplates = templates.length === 0 && isBrowsingUnfiltered ? DUMMY_TEMPLATES : templates;

  const totalPages = Math.max(1, Math.ceil(displayTemplates.length / USER_PER_PAGE));
  const paginated = displayTemplates.slice((page - 1) * USER_PER_PAGE, page * USER_PER_PAGE);

  return (
    <PageTransition>
      <h1 className="text-3xl font-bold text-ink mb-2">Invitation Video Templates</h1>
      <p className="text-ink-muted mb-6">
        Ready-made designs for weddings, engagements, birthdays and housewarmings — personalise any
        template in English, Hindi or Gujarati.
      </p>

      {/* Search input with icon */}
      <div className="relative mb-4">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-ink-muted pointer-events-none"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 103.5 10.5a7.5 7.5 0 0013.15 6.15z"
          />
        </svg>
        <input
          type="text"
          placeholder="Search templates..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input-field pl-10 w-full"
        />
      </div>

      {/* Category pill buttons */}
      <div className="flex gap-2 overflow-x-auto py-3 scrollbar-hide mb-6">
        <button
          onClick={() => setSelectedCategory("")}
          className={
            selectedCategory === ""
              ? "bg-brand-500 text-white rounded-full px-4 py-1.5 text-sm font-medium whitespace-nowrap"
              : "bg-surface ring-1 ring-edge text-ink-muted rounded-full px-4 py-1.5 text-sm font-medium hover:bg-surface-alt whitespace-nowrap"
          }
        >
          All
        </button>
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setSelectedCategory(cat.id)}
            className={
              selectedCategory === cat.id
                ? "bg-brand-500 text-white rounded-full px-4 py-1.5 text-sm font-medium whitespace-nowrap"
                : "bg-surface ring-1 ring-edge text-ink-muted rounded-full px-4 py-1.5 text-sm font-medium hover:bg-surface-alt whitespace-nowrap"
            }
          >
            {cat.name}
          </button>
        ))}
      </div>

      {/* Templates */}
      {displayTemplates.length === 0 ? (
        <p className="text-ink-muted text-center py-12">No templates found</p>
      ) : (
        <>
          {/* Same tiled grid at every breakpoint — 2 columns on mobile, up to
              4 on desktop. Used to swap to a single-card swipeable carousel
              below sm:, which read as an odd, cramped mismatch with the rest
              of the site's browsing UX on a phone. */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5">
            {paginated.map((t, i) => {
              const category = categories.find((c) => c.id === t.category_id);
              return (
                <TemplateCard key={t.id} template={t} category={category} index={i} />
              );
            })}
          </div>
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </>
      )}
    </PageTransition>
  );
}
