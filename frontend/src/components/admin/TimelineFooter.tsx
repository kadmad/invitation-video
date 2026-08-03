import { useRef, useState, useCallback, useMemo, useEffect } from "react";
import { useParams } from "react-router-dom";
import type { PlayerRef } from "@remotion/player";
import { useAdminTemplateStore } from "@/store/adminTemplateStore";
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
}

export default function TimelineFooter({ playerRef }: TimelineFooterProps) {
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
  const isDraggingScrubber = useRef(false);
  const dragEdge = useRef<{ blockId: string; edge: "start" | "end" } | null>(null);
  const [playing, setPlaying] = useState(false);

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
    if ((e.target as HTMLElement).closest("[data-block-marker]")) return;
    isDraggingScrubber.current = true;
    playerRef.current?.pause();
    seekToTime(xToTime(e.clientX));

    const handleMouseMove = (ev: MouseEvent) => seekToTime(xToTime(ev.clientX));
    const handleMouseUp = () => {
      isDraggingScrubber.current = false;
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
    useAdminTemplateStore.temporal.getState().pause();

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
      useAdminTemplateStore.temporal.getState().resume();
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  // --- Whole-block drag (move start+end keeping duration) ---
  const handleBlockDragStart = (e: React.MouseEvent, blockId: string) => {
    e.stopPropagation();
    const block = blocks.find((b) => b.id === blockId);
    if (!block) return;

    const shiftKey = e.shiftKey;
    const duration = block.end_time - block.start_time;
    const startX = e.clientX;
    const origStart = block.start_time;
    let moved = false;

    const handleMouseMove = (ev: MouseEvent) => {
      const deltaTime = xToTime(ev.clientX) - xToTime(startX);
      if (!moved && Math.abs(deltaTime) > 0.05) {
        moved = true;
        playerRef.current?.pause();
        useAdminTemplateStore.temporal.getState().pause();
      }
      if (!moved) return;
      let newStart = Math.round((origStart + deltaTime) * 10) / 10;
      newStart = Math.max(0, Math.min(totalSeconds - duration, newStart));
      const newEnd = Math.round((newStart + duration) * 10) / 10;
      updateBlock(blockId, { start_time: newStart, end_time: newEnd });
      seekToTime(newStart);
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
      useAdminTemplateStore.temporal.getState().resume();
      // Persist after drag
      if (templateId) {
        const updatedBlock = blocks.find((b) => b.id === blockId);
        if (updatedBlock) {
          try {
            await updateTextBlock(templateId, blockId, {
              start_time: updatedBlock.start_time,
              end_time: updatedBlock.end_time,
            });
            clearAdminDraft(templateId);
          } catch (err) { console.error("Failed to persist timing", err); }
        }
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

  const LANE_HEIGHT = 24;
  const LANE_GAP = 2;

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

      {/* Block lanes + scrubber */}
      <div
        ref={timelineRef}
        className="relative mx-4 mb-2 cursor-pointer"
        style={{ height: laneCount * (LANE_HEIGHT + LANE_GAP) + 12 }}
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
          const label = ("content" in b ? b.content : "").replace(/\{(\w+)\}/g, (_, t) => t).slice(0, 30);

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

        {/* Scrubber track */}
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/10 rounded-full">
          <div className="h-full bg-primary-500 rounded-full transition-[width]" style={{ width: `${progressPct}%` }} />
        </div>

        {/* Playhead line */}
        <div
          className="absolute top-0 bottom-0 w-px bg-red-500 z-20 pointer-events-none"
          style={{ left: `${progressPct}%` }}
        >
          <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-red-500 rounded-full shadow" />
        </div>
      </div>
    </div>
  );
}
