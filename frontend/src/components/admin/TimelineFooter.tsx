import { useRef, useState, useCallback, useMemo, useEffect } from "react";
import { useParams } from "react-router-dom";
import type { PlayerRef } from "@remotion/player";
import { useAdminTemplateStore, beginTemporalGesture, endTemporalGesture } from "@/store/adminTemplateStore";
import { updateTextBlock } from "@/api/admin";
import { clearAdminDraft } from "@/lib/adminDraft";

/** Assign overlapping blocks to rows so none overlap visually */
function assignLanes(blocks: { id: string; start_time: number; end_time: number }[]): Map<string, number> {
  const sorted = [...blocks].sort((a, b) => a.start_time - b.start_time);
  const lanes = new Map<string, number>();
  const laneEnds: number[] = [];
  for (const b of sorted) {
    let placed = false;
    for (let i = 0; i < laneEnds.length; i++) {
      if (b.start_time >= laneEnds[i]) {
        laneEnds[i] = b.end_time;
        lanes.set(b.id, i);
        placed = true;
        break;
      }
    }
    if (!placed) {
      lanes.set(b.id, laneEnds.length);
      laneEnds.push(b.end_time);
    }
  }
  return lanes;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

interface TimelineFooterProps {
  playerRef: React.RefObject<PlayerRef | null>;
  pdfSnapshotTimestamps?: number[];
  onPdfSnapshotTimestampsChange?: (timestamps: number[]) => void;
}

export default function TimelineFooter({ playerRef, pdfSnapshotTimestamps, onPdfSnapshotTimestampsChange }: TimelineFooterProps) {
  const { id: templateId } = useParams<{ id: string }>();
  const {
    template,
    selectedBlockId,
    selectedBlockIds,
    currentTime: storeCurrentTime,
    setCurrentTime: storeSetCurrentTime,
    setPreviewEndFrame,
    selectBlock,
    selectBlockMulti,
    updateBlock,
  } = useAdminTemplateStore();

  const timelineRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isDraggingScrubber = useRef(false);
  const dragEdge = useRef<{ blockId: string; edge: "start" | "end" } | null>(null);
  const [playing, setPlaying] = useState(false);
  const [rubberBand, setRubberBand] = useState<{ startX: number; startY: number; currentX: number; currentY: number } | null>(null);

  const fps = template?.fps || 30;
  const totalFrames = template?.duration_frames || 300;
  const totalSeconds = totalFrames / fps;
  const currentFrame = Math.round(storeCurrentTime * fps);
  const progressPct = totalFrames > 1 ? (currentFrame / (totalFrames - 1)) * 100 : 0;

  const blocks = template?.text_blocks ?? [];
  const imageBlocks = template?.image_blocks ?? [];

  // Listen to player events
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => setPlaying(false);
    player.addEventListener("play", onPlay);
    player.addEventListener("pause", onPause);
    player.addEventListener("ended", onEnded);
    return () => {
      player.removeEventListener("play", onPlay);
      player.removeEventListener("pause", onPause);
      player.removeEventListener("ended", onEnded);
    };
  }, [playerRef.current]);

  const togglePlay = useCallback(() => {
    if (!playerRef.current) return;
    if (playing) {
      playerRef.current.pause();
    } else {
      setPreviewEndFrame(null); // clear block-preview stop
      playerRef.current.play();
    }
  }, [playing]);

  const xToTime = useCallback((clientX: number) => {
    if (!timelineRef.current) return 0;
    const rect = timelineRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return ratio * totalSeconds;
  }, [totalSeconds]);

  const seekToTime = useCallback((time: number) => {
    if (!playerRef.current) return;
    const f = Math.round(Math.max(0, Math.min(totalSeconds, time)) * fps);
    playerRef.current.seekTo(f);
    storeSetCurrentTime(f / fps);
  }, [totalSeconds, fps, storeSetCurrentTime]);

  const handleTimelineMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("[data-block-marker], [data-playhead-marker]")) return;
    if (!timelineRef.current) return;

    const rect = timelineRef.current.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    let moved = false;

    const scrollEl = scrollContainerRef.current;
    const scrollTopStart = scrollEl?.scrollTop ?? 0;

    const handleMouseMove = (ev: MouseEvent) => {
      const dx = Math.abs(ev.clientX - startX);
      const dy = Math.abs(ev.clientY - startY);
      if (!moved && (dx > 4 || dy > 4)) {
        moved = true;
      }
      if (moved) {
        const scrollOff = (scrollEl?.scrollTop ?? 0);
        setRubberBand({
          startX: startX - rect.left,
          startY: startY - rect.top + scrollTopStart,
          currentX: ev.clientX - rect.left,
          currentY: ev.clientY - rect.top + scrollOff,
        });
      }
    };

    const handleMouseUp = (ev: MouseEvent) => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);

      if (!moved) {
        // Simple click — seek to time
        playerRef.current?.pause();
        seekToTime(xToTime(ev.clientX));
        // Deselect blocks
        selectBlock(null);
        setRubberBand(null);
        return;
      }

      // Rubber band select — find all blocks within the rectangle
      if (timelineRef.current) {
        const r = timelineRef.current.getBoundingClientRect();
        const scrollOff = scrollEl?.scrollTop ?? 0;
        const x1 = Math.min(startX, ev.clientX) - r.left;
        const x2 = Math.max(startX, ev.clientX) - r.left;
        const y1 = Math.min(startY, ev.clientY) - r.top + Math.min(scrollTopStart, scrollOff);
        const y2 = Math.max(startY, ev.clientY) - r.top + Math.max(scrollTopStart, scrollOff);
        const width = r.width;

        const matched: string[] = [];
        for (const b of allTimelineBlocks) {
          if (b.type !== "text") continue;
          const lane = blockLanes.get(b.id) ?? 0;
          const bLeft = (b.start_time / totalSeconds) * width;
          const bRight = (b.end_time / totalSeconds) * width;
          const bTop = lane * (LANE_HEIGHT + LANE_GAP);
          const bBottom = bTop + LANE_HEIGHT;

          // Check overlap
          if (bRight >= x1 && bLeft <= x2 && bBottom >= y1 && bTop <= y2) {
            matched.push(b.id);
          }
        }

        if (matched.length > 0) {
          // Select first, then add rest
          selectBlock(matched[0]);
          for (let i = 1; i < matched.length; i++) {
            selectBlockMulti(matched[i], true);
          }
        } else {
          selectBlock(null);
        }
      }
      setRubberBand(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  // --- Playhead scrubbing (drag the red vertical bar) ---
  const isDraggingPlayhead = useRef(false);

  const handlePlayheadMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    isDraggingPlayhead.current = true;
    playerRef.current?.pause();

    const handleMouseMove = (ev: MouseEvent) => {
      if (!isDraggingPlayhead.current) return;
      seekToTime(xToTime(ev.clientX));
    };

    const handleMouseUp = () => {
      isDraggingPlayhead.current = false;
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  const handleEdgeDragStart = (e: React.MouseEvent, blockId: string, edge: "start" | "end") => {
    e.stopPropagation();
    e.preventDefault();
    dragEdge.current = { blockId, edge };
    playerRef.current?.pause();
    beginTemporalGesture();

    const handleMouseMove = (ev: MouseEvent) => {
      if (!dragEdge.current) return;
      const time = Math.round(xToTime(ev.clientX) * 10) / 10;
      const block = blocks.find((b) => b.id === dragEdge.current!.blockId);
      if (!block) return;

      if (dragEdge.current.edge === "start") {
        if (time >= 0 && time < block.end_time - 0.2) {
          updateBlock(block.id, { start_time: time });
        }
      } else {
        if (time > block.start_time + 0.2 && time <= totalSeconds) {
          updateBlock(block.id, { end_time: time });
        }
      }
      seekToTime(time);
    };

    const handleMouseUp = async () => {
      if (dragEdge.current && templateId) {
        const block = blocks.find((b) => b.id === dragEdge.current!.blockId);
        if (block) {
          try {
            await updateTextBlock(templateId, block.id, {
              start_time: block.start_time,
              end_time: block.end_time,
            });
            clearAdminDraft(templateId);
          } catch (err) { console.error("Failed to persist timing", err); }
        }
      }
      dragEdge.current = null;
      endTemporalGesture();
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  // --- Whole-block drag (move start+end keeping duration) ---
  // If dragged block is part of multi-selection, move all selected blocks together
  const handleBlockDragStart = (e: React.MouseEvent, blockId: string) => {
    e.stopPropagation();
    const block = blocks.find((b) => b.id === blockId);
    if (!block) return;

    const shiftKey = e.shiftKey;
    const isMultiSelected = selectedBlockIds.includes(blockId) && selectedBlockIds.length > 1;
    // Capture all blocks to drag: if multi-selected, move all; otherwise just this one
    const dragBlockIds = isMultiSelected ? [...selectedBlockIds] : [blockId];
    const origTimes = dragBlockIds.map((id) => {
      const b = blocks.find((bl) => bl.id === id);
      return { id, start: b?.start_time ?? 0, end: b?.end_time ?? 0, duration: (b?.end_time ?? 0) - (b?.start_time ?? 0) };
    });

    const startX = e.clientX;
    let moved = false;

    const handleMouseMove = (ev: MouseEvent) => {
      const deltaTime = xToTime(ev.clientX) - xToTime(startX);
      if (!moved && Math.abs(deltaTime) > 0.05) {
        moved = true;
        playerRef.current?.pause();
        beginTemporalGesture();
      }
      if (!moved) return;

      // Clamp delta so no block goes out of bounds
      let clampedDelta = deltaTime;
      for (const orig of origTimes) {
        const ns = orig.start + clampedDelta;
        if (ns < 0) clampedDelta = -orig.start;
        if (ns + orig.duration > totalSeconds) clampedDelta = totalSeconds - orig.start - orig.duration;
      }

      for (const orig of origTimes) {
        const newStart = Math.round((orig.start + clampedDelta) * 10) / 10;
        const newEnd = Math.round((newStart + orig.duration) * 10) / 10;
        updateBlock(orig.id, { start_time: newStart, end_time: newEnd });
      }
      seekToTime(Math.round((origTimes[0].start + clampedDelta) * 10) / 10);
    };

    const handleMouseUp = async () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      if (!moved) {
        // Was a click, not a drag — select (shift for multi-select) + seek
        selectBlockMulti(blockId, shiftKey);
        seekToTime(block.start_time);
        return;
      }
      endTemporalGesture();
      // Persist all dragged blocks
      if (templateId) {
        for (const orig of dragBlockIds) {
          const updatedBlock = blocks.find((b) => b.id === orig);
          if (updatedBlock) {
            try {
              await updateTextBlock(templateId, orig, {
                start_time: updatedBlock.start_time,
                end_time: updatedBlock.end_time,
              });
            } catch (err) { console.error("Failed to persist timing", err); }
          }
        }
        clearAdminDraft(templateId);
      }
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  // Lanes
  const allTimelineBlocks = useMemo(() => {
    const textItems = blocks.map((b) => ({ ...b, type: "text" as const }));
    const imgItems = imageBlocks.map((b) => ({ ...b, type: "image" as const, content: b.label }));
    return [...textItems, ...imgItems].sort((a, b) => a.start_time - b.start_time);
  }, [blocks, imageBlocks]);

  const blockLanes = useMemo(() => assignLanes(allTimelineBlocks), [allTimelineBlocks]);
  const laneCount = useMemo(() => {
    let max = 0;
    blockLanes.forEach((lane) => { if (lane + 1 > max) max = lane + 1; });
    return Math.max(1, max);
  }, [blockLanes]);

  // Time ruler ticks
  const ticks = useMemo(() => {
    const result: number[] = [];
    const step = totalSeconds <= 10 ? 1 : totalSeconds <= 30 ? 2 : totalSeconds <= 60 ? 5 : 10;
    for (let t = 0; t <= totalSeconds; t += step) result.push(t);
    return result;
  }, [totalSeconds]);

  // Preserve scroll position across re-renders (block selection changes etc.)
  const savedScrollTop = useRef(0);
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const onScroll = () => { savedScrollTop.current = el.scrollTop; };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (el && savedScrollTop.current > 0) {
      el.scrollTop = savedScrollTop.current;
    }
  });

  const LANE_HEIGHT = 24;
  const LANE_GAP = 2;
  const MAX_VISIBLE_LANES = 3;
  const fullLanesHeight = laneCount * (LANE_HEIGHT + LANE_GAP);
  const maxLanesHeight = MAX_VISIBLE_LANES * (LANE_HEIGHT + LANE_GAP);
  const capped = laneCount > MAX_VISIBLE_LANES;

  return (
    <div className="bg-slate-900 border-t border-slate-700 flex-shrink-0">
      {/* Controls row */}
      <div className="flex items-center gap-3 px-4 py-1.5 border-b border-white/10">
        <button onClick={togglePlay} className="w-7 h-7 flex items-center justify-center text-white/80 hover:text-white transition flex-shrink-0">
          {playing ? (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" /></svg>
          ) : (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
          )}
        </button>
        <span className="text-[10px] text-white/60 tabular-nums">
          {formatTime(storeCurrentTime)} / {formatTime(totalSeconds)}
        </span>
        {selectedBlockIds.length > 0 && (
          <button
            onClick={() => {
              if (!playerRef.current || !template || selectedBlockIds.length === 0) return;
              const block = blocks.find((b) => b.id === selectedBlockIds[0]);
              if (!block) return;
              setPreviewEndFrame(Math.round(block.end_time * fps));
              playerRef.current.seekTo(Math.round(block.start_time * fps));
              playerRef.current.play();
            }}
            className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 transition"
          >
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
            Preview Block
          </button>
        )}
        {capped && (
          <span className="text-[9px] text-white/30 ml-auto">{laneCount} lanes</span>
        )}
      </div>

      {/* Time ruler — aligned with lanes below via same mx-4 */}
      <div className="relative h-4 mx-4 mt-1">
        {ticks.map((t) => (
          <div
            key={t}
            className="absolute top-0 text-[8px] text-white/30 select-none"
            style={{ left: `${(t / totalSeconds) * 100}%`, transform: "translateX(-50%)" }}
          >
            {formatTime(t)}
          </div>
        ))}
      </div>

      {/* Scrollable lanes container */}
      <div
        ref={scrollContainerRef}
        className="mx-4 mb-1 overflow-y-auto timeline-scroll"
        style={{ maxHeight: maxLanesHeight + 12 }}
      >
        {/* Block lanes + scrubber */}
        <div
          ref={timelineRef}
          className="relative cursor-pointer"
          style={{ height: fullLanesHeight + 12 }}
          onMouseDown={handleTimelineMouseDown}
        >
          {/* Tick lines */}
          {ticks.map((t) => (
            <div
              key={t}
              className="absolute top-0 bottom-0 w-px bg-white/5"
              style={{ left: `${(t / totalSeconds) * 100}%` }}
            />
          ))}

          {/* Block markers in lanes */}
          {allTimelineBlocks.map((b) => {
            const lane = blockLanes.get(b.id) ?? 0;
            const leftPct = (b.start_time / totalSeconds) * 100;
            const widthPct = ((b.end_time - b.start_time) / totalSeconds) * 100;
            const isSelected = selectedBlockIds?.includes(b.id) ?? b.id === selectedBlockId;
            const isText = b.type === "text";
            const label = ("content" in b ? b.content : "").replace(/\{([^{}]+)\}/g, (_, t) => t.trim()).slice(0, 30);

            return (
              <div
                key={b.id}
                data-block-marker
                className={`absolute rounded-sm flex items-center overflow-hidden select-none group transition-colors ${
                  isSelected
                    ? "bg-primary-500/50 border border-primary-400 z-10"
                    : isText
                      ? "bg-white/15 border border-white/20 hover:bg-white/25"
                      : "bg-amber-500/20 border border-amber-500/40 hover:bg-amber-500/30"
                }`}
                onMouseDown={(e) => {
                  // Edge handles have their own onMouseDown with stopPropagation
                  if (isText) handleBlockDragStart(e, b.id);
                  else { selectBlock(b.id); seekToTime(b.start_time); }
                }}
                style={{
                  left: `${leftPct}%`,
                  width: `${Math.max(widthPct, 0.3)}%`,
                  top: lane * (LANE_HEIGHT + LANE_GAP),
                  height: LANE_HEIGHT,
                  cursor: isText ? "grab" : "pointer",
                }}
              >
                {/* Left edge handle */}
                {isText && (
                  <div
                    className="absolute left-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-primary-400/50 z-20"
                    onMouseDown={(e) => handleEdgeDragStart(e, b.id, "start")}
                  />
                )}

                {/* Type badge + label */}
                <span className={`text-[9px] px-2 truncate flex-1 pointer-events-none ${isText ? "text-white/70" : "text-amber-300/80"}`}>
                  {!isText && <span className="text-[7px] uppercase font-bold mr-1 opacity-60">IMG</span>}
                  {label}
                </span>

                {/* Time badge */}
                <span className="text-[7px] text-white/30 pr-1.5 pointer-events-none tabular-nums flex-shrink-0">
                  {b.start_time.toFixed(1)}-{b.end_time.toFixed(1)}
                </span>

                {/* Right edge handle */}
                {isText && (
                  <div
                    className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-primary-400/50 z-20"
                    onMouseDown={(e) => handleEdgeDragStart(e, b.id, "end")}
                  />
                )}
              </div>
            );
          })}

          {/* PDF Snapshot markers — draggable red triangles */}
          {pdfSnapshotTimestamps?.map((ts, idx) => {
            const pct = (ts / totalSeconds) * 100;
            return (
              <div
                key={`pdf-${idx}`}
                className="absolute z-30 cursor-grab group/snap"
                style={{ left: `${pct}%`, top: 0, bottom: 0 }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  if (e.button === 2) return;
                  playerRef.current?.pause();
                  const handleMove = (ev: MouseEvent) => {
                    const newTime = Math.round(xToTime(ev.clientX) * 10) / 10;
                    const clamped = Math.max(0, Math.min(totalSeconds, newTime));
                    const updated = [...(pdfSnapshotTimestamps || [])];
                    updated[idx] = clamped;
                    onPdfSnapshotTimestampsChange?.(updated.sort((a, b) => a - b));
                    seekToTime(clamped);
                  };
                  const handleUp = () => {
                    window.removeEventListener("mousemove", handleMove);
                    window.removeEventListener("mouseup", handleUp);
                  };
                  window.addEventListener("mousemove", handleMove);
                  window.addEventListener("mouseup", handleUp);
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  onPdfSnapshotTimestampsChange?.(
                    (pdfSnapshotTimestamps || []).filter((_, i) => i !== idx)
                  );
                }}
                title={`PDF page at ${ts}s — drag to move, double-click to remove`}
              >
                <div className="absolute top-0 bottom-0 w-px bg-orange-400 opacity-60 group-hover/snap:opacity-100" />
                <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-0 h-0"
                  style={{ borderLeft: "5px solid transparent", borderRight: "5px solid transparent", borderTop: "6px solid #fb923c" }}
                />
                <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 text-[7px] text-orange-400 font-medium whitespace-nowrap opacity-0 group-hover/snap:opacity-100 transition-opacity">
                  {ts}s
                </div>
              </div>
            );
          })}

          {/* Playhead line — wider invisible hit-area (12px) so it's draggable without pixel-perfect aim */}
          <div
            data-playhead-marker
            className="absolute top-0 bottom-0 z-40 cursor-ew-resize"
            style={{ left: `${progressPct}%`, width: 12, marginLeft: -6 }}
            onMouseDown={handlePlayheadMouseDown}
          >
            <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-px bg-red-500 pointer-events-none" />
            <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-red-500 rounded-full shadow pointer-events-none" />
          </div>

          {/* Rubber band selection rectangle */}
          {rubberBand && (() => {
            const x = Math.min(rubberBand.startX, rubberBand.currentX);
            const y = Math.min(rubberBand.startY, rubberBand.currentY);
            const w = Math.abs(rubberBand.currentX - rubberBand.startX);
            const h = Math.abs(rubberBand.currentY - rubberBand.startY);
            return (
              <div
                className="absolute pointer-events-none z-30"
                style={{
                  left: x,
                  top: y,
                  width: w,
                  height: h,
                  border: "1px solid rgba(99, 102, 241, 0.8)",
                  backgroundColor: "rgba(99, 102, 241, 0.15)",
                  borderRadius: 2,
                }}
              />
            );
          })()}
        </div>
      </div>

      {/* Scrubber track — always visible outside scroll */}
      <div className="mx-4 mb-2 h-1 bg-white/10 rounded-full relative cursor-pointer"
        onMouseDown={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
          seekToTime(ratio * totalSeconds);
        }}
      >
        <div className="h-full bg-primary-500 rounded-full" style={{ width: `${progressPct}%` }} />
      </div>
    </div>
  );
}
