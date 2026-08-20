import { create } from "zustand";

export type ToastVariant = "success" | "error" | "info";

export interface Toast {
  id: number;
  message: string;
  variant: ToastVariant;
  /** ms before auto-dismiss; 0 keeps it until dismissed manually. */
  duration: number;
}

interface ToastState {
  toasts: Toast[];
  push: (message: string, variant?: ToastVariant, duration?: number) => number;
  dismiss: (id: number) => void;
  clear: () => void;
}

let nextId = 1;

/** Errors linger longer than confirmations — a failure usually needs reading
 *  and acting on, while a success just needs acknowledging. */
const DEFAULT_DURATION: Record<ToastVariant, number> = {
  success: 3500,
  info: 4000,
  error: 8000,
};

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],

  push: (message, variant = "info", duration) => {
    const id = nextId++;
    const ms = duration ?? DEFAULT_DURATION[variant];
    set((s) => ({ toasts: [...s.toasts, { id, message, variant, duration: ms }] }));
    if (ms > 0) {
      setTimeout(() => get().dismiss(id), ms);
    }
    return id;
  },

  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  clear: () => set({ toasts: [] }),
}));

/**
 * Imperative helpers so non-React code (API catch blocks, event handlers) can
 * raise a toast without needing the hook.
 */
export const toast = {
  success: (m: string, duration?: number) => useToastStore.getState().push(m, "success", duration),
  error: (m: string, duration?: number) => useToastStore.getState().push(m, "error", duration),
  info: (m: string, duration?: number) => useToastStore.getState().push(m, "info", duration),
};

/**
 * Pulls a human-readable message out of whatever an API call threw. FastAPI
 * puts the useful text in `detail`; anything else falls back to a generic
 * line so the user never sees "[object Object]" or a raw stack.
 */
export function errorMessage(err: unknown, fallback = "Something went wrong. Please try again."): string {
  const anyErr = err as { response?: { data?: { detail?: unknown } }; message?: string };
  const detail = anyErr?.response?.data?.detail;
  if (typeof detail === "string" && detail.trim()) return detail;
  // Pydantic validation errors arrive as a list of {msg, loc} objects.
  if (Array.isArray(detail) && detail.length) {
    const first = detail[0] as { msg?: string };
    if (first?.msg) return first.msg;
  }
  if (typeof anyErr?.message === "string" && anyErr.message && !anyErr.message.startsWith("Request failed")) {
    return anyErr.message;
  }
  return fallback;
}
