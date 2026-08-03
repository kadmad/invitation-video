import { useRef, useCallback, useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import Moveable from "react-moveable";
import { useAdminTemplateStore } from "@/store/adminTemplateStore";
import { updateImageBlock } from "@/api/admin";
import type { ImageBlock } from "@/types";

interface Props {
  block: ImageBlock;
  selected: boolean;
  containerWidth: number;
  containerHeight: number;
}

export default function ImageBlockOverlay({
  block,
  selected,
  containerWidth,
  containerHeight,
}: Props) {
  const { id: templateId } = useParams<{ id: string }>();
  const { selectImageBlock, updateImageBlock: updateStore } = useAdminTemplateStore();
  const targetRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (selected && targetRef.current && !mounted) setMounted(true);
    if (!selected) setMounted(false);
  }, [selected, mounted]);

  const boxWidth = block.width * containerWidth;
  const boxHeight = block.height * containerHeight;
  const boxLeft = block.position_x * containerWidth;
  const boxTop = block.position_y * containerHeight;

  const persist = useCallback(async () => {
    if (!templateId) return;
    const store = useAdminTemplateStore.getState();
    const updated = store.template?.image_blocks.find((b) => b.id === block.id);
    if (!updated) return;
    try {
      await updateImageBlock(templateId, block.id, {
        position_x: updated.position_x,
        position_y: updated.position_y,
        width: updated.width,
        height: updated.height,
      });
    } catch (err) {
      console.error("Failed to save image block position", err);
    }
  }, [templateId, block.id]);

  return (
    <>
      <div
        ref={targetRef}
        data-block-id={block.id}
        onMouseDown={(e) => {
          e.stopPropagation();
          selectImageBlock(block.id);
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
        {/* Label tooltip */}
        {selected && (
          <div
            className="absolute bottom-full left-0 mb-1 px-1.5 py-0.5 rounded text-[10px] whitespace-nowrap pointer-events-none max-w-[220px] truncate"
            style={{
              color: "#fbbf24",
              background: "rgba(0,0,0,0.65)",
              zIndex: 20,
            }}
          >
            {block.label} ({block.mask_shape})
          </div>
        )}

        {/* Hover border for unselected */}
        {!selected && (
          <div className="absolute inset-0 border border-dashed border-transparent group-hover/block:border-amber-400/50 rounded-sm transition-colors" />
        )}

        {/* Shape preview indicator */}
        {selected && (
          <div
            className="absolute inset-0 border-2 border-amber-400/60 rounded-sm pointer-events-none"
            style={{ borderStyle: "dashed" }}
          />
        )}
      </div>

      {/* react-moveable for selected block */}
      {selected && targetRef.current && (
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
          onDrag={({ target, left, top }) => {
            target.style.left = `${left}px`;
            target.style.top = `${top}px`;
            updateStore(block.id, {
              position_x: Math.max(0, Math.min(1, left / containerWidth)),
              position_y: Math.max(0, Math.min(1, top / containerHeight)),
            });
          }}
          onDragEnd={() => {
            persist();
          }}
          onResize={({ target, width, height, drag }) => {
            target.style.width = `${width}px`;
            target.style.height = `${height}px`;
            target.style.left = `${drag.left}px`;
            target.style.top = `${drag.top}px`;
            updateStore(block.id, {
              position_x: Math.max(0, Math.min(1, drag.left / containerWidth)),
              position_y: Math.max(0, Math.min(1, drag.top / containerHeight)),
              width: Math.max(0.05, Math.min(1, width / containerWidth)),
              height: Math.max(0.05, Math.min(1, height / containerHeight)),
            });
          }}
          onResizeEnd={() => {
            persist();
          }}
        />
      )}
    </>
  );
}
