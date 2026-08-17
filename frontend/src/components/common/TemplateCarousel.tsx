import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { API_URL } from "@/api/client";
import { getTemplateVideoSrc as getVideoUrl } from "@/lib/templateVideo";
import type { Template, Category } from "@/types";

const BASE_URL = API_URL;

/** Mobile carousel card — same visual language as the grid's TemplateCard,
 * but video only ever mounts (and can therefore only ever play) for the
 * centered ("active") card. Everything else stays a static, faded
 * thumbnail — structurally incapable of playing, not just paused. */
function CarouselTemplateCard({
  template: t,
  category,
  active,
  cardRef,
}: {
  template: Template;
  category?: Category;
  active: boolean;
  cardRef: (el: HTMLAnchorElement | null) => void;
}) {
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [videoReady, setVideoReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const elRef = useRef<HTMLAnchorElement | null>(null);

  // Prefetch the video URL once this card is near the viewport, so it's
  // ready the instant it becomes active — the <video> element itself still
  // only mounts (and can only play) once it actually is.
  useEffect(() => {
    if (!t.video_key || !elRef.current) return;
    const el = elRef.current;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          getVideoUrl(t.id).then((cached) => setVideoSrc(cached.url)).catch(() => {});
          observer.disconnect();
        }
      },
      { rootMargin: "300px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [t.id, t.video_key]);

  useEffect(() => {
    if (!active) setVideoReady(false);
  }, [active]);

  return (
    <Link
      ref={(el) => {
        elRef.current = el;
        cardRef(el);
      }}
      to={`/editor/${t.slug}`}
      className={`card overflow-hidden shrink-0 snap-center w-[260px] select-none transition-all duration-300 ease-out ${
        active ? "opacity-100 scale-100" : "opacity-40 scale-90"
      }`}
      onContextMenu={(e) => e.preventDefault()}
      draggable={false}
    >
      <div className="relative aspect-[9/16] bg-slate-100 overflow-hidden">
        {t.thumbnail_key ? (
          <img
            src={`${BASE_URL}/templates/${t.slug}/thumbnail`}
            alt={t.name}
            loading="lazy"
            draggable={false}
            onContextMenu={(e) => e.preventDefault()}
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-200 pointer-events-none select-none ${
              active && videoReady ? "opacity-0" : "opacity-100"
            }`}
          />
        ) : (
          <div className="absolute inset-0 w-full h-full flex items-center justify-center text-slate-300">
            <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
              />
            </svg>
          </div>
        )}

        {/* Only the active card ever gets a <video> in the DOM at all */}
        {active && t.video_key && videoSrc && (
          <video
            ref={videoRef}
            src={videoSrc}
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            controlsList="nodownload nofullscreen noremoteplayback"
            disablePictureInPicture
            onContextMenu={(e) => e.preventDefault()}
            onCanPlay={() => setVideoReady(true)}
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-200 pointer-events-none select-none ${
              videoReady ? "opacity-100" : "opacity-0"
            }`}
          />
        )}

        {active && (
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/50 to-transparent p-3 flex justify-center">
            <span className="btn-brand text-xs px-4 py-2 pointer-events-none">Use Template</span>
          </div>
        )}
      </div>

      <div className="p-3">
        <h3 className="font-semibold text-slate-900 text-sm truncate">{t.name}</h3>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs text-slate-400">{t.duration_frames / t.fps}s</span>
          {category && (
            <span className="bg-brand-50 text-brand-600 rounded-full px-2 py-0.5 text-xs font-medium truncate">
              {category.name}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

/** Mobile-only snap carousel — the centered card is active (full opacity,
 * plays video), neighbors are faded static thumbnails. Active card is
 * derived from scroll position each frame (rAF-throttled) rather than a
 * carousel library, so it stays correct through native momentum
 * scrolling/snap instead of fighting it. */
export default function TemplateCarousel({
  templates,
  categories = [],
}: {
  templates: Template[];
  categories?: Category[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cardEls = useRef<(HTMLAnchorElement | null)[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let raf = 0;

    const computeActive = () => {
      const containerCenter = container.scrollLeft + container.clientWidth / 2;
      let closestIdx = 0;
      let closestDist = Infinity;
      cardEls.current.forEach((el, i) => {
        if (!el) return;
        const cardCenter = el.offsetLeft + el.offsetWidth / 2;
        const dist = Math.abs(cardCenter - containerCenter);
        if (dist < closestDist) {
          closestDist = dist;
          closestIdx = i;
        }
      });
      setActiveIndex((prev) => (prev === closestIdx ? prev : closestIdx));
    };

    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(computeActive);
    };

    computeActive();
    container.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      container.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [templates.length]);

  return (
    <div
      ref={containerRef}
      className="flex gap-4 overflow-x-auto snap-x snap-mandatory pb-2 px-[calc(50%-130px)] [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {templates.map((t, i) => {
        const category = categories.find((c) => c.id === t.category_id);
        return (
          <CarouselTemplateCard
            key={t.id}
            template={t}
            category={category}
            active={i === activeIndex}
            cardRef={(el) => {
              cardEls.current[i] = el;
            }}
          />
        );
      })}
    </div>
  );
}
