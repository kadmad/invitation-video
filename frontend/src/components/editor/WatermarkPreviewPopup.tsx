import { API_URL } from "@/api/client";
import type { Template } from "@/types";

interface Props {
  template: Template;
}

/** Static single-frame preview of exactly where/how big the brand watermark
 * will appear on a discounted render — the template's thumbnail image plus
 * the logo composited at the admin-configured position/size/rotation/opacity,
 * same numbers used by the real render (WatermarkOverlay.tsx). Deliberately
 * a static image, not the live video player, so it can't be confused with
 * or camouflaged by the always-on anti-scrape watermark on the live preview.
 *
 * Renders inline (no overlay/backdrop of its own) right under the watermark
 * opt-in checkbox in the confirm dialog, filling the column so the frame
 * itself — not surrounding copy — carries the preview. */
export default function WatermarkPreviewPopup({ template }: Props) {
  const posX = template.watermark_position_x ?? 0.39;
  const posY = template.watermark_position_y ?? 0.88;
  const width = template.watermark_width ?? 0.22;
  const rotation = template.watermark_rotation ?? 0;
  const opacity = template.watermark_opacity ?? 0.85;

  return (
    <div
      className="relative w-full rounded-lg overflow-hidden bg-slate-900 mb-3"
      style={{ aspectRatio: `${template.width} / ${template.height}` }}
    >
      {template.thumbnail_key ? (
        <img
          src={`${API_URL}/templates/${template.slug}/thumbnail`}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 w-full h-full bg-slate-800" />
      )}
      <img
        src="/logo.png"
        alt=""
        draggable={false}
        style={{
          position: "absolute",
          left: `${posX * 100}%`,
          top: `${posY * 100}%`,
          width: `${width * 100}%`,
          height: "auto",
          opacity,
          filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.45))",
          transform: rotation ? `rotate(${rotation}deg)` : undefined,
        }}
      />
      <span className="absolute top-2 left-2 bg-black/60 text-white text-[10px] font-medium px-2 py-0.5 rounded-full">
        Watermark preview
      </span>
    </div>
  );
}
