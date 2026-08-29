import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { uploadTemplateMusic, deleteTemplateMusic, getAdminTemplate } from "@/api/admin";
import { templateMusicUrl } from "@/api/templates";
import { AUDIO_ACCEPT, checkAudioFile, isAudioFile } from "@/lib/audioFile";
import {
  useAdminTemplateStore,
  beginTemporalGesture,
  endTemporalGesture,
} from "@/store/adminTemplateStore";
import { toast, errorMessage } from "@/store/toastStore";

interface Props {
  /** Seconds of video the lane spans — the same axis the block lanes use. */
  totalSeconds: number;
}

/**
 * The soundtrack as a track on the timeline, the way every video editor does
 * it, rather than a control panel somewhere else in the page.
 *
 * The clip is drawn at the song's real length against the timeline's scale, so
 * a two-minute song over a thirty-second video is visibly four times too long
 * and hangs off the end. Dragging it slides the song under the video — which is
 * the same "where does the music start" decision the old slider asked for, but
 * posed as a thing you move rather than a number you set. It cannot be dragged
 * to leave a gap: the clip always covers the whole video, because a template's
 * music has to.
 */
export default function AudioTrack({ totalSeconds }: Props) {
  const { id: templateId } = useParams<{ id: string }>();
  const { template, setTemplate } = useAdminTemplateStore();

  const fileRef = useRef<HTMLInputElement>(null);
  const laneRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const dragRef = useRef<{ pointerId: number; grabSeconds: number } | null>(null);
  /** Set once a drag actually moves the clip, so releasing after a drag doesn't
   *  also fire the click that toggles the hint. */
  const draggedRef = useRef(false);

  const [peaks, setPeaks] = useState<number[] | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const musicKey = template?.music_key ?? null;
  const startSeconds = template?.music_start_seconds ?? 0;
  const volume = template?.music_volume ?? 1;

  // The key is timestamped, so it doubles as a cache-buster: without it the
  // browser keeps serving the previous track from the stable /music-file URL.
  const src =
    template?.id && musicKey
      ? `${templateMusicUrl(template.id)}?v=${encodeURIComponent(musicKey)}`
      : null;

  // --- Load the track: real duration, and peaks for the waveform ---
  useEffect(() => {
    if (!src) {
      setPeaks(null);
      setDuration(null);
      return;
    }
    let cancelled = false;

    const probe = new Audio();
    probe.preload = "metadata";
    probe.onloadedmetadata = () => {
      if (!cancelled) setDuration(isFinite(probe.duration) ? probe.duration : null);
    };
    probe.src = src;

    (async () => {
      try {
        const buf = await (await fetch(src)).arrayBuffer();
        const Ctx: typeof AudioContext =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new Ctx();
        const decoded = await ctx.decodeAudioData(buf);
        void ctx.close();
        if (cancelled) return;
        const data = decoded.getChannelData(0);
        const BUCKETS = 600;
        const per = Math.floor(data.length / BUCKETS) || 1;
        const out: number[] = [];
        for (let i = 0; i < BUCKETS; i++) {
          let peak = 0;
          for (let j = i * per; j < (i + 1) * per && j < data.length; j += 4) {
            const v = Math.abs(data[j]);
            if (v > peak) peak = v;
          }
          out.push(peak);
        }
        const loudest = Math.max(...out, 0.01);
        setPeaks(out.map((v) => v / loudest));
        if (!cancelled) setDuration(decoded.duration);
      } catch {
        // Playable but not analysable — the clip still works, it just draws flat.
        if (!cancelled) setPeaks(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [src]);

  const stopPreview = useCallback(() => {
    audioRef.current?.pause();
    setPreviewing(false);
  }, []);

  useEffect(() => stopPreview, [stopPreview]);

  const togglePreview = () => {
    if (previewing) {
      stopPreview();
      return;
    }
    if (!src) return;
    let a = audioRef.current;
    if (!a) {
      a = new Audio(src);
      audioRef.current = a;
      a.onended = () => setPreviewing(false);
    } else if (a.src !== src) {
      a.src = src;
    }
    a.volume = Math.max(0, Math.min(1, volume));
    a.currentTime = startSeconds;
    void a.play();
    setPreviewing(true);
  };

  // --- Upload / replace / remove ---
  const applyTemplate = async () => {
    if (!templateId) return;
    const updated = await getAdminTemplate(templateId);
    setTemplate({
      ...updated,
      text_blocks: template?.text_blocks ?? updated.text_blocks,
      image_blocks: template?.image_blocks ?? updated.image_blocks,
    });
  };

  const handlePick = async (file: File) => {
    if (!templateId) return;
    setError("");
    setNotice("");
    // Same gate the customer gets — an unreadable file should be caught here,
    // not by a 400 after the whole thing has uploaded.
    const check = await checkAudioFile(file, totalSeconds);
    if (check.error) {
      setError(check.error);
      return;
    }
    if (check.notice) setNotice(check.notice);

    setBusy(true);
    try {
      await uploadTemplateMusic(templateId, file);
      await applyTemplate();
      toast.success("Soundtrack added — tick Render and Save to rebuild the preview");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async () => {
    if (!templateId) return;
    stopPreview();
    setError("");
    setNotice("");
    setBusy(true);
    try {
      await deleteTemplateMusic(templateId);
      await applyTemplate();
      setExpanded(false);
      toast.success("Soundtrack removed — the video's own audio plays again");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const handleFiles = (files: FileList | null) => {
    const f = files?.[0];
    if (!f) return;
    // `accept` narrows the file dialog but is ignored by drag-and-drop.
    if (!isAudioFile(f)) {
      setError("That's not an audio file.");
      return;
    }
    void handlePick(f);
  };

  // --- Dragging the clip along the timeline ---
  const maxStart = Math.max(0, (duration ?? 0) - totalSeconds);

  const setStart = (seconds: number) => {
    if (!template) return;
    const clamped = Math.max(0, Math.min(maxStart, seconds));
    setTemplate({ ...template, music_start_seconds: clamped });
  };

  const secondsPerPixel = () => {
    const el = laneRef.current;
    if (!el) return 0;
    return totalSeconds / el.getBoundingClientRect().width;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (maxStart <= 0.05 || busy) return;
    const spp = secondsPerPixel();
    if (!spp) return;
    // Grab point kept under the cursor, so the clip doesn't jump on mousedown.
    dragRef.current = { pointerId: e.pointerId, grabSeconds: e.clientX * spp + startSeconds };
    draggedRef.current = false;
    e.currentTarget.setPointerCapture(e.pointerId);
    // One undo entry for the whole drag, not one per mousemove.
    beginTemporalGesture();
    stopPreview();
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const spp = secondsPerPixel();
    if (!spp) return;
    draggedRef.current = true;
    setStart(d.grabSeconds - e.clientX * spp);
  };

  const endDrag = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    dragRef.current = null;
    if (e.currentTarget.hasPointerCapture?.(d.pointerId)) {
      e.currentTarget.releasePointerCapture(d.pointerId);
    }
    endTemporalGesture();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (maxStart <= 0.05) return;
    const step = e.shiftKey ? 5 : 0.5;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      setStart(startSeconds - step);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      setStart(startSeconds + step);
    }
  };

  const hiddenInput = (
    <input
      ref={fileRef}
      type="file"
      accept={AUDIO_ACCEPT}
      className="hidden"
      onChange={(e) => {
        handleFiles(e.target.files);
        e.target.value = "";
      }}
    />
  );

  const dropHandlers = {
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(true);
    },
    onDragLeave: () => setDragOver(false),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      handleFiles(e.dataTransfer.files);
    },
  };

  // --- Empty lane ---
  if (!musicKey) {
    return (
      <div className="mx-4 mb-2">
        {hiddenInput}
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          {...dropHandlers}
          className={`w-full h-9 rounded-md border border-dashed flex items-center justify-center gap-2 text-[10px] font-medium transition ${
            dragOver
              ? "border-emerald-400 bg-emerald-400/10 text-emerald-300"
              : "border-white/15 text-white/40 hover:border-white/30 hover:text-white/70"
          }`}
        >
          <MusicIcon />
          {busy ? "Uploading…" : "Add music — replaces the video's own audio"}
        </button>
        {error && <p className="mt-1 text-[10px] text-red-400">{error}</p>}
      </div>
    );
  }

  // --- The clip ---
  // Width is the song's own length on the timeline's scale, so a song longer
  // than the video visibly overhangs — which is the whole point: it shows there
  // is more song than video, and that sliding it picks which part is used.
  const dur = duration ?? totalSeconds;
  const clipWidthPct = (dur / totalSeconds) * 100;
  const clipLeftPct = -(startSeconds / totalSeconds) * 100;
  const canSlide = maxStart > 0.05;

  return (
    <div className="mx-4 mb-2">
      {hiddenInput}

      <div
        ref={laneRef}
        {...dropHandlers}
        className={`relative h-9 rounded-md bg-white/[0.03] overflow-hidden ${
          dragOver ? "ring-1 ring-emerald-400" : ""
        }`}
      >
        <div
          role="slider"
          tabIndex={canSlide ? 0 : undefined}
          aria-label="Which part of the song plays"
          aria-valuemin={0}
          aria-valuemax={Math.round(maxStart)}
          aria-valuenow={Math.round(startSeconds)}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onKeyDown={onKeyDown}
          onClick={() => {
            if (draggedRef.current) return;
            setExpanded((v) => !v);
          }}
          style={{
            left: `${clipLeftPct}%`,
            width: `${clipWidthPct}%`,
            touchAction: "none",
          }}
          className={`absolute inset-y-0 rounded-md bg-emerald-500/25 ring-1 ring-emerald-400/60 outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 ${
            canSlide ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
          }`}
        >
          <Waveform peaks={peaks} />
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[9px] font-medium text-emerald-100 pointer-events-none drop-shadow">
            ♪ {fmt(dur)}
            {canSlide && ` · from ${fmt(startSeconds)}`}
          </span>
        </div>

        {/* Everything past the end of the video is dimmed — it exists in the
            song but will never be heard. */}
        {clipWidthPct + clipLeftPct > 100 && (
          <div className="absolute inset-y-0 right-0 w-0 pointer-events-none" />
        )}
      </div>

      <div className="flex items-center gap-3 mt-1">
        <button
          type="button"
          onClick={togglePreview}
          className="text-[10px] text-white/60 hover:text-white transition"
        >
          {previewing ? "■ Stop" : "▶ Hear it"}
        </button>

        <label className="flex items-center gap-1.5" title="Soundtrack volume in the final video">
          <span className="text-[10px] text-white/40">Vol</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volume}
            onChange={(e) => {
              if (!template) return;
              setTemplate({ ...template, music_volume: parseFloat(e.target.value) });
              if (audioRef.current) audioRef.current.volume = parseFloat(e.target.value);
            }}
            className="w-20 accent-emerald-400 cursor-pointer"
          />
          <span className="text-[10px] text-white/40 tabular-nums w-7">
            {Math.round(volume * 100)}%
          </span>
        </label>

        <span className="text-[10px] text-white/30">
          {canSlide ? "Drag the clip to pick where the song starts" : "The whole song is used"}
        </span>

        <div className="ml-auto flex items-center gap-3">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="text-[10px] text-white/60 hover:text-white transition disabled:opacity-40"
          >
            {busy ? "Uploading…" : "Replace"}
          </button>
          <button
            type="button"
            onClick={handleRemove}
            disabled={busy}
            className="text-[10px] text-red-400 hover:text-red-300 transition disabled:opacity-40"
          >
            Remove
          </button>
        </div>
      </div>

      {notice && <p className="mt-0.5 text-[10px] text-amber-400">{notice}</p>}
      {error && <p className="mt-0.5 text-[10px] text-red-400">{error}</p>}
      {expanded && (
        <p className="mt-0.5 text-[10px] text-white/30">
          Customers hear this by default and can still upload their own. Tick Render before saving
          to rebuild the preview with it.
        </p>
      )}
    </div>
  );
}

function Waveform({ peaks }: { peaks: number[] | null }) {
  if (!peaks) {
    return <div className="absolute inset-y-1/2 left-0 h-px w-full bg-emerald-300/40" />;
  }
  return (
    <svg
      className="absolute inset-0 h-full w-full text-emerald-300/70"
      viewBox={`0 0 ${peaks.length} 100`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {peaks.map((v, i) => {
        const h = Math.max(2, v * 78);
        return <rect key={i} x={i + 0.2} y={50 - h / 2} width={0.6} height={h} fill="currentColor" />;
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
    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M9 18V5l10-2v13" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="16" cy="16" r="3" />
    </svg>
  );
}
