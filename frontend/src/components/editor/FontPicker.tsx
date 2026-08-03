import { useEffect, useRef, useState, useMemo } from "react";
import { getFontFileUrl } from "@/api/fonts";
import type { Font } from "@/types";

interface FontPickerProps {
  fonts: Font[];
  selectedId: string | null;
  onSelect: (fontId: string | null) => void;
  /** Compact mode: no label, no bottom margin, smaller trigger */
  compact?: boolean;
  /** Font ID to show as fallback when selectedId is null (template default) */
  fallbackFontId?: string | null;
}

/** Load a font into the browser so we can render preview text in it. */
function useFontLoader(fonts: Font[]) {
  const [loaded, setLoaded] = useState<Set<string>>(new Set());

  useEffect(() => {
    // Only load fonts that are currently visible (lazy via IntersectionObserver)
    // For initial render, we load nothing — the observer handles it
  }, []);

  const loadFont = (font: Font) => {
    if (loaded.has(font.id)) return;
    const url = getFontFileUrl(font.id);
    // Use unique name per font ID to avoid collisions between same family different weights
    const faceName = `picker-${font.id.slice(0, 8)}`;
    const face = new FontFace(faceName, `url(${url})`);
    face
      .load()
      .then((f) => {
        document.fonts.add(f);
        setLoaded((prev) => new Set(prev).add(font.id));
      })
      .catch(() => {});
  };

  return { loaded, loadFont };
}

function FontOption({
  font,
  isSelected,
  onSelect,
  onObserve,
  isLoaded,
}: {
  font: Font;
  isSelected: boolean;
  onSelect: () => void;
  onObserve: (el: HTMLDivElement | null) => void;
  isLoaded: boolean;
}) {
  const faceName = `picker-${font.id.slice(0, 8)}`;

  return (
    <div
      ref={onObserve}
      data-font-id={font.id}
      onClick={onSelect}
      className={`px-3 py-2 cursor-pointer hover:bg-primary-50 flex items-center justify-between gap-2 ${
        isSelected ? "bg-primary-50 text-primary-700" : ""
      }`}
    >
      <span className="text-sm text-slate-700 flex-shrink-0 w-36 truncate">
        {font.name}
      </span>
      <span
        className="text-lg truncate flex-1 text-right"
        style={{
          fontFamily: isLoaded ? `"${faceName}", sans-serif` : "sans-serif",
          opacity: isLoaded ? 1 : 0.4,
          transition: "opacity 0.2s",
        }}
      >
        {font.preview_text || font.name}
      </span>
    </div>
  );
}

