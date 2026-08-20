import { useEffect, useRef, useState } from "react";
import Moveable from "react-moveable";

interface Props {
  x: number;
  y: number;
  width: number;
  rotation: number;
  opacity: number;
  containerWidth: number;
  containerHeight: number;
  onChange: (x: number, y: number, width: number, rotation: number) => void;
  /** When false the mark is drawn for reference but not interactive. */
  editable?: boolean;
}

/** Draggable/resizable placement box for the paid-render watermark, shown
 * only while the admin is actively editing it. Width-only resize (drag the
 * side handles) since the actual burned-in logo always keeps its native
 * aspect ratio — height just follows. Mirrors ImageBlockOverlay's Moveable
 * pattern but writes into plain local state instead of a DB-backed block. */
export default function WatermarkPlacementOverlay({
  x,
  y,
  width,
  rotation,
  opacity,
  containerWidth,
  containerHeight,
  onChange,
  editable = true,
}: Props) {
  const targetRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const boxLeft = x * containerWidth;
  const boxTop = y * containerHeight;
  const boxWidth = width * containerWidth;

  return (
    <>
      <div
        ref={targetRef}
        style={{
          position: "absolute",
          left: boxLeft,
          top: boxTop,
          width: boxWidth,
          pointerEvents: editable ? "auto" : "none",
          transform: rotation ? `rotate(${rotation}deg)` : undefined,
        }}
      >
        <img
          src="/logo.png"
          alt=""
          draggable={false}
          style={{
            width: "100%",
            height: "auto",
            opacity,
            filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.45))",
            userSelect: "none",
          }}
        />
        {editable && <div className="absolute inset-0 border-2 border-dashed border-amber-400/70 pointer-events-none rounded-sm" />}
        {editable && (
          <div
            className="absolute bottom-full left-0 mb-1 px-1.5 py-0.5 rounded text-[10px] whitespace-nowrap pointer-events-none"
            style={{ color: "#fbbf24", background: "rgba(0,0,0,0.65)" }}
          >
            Watermark placement
          </div>
        )}
      </div>

      {editable && mounted && targetRef.current && (
        <Moveable
          target={targetRef}
          draggable
          resizable
          rotatable
          throttleDrag={0}
          throttleResize={0}
          throttleRotate={0}
          keepRatio={false}
          renderDirections={["w", "e"]}
          bounds={{ left: 0, top: 0, right: containerWidth, bottom: containerHeight }}
          onDrag={({ target, left, top }) => {
            target.style.left = `${left}px`;
            target.style.top = `${top}px`;
            onChange(
              Math.max(0, Math.min(1, left / containerWidth)),
              Math.max(0, Math.min(1, top / containerHeight)),
              width,
              rotation
            );
          }}
          onResize={({ target, width: newWidth, drag }) => {
            target.style.width = `${newWidth}px`;
            target.style.left = `${drag.left}px`;
            target.style.top = `${drag.top}px`;
            onChange(
              Math.max(0, Math.min(1, drag.left / containerWidth)),
              Math.max(0, Math.min(1, drag.top / containerHeight)),
              Math.max(0.05, Math.min(0.3, newWidth / containerWidth)),
              rotation
            );
          }}
          onRotate={({ target, rotate }) => {
            target.style.transform = `rotate(${rotate}deg)`;
            onChange(x, y, width, rotate);
          }}
        />
      )}
    </>
  );
}
