import type { Template } from "@/types";

// Placeholder cards used wherever a template section needs to show its
// layout/style before (or without) real backend data — no thumbnail/video
// keys, so they render as plain named placeholders rather than broken
// images. Swapped out for real data the moment the real fetch resolves.
export const DUMMY_TEMPLATES: Template[] = [
  "Wedding Elegance",
  "Engagement Bliss",
  "Birthday Sparkle",
  "Housewarming Joy",
].map((name, i) => ({
  id: `dummy-${i}`,
  name,
  slug: `dummy-${i}`,
  category_id: "",
  thumbnail_key: null,
  video_key: null,
  preview_key: null,
  preview_status: null,
  duration_frames: 300,
  fps: 30,
  width: 1080,
  height: 1920,
  remotion_comp: null,
  created_at: new Date().toISOString(),
  text_blocks: [],
  image_blocks: [],
  is_published: true,
  tag_labels: null,
  default_text_color: "#000000",
  default_font_id: null,
  render_notes: null,
  seo_description: null,
  price: 0,
  discount_amount_paise: null,
  watermark_position_x: null,
  watermark_position_y: null,
  watermark_width: null,
  watermark_rotation: null,
}));
