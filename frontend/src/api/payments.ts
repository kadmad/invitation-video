import client from "./client";
import type { PaymentOrder, Order, Invoice } from "@/types";

export async function createOrder(
  templateId: string,
  fontId: string | null,
  fieldValues: Record<string, string>,
  textColorOverride?: Record<string, string>,
  blockOverrides?: Record<string, string>,
  blockFormatOverrides?: Record<string, any[]>,
  locationUrl?: string,
  isWatermarked?: boolean,
  musicKey?: string,
  musicStartSeconds?: number,
  phoneNumber?: string
) {
  const body: Record<string, unknown> = {
    template_id: templateId,
    field_values: fieldValues,
  };
  if (fontId) body.font_id = fontId;
  if (textColorOverride) body.text_color_override = textColorOverride;
  if (blockOverrides) body.block_overrides = blockOverrides;
  if (blockFormatOverrides) body.block_format_overrides = blockFormatOverrides;
  if (locationUrl) body.location_url = locationUrl;
  if (isWatermarked) body.is_watermarked = true;
  if (musicKey) {
    body.music_key = musicKey;
    body.music_start_seconds = musicStartSeconds ?? 0;
  }
  if (phoneNumber) body.phone_number = phoneNumber;
  const { data } = await client.post<PaymentOrder>("/payments/create-order", body);
  return data;
}

export async function verifyPayment(
  paymentId: string,
  razorpayOrderId: string,
  razorpayPaymentId: string,
  razorpaySignature: string
) {
  const { data } = await client.post<{ render_job_id: string; status: string }>(
    "/payments/verify",
    {
      payment_id: paymentId,
      razorpay_order_id: razorpayOrderId,
      razorpay_payment_id: razorpayPaymentId,
      razorpay_signature: razorpaySignature,
    }
  );
  return data;
}

export async function adminRender(
  templateId: string,
  fontId: string | null,
  fieldValues: Record<string, string>,
  textColorOverride?: Record<string, string>,
  blockOverrides?: Record<string, string>,
  blockFormatOverrides?: Record<string, any[]>,
  locationUrl?: string,
  skipRender?: boolean,
  musicKey?: string,
  musicStartSeconds?: number
) {
  const body: Record<string, unknown> = {
    template_id: templateId,
    field_values: fieldValues,
  };
  if (fontId) body.font_id = fontId;
  if (textColorOverride) body.text_color_override = textColorOverride;
  if (blockOverrides) body.block_overrides = blockOverrides;
  if (blockFormatOverrides) body.block_format_overrides = blockFormatOverrides;
  if (locationUrl) body.location_url = locationUrl;
  if (skipRender) body.skip_render = true;
  if (musicKey) {
    body.music_key = musicKey;
    body.music_start_seconds = musicStartSeconds ?? 0;
  }
  const { data } = await client.post<{ render_job_id: string; status: string }>(
    "/payments/admin-render",
    body
  );
  return data;
}

export async function listOrders() {
  const { data } = await client.get<Order[]>("/payments/orders");
  return data;
}

export async function getInvoice(paymentId: string) {
  const { data } = await client.get<Invoice>(`/payments/orders/${paymentId}/invoice`);
  return data;
}
