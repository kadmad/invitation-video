import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { listTemplates } from "@/api/templates";
import { API_URL } from "@/api/client";
import { useSeo } from "@/lib/seo";
import { SITE_NAME, SITE_DESCRIPTION, SITE_URL, SITE_TAGLINE } from "@/lib/site";
import { getTemplateVideoSrc } from "@/lib/templateVideo";
import { DUMMY_TEMPLATES } from "@/lib/dummyTemplates";
import PageTransition from "@/components/common/PageTransition";
import Reveal from "@/components/common/Reveal";
import TemplateCarousel from "@/components/common/TemplateCarousel";
import type { Template } from "@/types";

const BASE_URL = API_URL;

function thumbUrl(slug: string) {
  return `${BASE_URL}/templates/${slug}/thumbnail`;
}

/**
 * A framed phone mockup that autoplays the template's actual rendered
 * preview video (muted, looping), falling back to the static thumbnail
 * until the video is fetched/ready or if the template has no video.
 */
function PhoneMockup({
  template,
  className = "",
  tilt = 0,
}: {
  template: Template;
  className?: string;
  tilt?: number;
}) {
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [videoReady, setVideoReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!template.video_key) return;
    let cancelled = false;
    getTemplateVideoSrc(template.id)
      .then((cached) => {
        if (!cancelled) setVideoSrc(cached.url);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [template.id, template.video_key]);

  // Only play while actually in view — autoplaying every mockup at once on
  // load gets silently throttled by the browser, so several never start.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        const video = videoRef.current;
        if (!video) return;
        if (entry.isIntersecting) video.play().catch(() => {});
        else video.pause();
      },
      { threshold: 0.4 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [videoSrc]);

  return (
    <div
      ref={containerRef}
      className={`relative w-40 sm:w-48 aspect-[9/16] rounded-[1.75rem] border-[6px] border-[#2A2420] bg-[#2A2420] shadow-xl overflow-hidden shrink-0 ${className}`}
      style={{ transform: tilt ? `rotate(${tilt}deg)` : undefined }}
    >
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-16 h-4 bg-[#2A2420] rounded-b-xl z-10" />

      {template.thumbnail_key ? (
        <img
          src={thumbUrl(template.slug)}
          alt={`${template.name} invitation preview`}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
            videoReady ? "opacity-0" : "opacity-100"
          }`}
          loading="lazy"
        />
      ) : (
        <div
          className={`absolute inset-0 w-full h-full bg-gradient-to-b from-[#F3E8D3] to-[#E4D2AE] transition-opacity duration-300 ${
            videoReady ? "opacity-0" : "opacity-100"
          }`}
        />
      )}

      {videoSrc && (
        <video
          ref={videoRef}
          src={videoSrc}
          muted
          loop
          playsInline
          preload="metadata"
          disablePictureInPicture
          onContextMenu={(e) => e.preventDefault()}
          onCanPlay={() => setVideoReady(true)}
          className="absolute inset-0 w-full h-full object-cover pointer-events-none select-none"
        />
      )}
    </div>
  );
}

const steps = [
  {
    title: "Step 1: Browse & Select",
    desc: "Choose from our curated library of stunning preset templates for weddings, engagements, birthdays and more.",
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
      </svg>
    ),
  },
  {
    title: "Step 2: Personalize in Minutes",
    desc: "Just enter your names, dates and venue. Layout, fonts, colors and animations are already done for you.",
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
      </svg>
    ),
  },
  {
    title: "Step 3: Download & Share",
    desc: "Get your HD invitation video and matching PDF card, and share the link on WhatsApp in seconds.",
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
      </svg>
    ),
  },
];

export default function LandingPage() {
  const [templates, setTemplates] = useState<Template[]>([]);

  useEffect(() => {
    listTemplates().then(setTemplates).catch(() => setTemplates([]));
  }, []);

  useSeo({
    title: `${SITE_NAME} — Wedding Invitation Video Maker, Designed & Delivered in Minutes`,
    description: SITE_DESCRIPTION,
    path: "/",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: SITE_NAME,
      url: SITE_URL,
      description: SITE_DESCRIPTION,
      publisher: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
      potentialAction: {
        "@type": "SearchAction",
        target: `${SITE_URL}/templates?search={search_term_string}`,
        "query-input": "required name=search_term_string",
      },
    },
  });

  const heroTemplates = templates.slice(0, 3);
  const showcaseTemplates = templates.length > 0 ? templates.slice(0, 6) : DUMMY_TEMPLATES;

  return (
    <PageTransition>
      <div className="space-y-16 sm:space-y-24 pb-8">
        {/* ── Hero ── */}
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#F6EFE1] via-[#F1E4CC] to-[#E9D6B0] px-6 py-14 sm:px-12 sm:py-20">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold leading-tight text-[#2A2420]">
                Your Perfect{" "}
                <span className="bg-gradient-to-r from-[#B98D4C] to-[#8B6F47] bg-clip-text text-transparent">
                  Wedding Invite.
                </span>{" "}
                Designed, Animated, and Delivered in Minutes.
              </h1>
              <p className="mt-5 text-base sm:text-lg text-[#6B6055] max-w-xl">
                Skip the design hassle. Choose your style, add your details, and let our
                templates create the magic — {SITE_TAGLINE.toLowerCase()}.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link
                  to="/templates"
                  className="inline-flex items-center gap-2 rounded-full bg-[#2A2420] text-[#F6EFE1] px-7 py-3.5 text-sm sm:text-base font-semibold hover:bg-[#3A322B] transition-colors shadow-lg shadow-[#2A2420]/20"
                >
                  Start Designing Now
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                  </svg>
                </Link>
                <span className="text-xs text-[#8B7E6E]">No design skills needed</span>
              </div>
            </div>

            {heroTemplates.length > 0 && (
              <div className="hidden lg:flex justify-center items-center gap-4 min-h-[22rem]">
                {heroTemplates[1] && <PhoneMockup template={heroTemplates[1]} tilt={-8} className="mt-8" />}
                {heroTemplates[0] && <PhoneMockup template={heroTemplates[0]} className="z-10 scale-110" />}
                {heroTemplates[2] && <PhoneMockup template={heroTemplates[2]} tilt={8} className="mt-8" />}
              </div>
            )}
          </div>
        </section>

        {/* ── Steps ── */}
        <section>
          <Reveal>
            <h2 className="text-2xl sm:text-3xl font-bold text-center text-slate-900">
              Effortless Creation, Preset Elegance
            </h2>
            <p className="text-center text-slate-500 mt-2 max-w-2xl mx-auto">
              Three simple steps between you and a beautiful invitation your guests will remember.
            </p>
          </Reveal>
          <div className="mt-10 grid sm:grid-cols-3 gap-8">
            {steps.map((s, i) => (
              <Reveal key={s.title} delay={i * 120}>
                <div className="text-center">
                  <div className="mx-auto w-16 h-16 rounded-2xl bg-[#F6EFE1] text-[#B98D4C] flex items-center justify-center mb-4">
                    {s.icon}
                  </div>
                  <h3 className="font-semibold text-slate-800">{s.title}</h3>
                  <p className="text-sm text-slate-500 mt-2 max-w-xs mx-auto">{s.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ── Live preview mockup ── */}
        {templates[0] && (
          <Reveal>
            <section className="rounded-3xl bg-[#2A2420] px-6 py-14 sm:px-12 sm:py-16">
              <div className="grid lg:grid-cols-2 gap-10 items-center">
                <div className="flex justify-center">
                  <PhoneMockup template={templates[0]} className="scale-125" />
                </div>
                <div className="text-center lg:text-left">
                  <p className="text-xs font-semibold tracking-wider text-[#C9A15E] uppercase mb-2">Live Preview</p>
                  <h2 className="text-2xl sm:text-3xl font-bold text-[#F6EFE1]">
                    Watch your invitation come to life
                  </h2>
                  <p className="mt-4 text-[#C9BEAA] max-w-md mx-auto lg:mx-0">
                    Every template comes with its own preset animation — names, dates and details
                    gracefully reveal themselves on screen, exactly how your guests will see it.
                  </p>
                  <Link
                    to="/templates"
                    className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#F6EFE1] text-[#2A2420] px-6 py-3 text-sm font-semibold hover:bg-white transition-colors"
                  >
                    Try a Template
                  </Link>
                </div>
              </div>
            </section>
          </Reveal>
        )}

        {/* ── Template showcase ── */}
        {showcaseTemplates.length > 0 && (
          <section>
            <Reveal>
              <h2 className="text-2xl sm:text-3xl font-bold text-center text-slate-900">
                Handpicked Invitation Templates
              </h2>
              <p className="text-center text-slate-500 mt-2 max-w-2xl mx-auto">
                Each one fully animated, ready to personalize with your own names, dates and venue.
              </p>
            </Reveal>
            {/* Mobile: same centered snap-carousel as the full templates
                page — active card plays video, neighbors are faded static
                thumbnails. Desktop/tablet keeps the phone-mockup row. */}
            <div className="mt-10 -mx-4 sm:hidden">
              <TemplateCarousel templates={showcaseTemplates} />
            </div>
            <Reveal delay={150} className="hidden sm:flex mt-10 flex-wrap justify-center gap-6 sm:gap-8">
              {showcaseTemplates.map((t) => (
                <Link key={t.id} to={`/editor/${t.slug}`} className="group flex flex-col items-center">
                  <PhoneMockup template={t} className="transition-transform group-hover:-translate-y-1" />
                  <span className="mt-3 text-sm font-medium text-slate-700 group-hover:text-[#B98D4C] transition-colors">
                    {t.name}
                  </span>
                </Link>
              ))}
            </Reveal>
            <div className="text-center mt-10">
              <Link
                to="/templates"
                className="inline-flex items-center gap-2 rounded-full border-2 border-[#2A2420] text-[#2A2420] px-6 py-3 text-sm font-semibold hover:bg-[#2A2420] hover:text-[#F6EFE1] transition-colors"
              >
                Browse All Templates
              </Link>
            </div>
          </section>
        )}

        {/* ── Final CTA ── */}
        <Reveal>
          <section className="rounded-3xl bg-gradient-to-br from-[#E9D6B0] to-[#F6EFE1] px-6 py-14 sm:px-12 text-center">
            <h2 className="text-2xl sm:text-3xl font-bold text-[#2A2420]">
              Ready to create your perfect invite?
            </h2>
            <p className="mt-3 text-[#6B6055] max-w-xl mx-auto">
              Digital invitations, made easy — in English, Hindi or Gujarati.
            </p>
            <Link
              to="/templates"
              className="mt-7 inline-flex items-center gap-2 rounded-full bg-[#2A2420] text-[#F6EFE1] px-8 py-3.5 text-sm sm:text-base font-semibold hover:bg-[#3A322B] transition-colors shadow-lg shadow-[#2A2420]/20"
            >
              Start Designing Now
            </Link>
          </section>
        </Reveal>
      </div>
    </PageTransition>
  );
}
