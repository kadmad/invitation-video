import { API_URL } from "@/api/client";
import type { Template } from "@/types";

interface Props {
  template: Template;
  onClose: () => void;
}

/** Static single-frame preview of exactly where/how big the brand watermark
 * will appear on a discounted render — the template's thumbnail image plus
 * the logo composited at the admin-configured position/size/rotation/opacity,
 * same numbers used by the real render (WatermarkOverlay.tsx). Deliberately
 * a static image, not the live video player, so it can't be confused with
 * or camouflaged by the always-on anti-scrape watermark on the live preview. */
export default function WatermarkPreviewPopup({ template, onClose }: Props) {
  const posX = template.watermark_position_x ?? 0.39;
  const posY = template.watermark_position_y ?? 0.88;
  const width = template.watermark_width ?? 0.22;
  const rotation = template.watermark_rotation ?? 0;
  const opacity = template.watermark_opacity ?? 0.85;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-surface rounded-2xl shadow-2xl w-full max-w-xs p-5">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-ink-muted hover:text-ink transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <h3 className="text-base font-bold text-ink mb-3 pr-6">Watermark preview</h3>

        <div
          className="relative mx-auto rounded-xl overflow-hidden bg-slate-900"
          style={{ aspectRatio: `${template.width} / ${template.height}`, maxWidth: 220 }}
        >
          {template.thumbnail_key && (
            <img
              src={`${API_URL}/templates/${template.slug}/thumbnail`}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
            />
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
        </div>

        <p className="text-xs text-ink-muted text-center mt-3">
          This is exactly where the brand mark will appear on your video
        </p>
      </div>
    </div>
  );
}
