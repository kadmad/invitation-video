import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { API_URL } from "@/api/client";
import { getTemplateVideoSrc as getVideoUrl } from "@/lib/templateVideo";
import type { Template, Category } from "@/types";

const BASE_URL = API_URL;

/** Mobile carousel card — same visual language as the grid's TemplateCard.
 * Once a card's video has played at least once, it stays mounted and simply
 * freezes on its last frame when the card goes inactive (paused, not
 * unmounted) instead of reverting to the thumbnail — so swiping away never
 * shows a hard cut back to a static first frame. Reactivating it resumes
 * from where it froze. Only the active card ever actually plays. */
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
          // No admin-reviewed preview yet means the URL is the raw source
          // upload — arbitrary size, not safe to autoplay in a card loop.
          // Stay on the static thumbnail for this template instead.
          getVideoUrl(t.id)
            .then((cached) => {
              if (cached.hasPreview) setVideoSrc(cached.url);
            })
            .catch(() => {});
          observer.disconnect();
        }
      },
      { rootMargin: "300px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [t.id, t.video_key]);

  // Play only while active; pause (freeze in place, no rewind) otherwise.
  // The element itself stays mounted regardless — see the render below —
  // so this never has to "restart" a video from scratch, just resume it.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (active) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [active, videoSrc]);

  // Reveal (crossfade from thumbnail to video) the first time this card's
  // video actually plays smoothly, and never revert it back — `canplay`
  // fires as soon as one frame is decoded, which is often still ahead of
  // real-time playback catching up (decoder warm-up), so cross-fading in
  // right then reads as a jerk/stutter under the fade. Waiting for the
  // `playing` event (playback genuinely underway), plus one extra rAF so the
  // first couple of frames have actually painted, makes the swap land on
  // motion that's already smooth.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || videoReady) return;
    let raf1 = 0;
    let raf2 = 0;
    const reveal = () => {
      raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => setVideoReady(true));
      });
    };
    // autoPlay/the effect above can win the race and start playback (and
    // fire `playing`) before this listener attaches — covered by checking
    // play state immediately too.
    if (!video.paused && video.readyState >= 3) {
      reveal();
    } else {
      video.addEventListener("playing", reveal);
    }
    return () => {
      video.removeEventListener("playing", reveal);
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [videoSrc, active, videoReady]);

  return (
    <Link
      ref={(el) => {
        elRef.current = el;
        cardRef(el);
      }}
      to={`/editor/${t.slug}`}
      className="card overflow-hidden shrink-0 snap-center w-[260px] select-none transition-all duration-150 ease-out will-change-transform"
      onContextMenu={(e) => e.preventDefault()}
      draggable={false}
    >
      <div className="relative aspect-[9/16] bg-surface-alt overflow-hidden">
        {t.thumbnail_key ? (
          <img
            // Cards are a fixed 260px wide regardless of breakpoint — ?size=sm
            // serves a 520px-wide variant instead of the 720px master.
            src={`${BASE_URL}/templates/${t.slug}/thumbnail?size=sm`}
            alt={t.name}
            loading="lazy"
            draggable={false}
            onContextMenu={(e) => e.preventDefault()}
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-[400ms] ease-in-out pointer-events-none select-none ${
              videoReady ? "opacity-0" : "opacity-100"
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

        {/* Mounts once prefetched (not gated on `active`) so it never has to
            be torn down and rebuilt — see the play/pause effect above. */}
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
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-[400ms] ease-in-out pointer-events-none select-none ${
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
        <h3 className="font-semibold text-ink text-sm truncate">{t.name}</h3>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs text-ink-muted">{parseFloat((t.duration_frames / t.fps).toFixed(2))}s</span>
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
 * plays video), neighbors recede into a coverflow-style 3D stack (rotated,
 * scaled down, pulled toward center for overlap). Both the active index and
 * the continuous per-card depth transform are derived from scroll position
 * each frame (rAF-throttled) rather than a carousel library, so it stays
 * correct through native momentum scrolling/snap instead of fighting it.
 * The depth transform is applied directly to the DOM (not React state) to
 * stay cheap at scroll-event frequency. */
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
        const cardWidth = el.offsetWidth;
        const cardCenter = el.offsetLeft + cardWidth / 2;
        const dist = Math.abs(cardCenter - containerCenter);
        if (dist < closestDist) {
          closestDist = dist;
          closestIdx = i;
        }

        // Continuous (fractional) distance in card-widths, so the coverflow
        // tilt/scale/overlap eases in as a card approaches center instead of
        // snapping in discrete steps at the active-index boundary.
        const signedDist = (cardCenter - containerCenter) / cardWidth;
        const absDist = Math.min(Math.abs(signedDist), 2.5);
        const sign = signedDist === 0 ? 0 : signedDist > 0 ? 1 : -1;
        const rotateY = -sign * Math.min(absDist * 34, 55);
        const translateX = -sign * absDist * 44;
        const scale = 1 - absDist * 0.14;
        const opacity = Math.max(1 - absDist * 0.35, 0.3);
        el.style.transform = `translateX(${translateX}px) scale(${scale}) rotateY(${rotateY}deg)`;
        el.style.opacity = String(opacity);
        el.style.zIndex = String(Math.round(100 - absDist * 10));
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
      style={{ perspective: "1200px" }}
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
