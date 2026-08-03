import { useRef, useCallback, useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import Moveable from "react-moveable";
import { useAdminTemplateStore } from "@/store/adminTemplateStore";
import { updateTextBlock } from "@/api/admin";
import type { TextBlock } from "@/types";

interface Props {
  block: TextBlock;
  selected: boolean;
  isPrimary?: boolean;
  containerWidth: number;
  containerHeight: number;
}

export default function TextBlockOverlay({
  block,
  selected,
  isPrimary = false,
  containerWidth,
  containerHeight,
}: Props) {
  const { id: templateId } = useParams<{ id: string }>();
  const { selectBlock, selectBlockMulti, makePrimary, updateBlock } = useAdminTemplateStore();
  const targetRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  // Force re-render after ref mounts so Moveable can find target
  useEffect(() => {
    if (selected && isPrimary && targetRef.current && !mounted) {
      setMounted(true);
    }
    if (!selected || !isPrimary) setMounted(false);
  }, [selected, isPrimary, mounted]);

  const boxWidth = block.max_width * containerWidth;
  const boxHeight = Math.max(24, (block.font_size_ratio ?? 0.04) * containerWidth * 1.6);
  const rawLeft = block.position_x * containerWidth;
  const boxLeft =
    block.text_align === "center"
      ? rawLeft - boxWidth / 2
      : block.text_align === "right"
        ? rawLeft - boxWidth
        : rawLeft;
  const boxTop = block.position_y * containerHeight;

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
          });
        } catch (err) {
          console.error("Failed to save block position", err);
        }
      })
    );
  }, [templateId, block.id]);

  // Track original positions of all selected blocks at drag start
  const dragOriginsRef = useRef<Record<string, { posX: number; posY: number }>>({});

  return (
    <>
      {/* Target element */}
      <div
        ref={targetRef}
        data-block-id={block.id}
        onMouseDown={(e) => {
          e.stopPropagation();
          const store = useAdminTemplateStore.getState();
          if (!e.shiftKey && store.selectedBlockIds.includes(block.id)) {
            // Already selected — make primary so Moveable handles appear here
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
          height: boxHeight,
          pointerEvents: "auto",
        }}
        className={selected ? "" : "group/block cursor-pointer"}
      >
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
          throttleDrag={0}
          throttleResize={0}
          keepRatio={false}
          renderDirections={["nw", "n", "ne", "w", "e", "sw", "s", "se"]}
          bounds={{
            left: 0,
            top: 0,
            right: containerWidth,
            bottom: containerHeight,
          }}
          onDragStart={() => {
            useAdminTemplateStore.temporal.getState().pause();
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
            const w = target.offsetWidth;
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
            useAdminTemplateStore.temporal.getState().resume();
            dragOriginsRef.current = {};
            persist();
          }}
          onResizeStart={() => {
            useAdminTemplateStore.temporal.getState().pause();
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
              font_size_ratio: Math.max(0.01, height / (containerWidth * 1.6)),
            });
          }}
          onResizeEnd={() => {
            useAdminTemplateStore.temporal.getState().resume();
            persist();
          }}
        />
      )}
    </>
  );
}
