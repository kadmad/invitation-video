import { useEffect, useRef, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { listTemplates } from "@/api/templates";
import { listCategories } from "@/api/categories";
import PageTransition from "@/components/common/PageTransition";
import type { Template, Category } from "@/types";

/* ── Shared token cache across all cards ── */
const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000/api";

interface CachedToken { url: string; expiresAt: number; previewStatus?: string | null }
const tokenCache = new Map<string, CachedToken>();
const inflight = new Map<string, Promise<CachedToken>>();

async function getVideoUrl(templateId: string, forceRefresh = false): Promise<CachedToken> {
  const cached = tokenCache.get(templateId);
  const now = Math.floor(Date.now() / 1000);
  if (!forceRefresh && cached && cached.expiresAt > now + 30 && cached.previewStatus !== "processing") {
    return cached;
  }

  // Deduplicate concurrent requests for same template
  const pending = inflight.get(templateId);
  if (pending && !forceRefresh) return pending;

  const promise = (async () => {
    const res = await fetch(`${BASE_URL}/templates/${templateId}/video-token`);
    const { expires_at, has_preview, preview_status, video_url, preview_url } = await res.json();
    const entry: CachedToken = {
      url: has_preview && preview_url ? preview_url : video_url,
      expiresAt: expires_at,
      previewStatus: preview_status,
    };
    tokenCache.set(templateId, entry);
    inflight.delete(templateId);
    return entry;
  })();

  inflight.set(templateId, promise);
  return promise;
}

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
    if (!t.video_key || !cardRef.current) return;
    const el = cardRef.current;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          // Prefetch token in background
          getVideoUrl(t.id).then((cached) => {
            setVideoSrc(cached.url);
            if (cached.previewStatus) setPreviewStatus(cached.previewStatus);
          }).catch(() => {});
          observer.disconnect();
        }
      },
      { rootMargin: "200px" } // start 200px before visible
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [t.id, t.video_key]);

  // Poll video token while hovered if rendering or video not ready
  useEffect(() => {
    if (!hovered) return;
    const isProcessing = previewStatus === "processing" || previewStatus === "pending" || t.preview_status === "processing" || !videoReady;
    if (!isProcessing) return;

    const interval = setInterval(async () => {
      try {
        const cached = await getVideoUrl(t.id, true);
        setVideoSrc(cached.url);
        if (cached.previewStatus !== undefined) setPreviewStatus(cached.previewStatus);
      } catch { /* ignore */ }
    }, 2500);

    return () => clearInterval(interval);
  }, [hovered, previewStatus, t.preview_status, videoReady, t.id]);

  const startPreview = useCallback(async () => {
    hoveredRef.current = true;
    setHovered(true);
    if (!t.video_key) return;

    // If already have src and video ready, just play
    if (videoSrc && videoReady && previewStatus !== "processing") {
      videoRef.current?.play().catch(() => {});
      return;
    }

    try {
      const cached = await getVideoUrl(t.id, previewStatus === "processing");
      if (!hoveredRef.current) return;
      setVideoSrc(cached.url);
      if (cached.previewStatus !== undefined) setPreviewStatus(cached.previewStatus);
    } catch { /* ignore */ }
  }, [t.id, t.video_key, videoSrc, videoReady, previewStatus]);

  const stopPreview = useCallback(() => {
    hoveredRef.current = false;
    setHovered(false);
    if (videoRef.current) {
      videoRef.current.pause();
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
      className="card overflow-hidden group opacity-0 animate-slide-up select-none"
      style={{
        animationDelay: `${Math.min(index * 50, 300)}ms`,
        animationFillMode: "forwards",
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onTouchStart={handleTouchStart}
      onContextMenu={(e) => e.preventDefault()}
      draggable={false}
    >
      {/* Thumbnail with hover overlay */}
      <div className="relative aspect-[9/16] bg-slate-100 overflow-hidden">
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
        {t.video_key && videoSrc && (
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
            onCanPlay={() => {
              setVideoReady(true);
              if (hoveredRef.current) videoRef.current?.play().catch(() => {});
            }}
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-200 pointer-events-none select-none ${
              hovered && videoReady ? "opacity-100" : "opacity-0"
            }`}
          />
        )}

        {/* Hover shadow veil */}
        <div
          className={`absolute inset-0 bg-black transition-opacity duration-200 pointer-events-none z-[5] ${
            hovered && videoReady ? "opacity-30" : "opacity-0"
          }`}
        />

        {/* CTA overlay */}
        <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-10">
          <span className="btn-primary text-sm pointer-events-none">Use Template</span>
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
        <h3 className="font-semibold text-slate-900">{t.name}</h3>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs text-slate-400">
            {t.duration_frames / t.fps}s &middot; {t.width}x{t.height}
          </span>
          {category && (
            <span className="bg-primary-50 text-primary-600 rounded-full px-2 py-0.5 text-xs font-medium">
              {category.name}
            </span>
          )}
        </div>
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
      <button onClick={() => onPageChange(page - 1)} disabled={page === 1} className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50">Prev</button>
      {pages.map((p, i) =>
        p === "..." ? (
          <span key={`d${i}`} className="px-2 text-slate-400">...</span>
        ) : (
          <button key={p} onClick={() => onPageChange(p)} className={`px-3 py-1.5 text-sm rounded-lg border ${p === page ? "bg-primary-500 text-white border-primary-500" : "border-slate-200 hover:bg-slate-50"}`}>{p}</button>
        ),
      )}
      <button onClick={() => onPageChange(page + 1)} disabled={page === totalPages} className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50">Next</button>
    </div>
  );
}

export default function TemplateBrowsePage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    listCategories().then(setCategories);
  }, []);

  useEffect(() => {
    listTemplates(selectedCategory || undefined, search || undefined).then(
      setTemplates
    );
  }, [selectedCategory, search]);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [selectedCategory, search]);

  const totalPages = Math.max(1, Math.ceil(templates.length / USER_PER_PAGE));
  const paginated = templates.slice((page - 1) * USER_PER_PAGE, page * USER_PER_PAGE);

  return (
    <PageTransition>
      <h1 className="text-3xl font-bold text-slate-900 mb-6">Templates</h1>

      {/* Search input with icon */}
      <div className="relative mb-4">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none"
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
              ? "bg-primary-500 text-white rounded-full px-4 py-1.5 text-sm font-medium whitespace-nowrap"
              : "bg-white ring-1 ring-slate-200 text-slate-600 rounded-full px-4 py-1.5 text-sm font-medium hover:bg-slate-50 whitespace-nowrap"
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
                ? "bg-primary-500 text-white rounded-full px-4 py-1.5 text-sm font-medium whitespace-nowrap"
                : "bg-white ring-1 ring-slate-200 text-slate-600 rounded-full px-4 py-1.5 text-sm font-medium hover:bg-slate-50 whitespace-nowrap"
            }
          >
            {cat.name}
          </button>
        ))}
      </div>

      {/* Template grid */}
      {templates.length === 0 ? (
        <p className="text-slate-400 text-center py-12">No templates found</p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
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