export default function FontPicker({ fonts, selectedId, onSelect, compact, fallbackFontId }: FontPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const { loaded, loadFont } = useFontLoader(fonts);

  const selected = fonts.find((f) => f.id === selectedId) ?? null;
  const fallbackFont = fallbackFontId ? fonts.find((f) => f.id === fallbackFontId) ?? null : null;

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Intersection observer for lazy font loading
  useEffect(() => {
    if (!open) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const fontId = (entry.target as HTMLElement).dataset.fontId;
            if (fontId) {
              const font = fonts.find((f) => f.id === fontId);
              if (font) loadFont(font);
            }
          }
        });
      },
      { root: listRef.current, rootMargin: "100px" }
    );
    observerRef.current = observer;

    // Observe elements already in DOM (ref callbacks fired before this effect)
    listRef.current?.querySelectorAll<HTMLElement>("[data-font-id]").forEach((el) => {
      observer.observe(el);
    });

    return () => observer.disconnect();
  }, [open, fonts, loadFont]);

  const observeElement = (el: HTMLDivElement | null) => {
    if (el && observerRef.current) {
      observerRef.current.observe(el);
    }
  };

  // Group by language, filter by search
  const grouped = useMemo(() => {
    const q = search.toLowerCase();
    const languages = ["gujarati", "hindi", "english"];
    return languages.map((lang) => ({
      lang,
      label: `${lang.charAt(0).toUpperCase() + lang.slice(1)}${lang !== "english" ? " (auto-transliterate)" : ""}`,
      fonts: fonts.filter(
        (f) => f.language === lang && (f.name.toLowerCase().includes(q) || (f.preview_text ?? "").toLowerCase().includes(q))
      ),
    })).filter((g) => g.fonts.length > 0);
  }, [fonts, search]);

  const selectedFaceName = selected ? `picker-${selected.id.slice(0, 8)}` : "";
  const fallbackFaceName = fallbackFont ? `picker-${fallbackFont.id.slice(0, 8)}` : "";

  // Load selected/fallback font eagerly
  useEffect(() => {
    if (selected) loadFont(selected);
    else if (fallbackFont) loadFont(fallbackFont);
  }, [selected, fallbackFont]);

  return (
    <div ref={containerRef} className={`relative ${compact ? "" : "mb-6"}`}>
      {!compact && (
        <label className="block text-sm font-medium text-slate-700 mb-2">
          Select Font{" "}
          <span className="text-slate-400 text-xs">(regional fonts auto-transliterate)</span>
        </label>
      )}

      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`input-field w-full bg-white text-left flex items-center justify-between transition ${compact ? "text-xs py-1.5 px-2.5" : "text-sm"}`}
      >
        {selected ? (
          <span className="flex items-center gap-2 min-w-0">
            <span className="text-slate-700 flex-shrink-0 truncate">{selected.name}</span>
            <span
              className={`truncate text-slate-500 ${compact ? "text-sm" : "text-lg"}`}
              style={{
                fontFamily: loaded.has(selected.id)
                  ? `"${selectedFaceName}", sans-serif`
                  : "sans-serif",
                opacity: loaded.has(selected.id) ? 1 : 0.4,
              }}
            >
              {selected.preview_text || selected.name}
            </span>
          </span>
        ) : fallbackFont ? (
          <span className="flex items-center gap-2 min-w-0">
            <span className="text-slate-500 flex-shrink-0 truncate">{fallbackFont.name}</span>
            <span
              className={`truncate text-slate-400 italic ${compact ? "text-sm" : "text-lg"}`}
              style={{
                fontFamily: loaded.has(fallbackFont.id)
                  ? `"${fallbackFaceName}", sans-serif`
                  : "sans-serif",
                opacity: loaded.has(fallbackFont.id) ? 1 : 0.4,
              }}
            >
              {fallbackFont.preview_text || fallbackFont.name}
            </span>
            <span className="text-[9px] text-slate-300 flex-shrink-0">default</span>
          </span>
        ) : (
          <span className="text-slate-400">{compact ? "None" : "Default (template font)"}</span>
        )}
        <svg
          className={`w-4 h-4 text-slate-400 flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div className={`absolute z-50 mt-1 bg-white border border-slate-100 rounded-2xl shadow-xl max-h-96 flex flex-col ${compact ? "w-80 right-0" : "w-full"}`}>
          {/* Search */}
          <div className="p-2 border-b border-slate-100">
            <div className="relative">
              <svg
                className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search fonts..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-xl pl-8 pr-3 py-1.5 text-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-400"
                autoFocus
              />
            </div>
          </div>

          {/* Options */}
          <div ref={listRef} className="overflow-y-auto flex-1">
            {/* Default option */}
            <div
              onClick={() => {
                onSelect(null);
                setOpen(false);
                setSearch("");
              }}
              className={`px-3 py-2 cursor-pointer hover:bg-slate-50 text-sm ${
                !selectedId ? "bg-primary-50 text-primary-700" : "text-slate-600"
              }`}
            >
              Default (template font)
            </div>

            {grouped.map(({ lang, label, fonts: langFonts }) => (
              <div key={lang}>
                <div className="px-3 py-1.5 bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wider sticky top-0">
                  {label}
                </div>
                {langFonts.map((f) => (
                  <FontOption
                    key={f.id}
                    font={f}
                    isSelected={selectedId === f.id}
                    onSelect={() => {
                      onSelect(f.id);
                      setOpen(false);
                      setSearch("");
                    }}
                    onObserve={observeElement}
                    isLoaded={loaded.has(f.id)}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
