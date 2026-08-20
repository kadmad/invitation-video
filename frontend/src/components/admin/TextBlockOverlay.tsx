import { useRef, useCallback, useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import Moveable from "react-moveable";
import { useAdminTemplateStore, beginTemporalGesture, endTemporalGesture } from "@/store/adminTemplateStore";
import { updateTextBlock } from "@/api/admin";
import type { TextBlock } from "@/types";

interface Props {
  block: TextBlock;
  selected: boolean;
  isPrimary?: boolean;
  containerWidth: number;
  containerHeight: number;
  fontFamily?: string;
  tagValues?: Record<string, string>;
}

export default function TextBlockOverlay({
  block,
  selected,
  isPrimary = false,
  containerWidth,
  containerHeight,
  fontFamily,
  tagValues = {},
}: Props) {
  const { id: templateId } = useParams<{ id: string }>();
  const { selectBlock, selectBlockMulti, makePrimary, updateBlock } = useAdminTemplateStore();
  const targetRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [measuredHeight, setMeasuredHeight] = useState<number | null>(null);

  // Force re-render after ref mounts so Moveable can find target
  useEffect(() => {
    if (selected && isPrimary && targetRef.current && !mounted) {
      setMounted(true);
    }
    if (!selected || !isPrimary) setMounted(false);
  }, [selected, isPrimary, mounted]);

  // Expand tags for display text
  const displayText = block.content.replace(/\{(\w+)\}/g, (_, tag) => {
    return tagValues[tag] ?? tag;
  });

  // Match Remotion: fontSize = font_size_ratio * videoHeight (containerHeight here)
  const fontSize = (block.font_size_ratio ?? 0.04) * containerHeight;
  // Match Remotion lineHeight: 1.5 for Indic scripts, 1.2 for others
  const needsExtraPadding = /[\u0A80-\u0AFF\u0900-\u097F]/.test(displayText) || (fontFamily && fontFamily !== "sans-serif");
  const lineHeight = needsExtraPadding ? 1.5 : 1.2;

  // Measure text height
  useEffect(() => {
    if (textRef.current) {
      setMeasuredHeight(textRef.current.scrollHeight);
    }
  }, [displayText, fontSize, fontFamily, block.max_width, containerWidth, block.text_align]);

  const boxWidth = block.max_width * containerWidth;
  const extraPad = needsExtraPadding ? fontSize * 0.25 : 0;
  const boxHeight = measuredHeight ?? Math.max(24, fontSize * lineHeight);
  const rawLeft = block.position_x * containerWidth;
  const boxLeft =
    block.text_align === "center"
      ? rawLeft - boxWidth / 2
      : block.text_align === "right"
        ? rawLeft - boxWidth
        : rawLeft;
  const boxTop = block.position_y * containerHeight - extraPad;

  const label = block.content.replace(/\{(\w+)\}/g, (_, t) => t).slice(0, 40);

  // Persist position for one or all selected blocks
  const persist = useCallback(async () => {
    if (!templateId) return;
    const store = useAdminTemplateStore.getState();
    const ids = store.selectedBlockIds.length > 1 ? store.selectedBlockIds : [block.id];
    const blocks = store.template?.text_blocks ?? [];
    await Promise.all(
      ids.map(async (bid) => {
        const updated = blocks.find((b) => b.id === bid);
        if (!updated) return;
        try {
          await updateTextBlock(templateId, bid, {
            position_x: updated.position_x,
            position_y: updated.position_y,
            max_width: updated.max_width,
            font_size_ratio: updated.font_size_ratio,
            rotation: updated.rotation,
          });
        } catch (err) {
          console.error("Failed to save block position", err);
        }
      })
    );
  }, [templateId, block.id]);

  // Alignment helpers
  const alignBlock = useCallback((axis: "left" | "center" | "right" | "vcenter") => {
    let updates: Partial<TextBlock> = {};
    switch (axis) {
      case "left":
        updates.position_x = block.text_align === "center"
          ? block.max_width / 2
          : block.text_align === "right"
            ? block.max_width
            : 0;
        break;
      case "center":
        updates.position_x = block.text_align === "center"
          ? 0.5
          : block.text_align === "right"
            ? 1 - block.max_width / 2
            : block.max_width / 2;
        // For center alignment, always set position_x to 0.5
        updates.position_x = 0.5;
        break;
      case "right":
        updates.position_x = block.text_align === "center"
          ? 1 - block.max_width / 2
          : block.text_align === "right"
            ? 1
            : 1 - block.max_width;
        break;
      case "vcenter": {
        const halfHeight = boxHeight / containerHeight / 2;
        updates.position_y = 0.5 - halfHeight;
        break;
      }
    }
    updateBlock(block.id, updates);
    // Persist after alignment
    setTimeout(() => {
      if (!templateId) return;
      const store = useAdminTemplateStore.getState();
      const b = store.template?.text_blocks?.find((x) => x.id === block.id);
      if (b) {
        updateTextBlock(templateId, block.id, {
          position_x: b.position_x,
          position_y: b.position_y,
        }).catch(console.error);
      }
    }, 50);
  }, [block, boxHeight, containerHeight, containerWidth, templateId, updateBlock]);

  // Track original positions of all selected blocks at drag start
  const dragOriginsRef = useRef<Record<string, { posX: number; posY: number }>>({});

  return (
    <>
      {/* Target element with hidden text for measurement */}
      <div
        ref={targetRef}
        data-block-id={block.id}
        onMouseDown={(e) => {
          e.stopPropagation();
          const store = useAdminTemplateStore.getState();
          if (!e.shiftKey && store.selectedBlockIds.includes(block.id)) {
            if (store.selectedBlockIds[0] !== block.id) makePrimary(block.id);
            return;
          }
          selectBlockMulti(block.id, e.shiftKey);
        }}
        style={{
          position: "absolute",
          left: boxLeft,
          top: boxTop,
          width: boxWidth,
          pointerEvents: "auto",
          transform: block.rotation ? `rotate(${block.rotation}deg)` : undefined,
        }}
        className={selected ? "" : "group/block cursor-pointer"}
      >
        {/* Hidden text for measurement — matches Remotion render style */}
        <div
          ref={textRef}
          style={{
            fontSize,
            fontFamily: fontFamily || "sans-serif",
            lineHeight,
            textAlign: block.text_align as CanvasTextAlign,
            color: "transparent",
            wordBreak: "break-word",
            whiteSpace: "pre-wrap",
            pointerEvents: "none",
            userSelect: "none",
          }}
        >
          {displayText}
        </div>

        {/* Label tooltip above selected block */}
        {selected && (
          <div
            className="absolute bottom-full left-0 mb-1 px-1.5 py-0.5 rounded text-[10px] whitespace-nowrap pointer-events-none max-w-[220px] truncate"
            style={{
              color: "#c7d2fe",
              background: "rgba(0,0,0,0.65)",
              zIndex: 20,
            }}
          >
            {label}
          </div>
        )}

        {/* Alignment buttons — shown when selected */}
        {selected && isPrimary && (
          <div
            className="absolute top-full left-1/2 -translate-x-1/2 mt-1 flex items-center gap-0.5 bg-black/70 rounded px-1 py-0.5 z-30"
            onMouseDown={(e) => e.stopPropagation()}
          >
            {/* Align Left */}
            <button
              onClick={() => alignBlock("left")}
              className="p-1 text-white/60 hover:text-white transition rounded hover:bg-white/10"
              title="Align left"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" d="M3 4v16M7 8h10M7 12h14M7 16h8" />
              </svg>
            </button>
            {/* Align Center */}
            <button
              onClick={() => alignBlock("center")}
              className="p-1 text-white/60 hover:text-white transition rounded hover:bg-white/10"
              title="Align center"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" d="M12 4v16M5 8h14M3 12h18M7 16h10" />
              </svg>
            </button>
            {/* Align Right */}
            <button
              onClick={() => alignBlock("right")}
              className="p-1 text-white/60 hover:text-white transition rounded hover:bg-white/10"
              title="Align right"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" d="M21 4v16M7 8h10M3 12h14M9 16h8" />
              </svg>
            </button>
            {/* Vertical divider */}
            <div className="w-px h-3 bg-white/20 mx-0.5" />
            {/* Vertical Center */}
            <button
              onClick={() => alignBlock("vcenter")}
              className="p-1 text-white/60 hover:text-white transition rounded hover:bg-white/10"
              title="Vertical center"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" d="M4 12h16M12 5v4M12 15v4M9 7l3-3 3 3M9 17l3 3 3-3" />
              </svg>
            </button>
          </div>
        )}

        {/* Hover border for unselected */}
        {!selected && (
          <div className="absolute inset-0 border border-dashed border-transparent group-hover/block:border-white/50 rounded-sm transition-colors" />
        )}

        {/* Selection border for non-primary selected blocks (no Moveable handles) */}
        {selected && !isPrimary && (
          <div className="absolute inset-0 border-2 border-primary-400 rounded-sm pointer-events-none" />
        )}
      </div>

      {/* react-moveable — only for primary selected block (drag handle owner) */}
      {selected && isPrimary && targetRef.current && (
        <Moveable
          target={targetRef}
          draggable
          resizable
          rotatable
          throttleDrag={0}
          throttleResize={0}
          throttleRotate={0}
          keepRatio={false}
          renderDirections={["nw", "n", "ne", "w", "e", "sw", "s", "se"]}
          bounds={{
            left: 0,
            top: 0,
            right: containerWidth,
            bottom: containerHeight,
          }}
          onDragStart={() => {
            beginTemporalGesture();
            const store = useAdminTemplateStore.getState();
            const origins: Record<string, { posX: number; posY: number }> = {};
            const allBlocks = store.template?.text_blocks ?? [];
            for (const bid of store.selectedBlockIds) {
              const b = allBlocks.find((x) => x.id === bid);
              if (b) origins[bid] = { posX: b.position_x, posY: b.position_y };
            }
            dragOriginsRef.current = origins;
          }}
          onDrag={({ target, left, top }) => {
            target.style.left = `${left}px`;
            target.style.top = `${top}px`;
            const w = (target as HTMLElement).offsetWidth || 0;
            const posX =
              block.text_align === "center"
                ? (left + w / 2) / containerWidth
                : block.text_align === "right"
                  ? (left + w) / containerWidth
                  : left / containerWidth;
            const newPosX = Math.max(0, Math.min(1, posX));
            const newPosY = Math.max(0, Math.min(1, top / containerHeight));
            updateBlock(block.id, { position_x: newPosX, position_y: newPosY });

            // Move other selected blocks by same delta
            const origins = dragOriginsRef.current;
            const myOrigin = origins[block.id];
            if (myOrigin && Object.keys(origins).length > 1) {
              const deltaX = newPosX - myOrigin.posX;
              const deltaY = newPosY - myOrigin.posY;
              for (const [bid, orig] of Object.entries(origins)) {
                if (bid === block.id) continue;
                updateBlock(bid, {
                  position_x: Math.max(0, Math.min(1, orig.posX + deltaX)),
                  position_y: Math.max(0, Math.min(1, orig.posY + deltaY)),
                });
              }
            }
          }}
          onDragEnd={() => {
            endTemporalGesture();
            dragOriginsRef.current = {};
            persist();
          }}
          onResizeStart={() => {
            beginTemporalGesture();
          }}
          onResize={({ target, width, height, drag }) => {
            target.style.width = `${width}px`;
            target.style.height = `${height}px`;
            target.style.left = `${drag.left}px`;
            target.style.top = `${drag.top}px`;
            const posX =
              block.text_align === "center"
                ? (drag.left + width / 2) / containerWidth
                : block.text_align === "right"
                  ? (drag.left + width) / containerWidth
                  : drag.left / containerWidth;
            updateBlock(block.id, {
              position_x: Math.max(0, Math.min(1, posX)),
              position_y: Math.max(0, Math.min(1, drag.top / containerHeight)),
              max_width: Math.max(0.05, Math.min(1, width / containerWidth)),
              font_size_ratio: Math.max(0.01, height / containerHeight),
            });
          }}
          onResizeEnd={() => {
            endTemporalGesture();
            persist();
          }}
          onRotateStart={() => {
            beginTemporalGesture();
          }}
          onRotate={({ target, rotate }) => {
            target.style.transform = `rotate(${rotate}deg)`;
            updateBlock(block.id, { rotation: rotate });
          }}
          onRotateEnd={() => {
            endTemporalGesture();
            persist();
          }}
        />
      )}
    </>
  );
}
