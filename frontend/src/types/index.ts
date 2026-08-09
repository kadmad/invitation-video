export interface User {
  id: string;
  email: string | null;
  phone_number: string | null;
  full_name: string;
  is_active: boolean;
  is_admin: boolean;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
}

export interface Font {
  id: string;
  name: string;
  family_name: string;
  language: string;
  weight: string;
  style: string;
  preview_text: string | null;
}

export interface TemplateField {
  id: string;
  field_key: string;
  label: string;
  placeholder: string | null;
  field_type: string;
  is_required: boolean;
  sort_order: number;
  position_x: number;
  position_y: number;
  max_width: number;
  font_size_ratio: number;
  text_align: string;
  text_color: string;
  animation_type: string;
  appear_frame: number;
  duration_frames: number;
}

export interface FormatRange {
  start: number;
  end: number;
  bold?: boolean;
  italic?: boolean;
  color?: string;
  stroke_color?: string;
  stroke_width?: number;
}

export interface TextBlock {
  id: string;
  sort_order: number;
  content: string;
  position_x: number;
  position_y: number;
  max_width: number;
  font_id: string | null;
  font_size_ratio: number;
  text_color: string;
  text_align: string;
  animation_type: string;
  animation_out: string;
  anim_in_direction: string;
  anim_out_direction: string;
  anim_in_duration: number;
  anim_out_duration: number;
  start_time: number;
  end_time: number;
  tag_config: Record<string, { label?: string; placeholder?: string; min_chars?: number; max_chars?: number }> | null;
  format_ranges: FormatRange[] | null;
}

export interface ImageBlock {
  id: string;
  sort_order: number;
  label: string;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
  mask_shape: string;
  mask_feather: number;
  frame_image_key: string | null;
  ken_burns_enabled: boolean;
  ken_burns_zoom: number;
  ken_burns_direction: string;
  opacity: number;
  animation_type: string;
  start_time: number;
  end_time: number;
  placeholder_key: string | null;
  is_user_uploadable: boolean;
}

export interface Template {
  id: string;
  name: string;
  slug: string;
  category_id: string;
  thumbnail_key: string | null;
  video_key: string | null;
  preview_key: string | null;
  preview_status?: string | null;
  duration_frames: number;
  fps: number;
  width: number;
  height: number;
  remotion_comp: string | null;
  created_at: string;
  text_blocks: TextBlock[];
  image_blocks: ImageBlock[];
  is_published: boolean;
  tag_labels: Record<string, string> | null;
  default_text_color: string;
  default_font_id: string | null;
  render_notes: string | null;
  price: number;
}

export interface RenderJob {
  id: string;
  template_id: string;
  font_id: string | null;
  status: "pending" | "processing" | "completed" | "failed";
  field_values: Record<string, string>;
  text_color_override: Record<string, string> | null;
  progress: number;
  output_key: string | null;
  error_message: string | null;
  render_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminStats {
  templates: number;
  categories: number;
  users: number;
  renders: number;
}

export interface PaymentOrder {
  razorpay_order_id: string;
  amount: number;
  currency: string;
  key_id: string;
  payment_id: string;
}

export interface OrderRenderSummary {
  id: string;
  status: "pending" | "processing" | "completed" | "failed";
  progress: number;
  output_key: string | null;
}

export interface Order {
  id: string;
  order_number: string;
  razorpay_order_id: string;
  amount: number;
  currency: string;
  status: string;
  created_at: string;
  template_name: string;
  render: OrderRenderSummary | null;
  field_values: Record<string, string>;
}

export interface Invoice {
  order_number: string;
  date: string;
  user_name: string;
  user_email: string;
  template_name: string;
  field_values: Record<string, string>;
  amount: number;
  currency: string;
  razorpay_payment_id: string | null;
  status: string;
}

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => {
      open(): void;
      on(event: string, callback: () => void): void;
    };
  }
}
