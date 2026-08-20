import { Img, staticFile } from "remotion";

interface WatermarkOverlayProps {
  positionX: number;
  positionY: number;
  width: number;
  rotation?: number;
  opacity?: number;
  videoWidth: number;
  videoHeight: number;
}

/** Burned-in brand mark for renders the user opted into in exchange for a
 * discount. Single placed logo (not the dense anti-scrape tile grid used on
 * the unpaid preview) at the position/size the admin configured for this
 * template. Style intentionally mirrors that preview watermark's silhouette
 * look so a watermarked render doesn't look like a different product. */
export default function WatermarkOverlay({
  positionX,
  positionY,
  width,
  rotation,
  opacity,
  videoWidth,
  videoHeight,
}: WatermarkOverlayProps) {
  const w = width * videoWidth;

  return (
    <Img
      src={staticFile("logo.png")}
      style={{
        position: "absolute",
        left: positionX * videoWidth,
        top: positionY * videoHeight,
        width: w,
        height: "auto",
        opacity: opacity ?? 0.85,
        // Natural logo colors + drop-shadow (not a blend-mode trick) so the
        // mark reads clearly against any background — this is a visible
        // brand attribution the customer traded a discount for, not the
        // anti-scrape tile watermark (which deliberately stays subtle).
        filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.45))",
        transform: rotation ? `rotate(${rotation}deg)` : undefined,
        pointerEvents: "none",
      }}
    />
  );
}
