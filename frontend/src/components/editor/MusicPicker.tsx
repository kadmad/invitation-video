import { useCallback, useEffect, useRef, useState } from "react";
import { AUDIO_ACCEPT, isAudioFile } from "@/lib/audioFile";

interface Props {
  /** Display name of the chosen track, or null when there is none. */
  name: string | null;
  /** Where the track can be played and fetched from — a blob: object URL for
   *  a file the customer just picked, or a same-origin /music-file URL for a
   *  track already on the server. Cross-origin URLs play but can't be
   *  analysed into a waveform (decodeAudioData goes through fetch). */
  url: string | null;
  durationSeconds: number | null;
  /** Where in the track the video starts, in seconds. */
  startSeconds: number;
  /** How long the video runs; the selection window is exactly this wide. */
  videoDurationSeconds: number;
  /** Blocking problem ("couldn't read that file") — shown in red. */
  error?: string;
  /** Non-blocking heads-up (e.g. a short song) — shown in amber. */
  notice?: string;
  /** Label on the empty-state button. */
  emptyLabel?: string;
  /** Shown instead of "(optional)" next to that label. */
  emptyHint?: string;
  /** Disables the controls while an upload is in flight. */
  busy?: boolean;
  /** The track is someone else's choice (the admin's template soundtrack, as
   *  seen by a customer): it can be heard and replaced, but not re-cut or
   *  removed. Renders as a single slim row — no waveform, because there is
   *  nothing to drag. */
  readOnly?: boolean;
  /** Label on the button that swaps the track. Defaults to "Replace". */
  replaceLabel?: string;
  onPick: (file: File) => void;
  onStartChange: (seconds: number) => void;
  /** Omit to hide the Remove button. */
  onClear?: () => void;
}

/**
 * Choosing the music the way an editor does it: the track is drawn as a
 * waveform, the part that will actually be used is a window you drag along
 * it, and a play button lets you hear exactly that part.
 *
 * This replaces a bare range input spanning the whole track, with a pink
 * "you can't start after here" zone, a padlock tick and a toast that fired
 * when you dragged into it. That asked the customer to hold three
 * abstractions at once — the song's length, the video's length, and the
 * arithmetic between them — to answer a question they can only really answer
 * by ear. Here the window's *width* is the video's length, so the limit is
 * not a rule to be told about: the window simply cannot be dragged off the
 * end, and the pink zone has nothing left to warn about.
 */
export default function MusicPicker(p: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [peaks, setPeaks] = useState<number[] | null>(null);
  const [analysing, setAnalysing] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [playhead, setPlayhead] = useState(0); // 0..1 within the window
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerId: number; grabOffset: number } | null>(null);

  const dur = p.durationSeconds ?? 0;
  const windowSeconds = Math.min(p.videoDurationSeconds, dur || p.videoDurationSeconds);
  const maxStart = Math.max(0, dur - windowSeconds);
  const canSlide = maxStart > 0.05;
  // Three cases, and they read differently: a song longer than the video
  // (pick a part), one that matches it, and one that falls short.
  const shortfall = Math.max(0, p.videoDurationSeconds - dur);

  // --- Waveform ---
  // Decoded once per file. A few hundred peaks is plenty at this width, and
  // decoding happens off the main thread inside the browser's audio engine.
  useEffect(() => {
    // The read-only row draws no waveform, and decoding means fetching the
    // whole file — pure waste on a phone for a track the customer can't re-cut.
    if (!p.url || p.readOnly) {
      setPeaks(null);
      return;
    }
    let cancelled = false;
    setAnalysing(true);
    setPeaks(null);
    const url = p.url;
    (async () => {
      try {
        const buf = await (await fetch(url)).arrayBuffer();
        const Ctx: typeof AudioContext =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new Ctx();
        const decoded = await ctx.decodeAudioData(buf);
        void ctx.close();
        if (cancelled) return;
        const data = decoded.getChannelData(0);
        const BUCKETS = 320;
        const per = Math.floor(data.length / BUCKETS) || 1;
        const out: number[] = [];
        for (let i = 0; i < BUCKETS; i++) {
          let peak = 0;
          const from = i * per;
          for (let j = from; j < from + per && j < data.length; j += 4) {
            const v = Math.abs(data[j]);
            if (v > peak) peak = v;
          }
          out.push(peak);
        }
        const loudest = Math.max(...out, 0.01);
        setPeaks(out.map((v) => v / loudest));
      } catch {
        // A format the browser can decode for playback but not for analysis
        // still works — the picker just falls back to a plain bar.
        if (!cancelled) setPeaks(null);
      } finally {
        if (!cancelled) setAnalysing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [p.url, p.readOnly]);

  // --- Audible preview of the selected window ---
  const stopPreview = useCallback(() => {
    audioRef.current?.pause();
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    setPreviewing(false);
    setPlayhead(0);
  }, []);

  useEffect(() => stopPreview, [stopPreview]);
  // Moving the window while it plays would keep playing the old part.
  useEffect(() => {
    stopPreview();
  }, [p.startSeconds, stopPreview]);

  useEffect(() => {
    if (audioRef.current && p.url === null) {
      audioRef.current.pause();
      audioRef.current = null;
    }
  }, [p.url]);

  const togglePreview = () => {
    if (previewing) {
      stopPreview();
      return;
    }
    if (!p.url) return;
    let a = audioRef.current;
    if (!a) {
      a = new Audio(p.url);
      audioRef.current = a;
    } else if (a.src !== p.url) {
      a.src = p.url;
    }
    a.currentTime = p.startSeconds;
    void a.play();
    setPreviewing(true);
    const tick = () => {
      const el = audioRef.current;
      if (!el) return;
      const elapsed = el.currentTime - p.startSeconds;
      if (elapsed >= windowSeconds) {
        stopPreview();
        return;
      }
      setPlayhead(Math.max(0, Math.min(1, elapsed / windowSeconds)));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  // --- Dragging the window ---
  const startFromClientX = (clientX: number, grabOffset: number) => {
    const el = trackRef.current;
    if (!el || !canSlide) return;
    const r = el.getBoundingClientRect();
    const winFrac = windowSeconds / dur;
    const leftFrac = (clientX - r.left) / r.width - grabOffset;
    const clamped = Math.max(0, Math.min(1 - winFrac, leftFrac));
    p.onStartChange(clamped * dur);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!canSlide) return;
    const el = trackRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const winFrac = windowSeconds / dur;
    const startFrac = p.startSeconds / dur;
    const pointerFrac = (e.clientX - r.left) / r.width;
    // Grabbing inside the window keeps its offset under the finger; a press
    // anywhere else jumps the window's centre there, which is what people
    // expect of a scrub-like strip.
    const inside = pointerFrac >= startFrac && pointerFrac <= startFrac + winFrac;
    const grabOffset = inside ? pointerFrac - startFrac : winFrac / 2;
    dragRef.current = { pointerId: e.pointerId, grabOffset };
    e.currentTarget.setPointerCapture(e.pointerId);
    startFromClientX(e.clientX, grabOffset);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    startFromClientX(e.clientX, d.grabOffset);
  };

  const endDrag = (e: React.PointerEvent) => {
    const d = dragRef.current;
    dragRef.current = null;
    if (d && e.currentTarget.hasPointerCapture?.(d.pointerId)) {
      e.currentTarget.releasePointerCapture(d.pointerId);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!canSlide) return;
    const step = e.shiftKey ? 10 : 1;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      p.onStartChange(Math.max(0, p.startSeconds - step));
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      p.onStartChange(Math.min(maxStart, p.startSeconds + step));
    } else if (e.key === "Home") {
      e.preventDefault();
      p.onStartChange(0);
    } else if (e.key === "End") {
      e.preventDefault();
      p.onStartChange(maxStart);
    }
  };

  const [dropError, setDropError] = useState("");

  const handleFiles = (files: FileList | null) => {
    const f = files?.[0];
    if (!f) return;
    // The input's `accept` narrows the file dialog but is ignored entirely by
    // drag-and-drop, so a dropped video or PDF would otherwise reach the
    // upload. Checked here rather than in each caller so both the admin and
    // the customer are covered by the same guard.
    if (!isAudioFile(f)) {
      setDropError("That's not an audio file.");
      return;
    }
    setDropError("");
    p.onPick(f);
  };

  const hiddenInput = (
    <input
      ref={fileRef}
      type="file"
      accept={AUDIO_ACCEPT}
      className="hidden"
      onChange={(e) => {
        handleFiles(e.target.files);
        e.target.value = ""; // allow re-picking the same file after an error
      }}
    />
  );

  // --- Empty state ---
  // A slim row, not a drop box. The full-width dashed panel this used to be
  // sat directly above the pay button in the pinned footer, costing ~90px of
  // the one region that must never scroll — for a control most customers
  // never touch. It still takes a drop.
  if (!p.name) {
    return (
      <div className="mb-3">
        {hiddenInput}
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={p.busy}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            handleFiles(e.dataTransfer.files);
          }}
          title="Replaces the video's original audio"
          className={`w-full flex items-center justify-center gap-2 rounded-xl py-2 text-sm font-medium
            ring-1 transition-colors duration-200 ${
              dragOver
                ? "ring-brand-500 bg-brand-50 text-brand-700"
                : "ring-edge text-ink-muted hover:ring-brand-400 hover:text-ink"
            }`}
        >
          <MusicIcon />
          {p.busy ? "Uploading…" : (p.emptyLabel ?? "Use your own music")}
          {!p.busy && <span className="text-ink-muted font-normal">{p.emptyHint ?? "(optional)"}</span>}
        </button>
        {(dropError || p.error) && (
          <p className="text-[11px] text-red-500 mt-1">{dropError || p.error}</p>
        )}
      </div>
    );
  }

  // --- Someone else's track (the customer looking at the admin's soundtrack) ---
  // One slim row, the same height as the empty state. The full waveform card
  // here was a mistake: it sat permanently above the pay button in the pinned
  // footer for every template that has a soundtrack, and it bought nothing —
  // the window can't be dragged in read-only mode, so there is no reason to
  // draw it. Hear it or swap it; those are the only two choices.
  if (p.readOnly) {
    return (
      <div className="mb-3">
        {hiddenInput}
        <div className="flex items-center gap-2.5 rounded-xl bg-surface-alt ring-1 ring-edge px-3 py-2">
          <button
            type="button"
            onClick={togglePreview}
            aria-label={previewing ? "Stop preview" : "Hear the soundtrack"}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#2A2420] text-[#F6EFE1] transition-colors duration-200 hover:bg-[#3A322B]"
          >
            {previewing ? (
              <span className="flex gap-[2px]">
                <span className="block h-2.5 w-[2px] bg-current" />
                <span className="block h-2.5 w-[2px] bg-current" />
              </span>
            ) : (
              <span className="ml-0.5 block h-0 w-0 border-y-[4px] border-l-[7px] border-y-transparent border-l-current" />
            )}
          </button>
          <p className="min-w-0 flex-1 truncate text-xs text-ink-muted">
            <span className="text-ink">{p.name}</span> — plays with this video
          </p>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="shrink-0 text-xs font-medium text-ink-muted transition-colors hover:text-ink"
          >
            {p.replaceLabel ?? "Use my own"}
          </button>
        </div>
        {(dropError || p.error) && (
          <p className="mt-1 text-[11px] text-red-500">{dropError || p.error}</p>
        )}
      </div>
    );
  }

  // --- The customer's own track ---
  const winFrac = dur > 0 ? windowSeconds / dur : 1;
  const startFrac = dur > 0 ? p.startSeconds / dur : 0;

  return (
    <div className="mb-3 rounded-xl bg-surface-alt ring-1 ring-edge p-3">
      {hiddenInput}

      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={togglePreview}
          aria-label={previewing ? "Stop preview" : "Hear this part"}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#2A2420] text-[#F6EFE1]
                     transition-colors duration-200 hover:bg-[#3A322B]"
        >
          {previewing ? (
            <span className="flex gap-[3px]">
              <span className="block h-3 w-[3px] bg-current" />
              <span className="block h-3 w-[3px] bg-current" />
            </span>
          ) : (
            <span className="ml-0.5 block h-0 w-0 border-y-[5px] border-l-[9px] border-y-transparent border-l-current" />
          )}
        </button>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-ink">{p.name}</p>
          <p className="text-[11px] text-ink-muted">
            {canSlide
              ? `Plays ${fmt(p.startSeconds)} – ${fmt(p.startSeconds + windowSeconds)} of ${fmt(dur)}`
              : `The whole song — ${fmt(dur)}`}
          </p>
        </div>

        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={p.busy}
          className="shrink-0 text-xs text-ink-muted hover:text-ink transition-colors disabled:opacity-50"
        >
          {p.busy ? "Uploading…" : (p.replaceLabel ?? "Replace")}
        </button>
        {p.onClear && (
          <button
            type="button"
            onClick={() => {
              stopPreview();
              p.onClear?.();
            }}
            disabled={p.busy}
            className="shrink-0 text-xs text-red-500 hover:text-red-600 transition-colors disabled:opacity-50"
          >
            Remove
          </button>
        )}
      </div>

      {/* The track, with the used part lit. Dragging it is the whole control:
          the window is exactly as wide as the video, so it can't be put
          anywhere the song would run out. */}
      <div
        ref={trackRef}
        role={canSlide ? "slider" : undefined}
        tabIndex={canSlide ? 0 : undefined}
        aria-label={canSlide ? "Which part of the song to use" : undefined}
        aria-valuemin={canSlide ? 0 : undefined}
        aria-valuemax={canSlide ? Math.round(maxStart) : undefined}
        aria-valuenow={canSlide ? Math.round(p.startSeconds) : undefined}
        aria-valuetext={canSlide ? `Starts at ${fmt(p.startSeconds)}` : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
        style={{ touchAction: "none" }}
        className={`relative mt-2.5 h-14 select-none overflow-hidden rounded-lg bg-surface outline-none
          ring-1 ring-edge focus-visible:ring-2 focus-visible:ring-brand-500 ${
            canSlide ? "cursor-grab active:cursor-grabbing" : ""
          }`}
      >
        <Waveform peaks={peaks} analysing={analysing} />

        {/* Outside the window is dimmed rather than hidden, so the song stays
            legible as one thing you're choosing a part of. */}
        <div
          className="pointer-events-none absolute inset-y-0 left-0 bg-surface/75"
          style={{ width: `${startFrac * 100}%` }}
        />
        <div
          className="pointer-events-none absolute inset-y-0 right-0 bg-surface/75"
          style={{ width: `${Math.max(0, 1 - startFrac - winFrac) * 100}%` }}
        />
        <div
          className="pointer-events-none absolute inset-y-0 rounded-md border-2 border-[#B98D4C]
                     shadow-[0_0_0_3px_rgba(185,141,76,0.16)]"
          style={{ left: `${startFrac * 100}%`, width: `${winFrac * 100}%` }}
        />
        {previewing && (
          <div
            className="pointer-events-none absolute inset-y-0 w-[2px] bg-[#2A2420] dark:bg-[#F6EFE1]"
            style={{ left: `${(startFrac + winFrac * playhead) * 100}%` }}
          />
        )}
      </div>

      <p className="mt-1.5 text-center text-[11px] text-ink-muted">
        {canSlide
          ? "Drag the highlighted part to pick where the song starts"
          : shortfall > 1
            ? `The whole song is used — the last ${fmt(shortfall)} of the video is silent`
            : "This song is the same length as the video, so all of it is used"}
      </p>

      {p.notice && <p className="mt-1 text-center text-[11px] text-amber-600">{p.notice}</p>}
      {(dropError || p.error) && (
        <p className="mt-1 text-center text-[11px] text-red-500">{dropError || p.error}</p>
      )}
    </div>
  );
}

/** Peaks as mirrored bars. Falls back to a flat bar when the file couldn't be
 *  decoded for analysis — playback and rendering are unaffected either way. */
function Waveform({ peaks, analysing }: { peaks: number[] | null; analysing: boolean }) {
  if (analysing) {
    return (
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[11px] text-ink-muted">Reading the song…</span>
      </div>
    );
  }
  if (!peaks) {
    return <div className="absolute inset-y-1/2 left-0 h-[3px] w-full -translate-y-1/2 bg-edge" />;
  }
  return (
    <svg
      className="absolute inset-0 h-full w-full text-brand-400 dark:text-brand-300"
      viewBox={`0 0 ${peaks.length} 100`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {peaks.map((v, i) => {
        const h = Math.max(2, v * 88);
        return (
          <rect key={i} x={i + 0.15} y={50 - h / 2} width={0.7} height={h} fill="currentColor" rx={0.35} />
        );
      })}
    </svg>
  );
}

function fmt(seconds: number) {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function MusicIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 19V6l12-2v13M9 19a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm12-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
      />
    </svg>
  );
}
