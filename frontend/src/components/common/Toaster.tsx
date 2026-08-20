import { useToastStore, type ToastVariant } from "@/store/toastStore";

const VARIANT_STYLES: Record<ToastVariant, { wrap: string; icon: JSX.Element }> = {
  success: {
    wrap: "bg-accent-600 text-white",
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    ),
  },
  error: {
    wrap: "bg-red-600 text-white",
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0 3.75h.008M10.34 3.94l-8.4 14.55A1.5 1.5 0 003.24 21h17.52a1.5 1.5 0 001.3-2.51l-8.4-14.55a1.5 1.5 0 00-2.6 0z" />
    ),
  },
  info: {
    wrap: "bg-slate-800 text-white",
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25h.75v4.5h.75M12 8.25h.008M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    ),
  },
};

/**
 * Global toast outlet. Mounted once at the app root (outside <Routes>) so it
 * covers customer and admin screens alike, and survives route changes.
 *
 * Errors are announced assertively and successes politely, so screen readers
 * interrupt for failures but not for routine confirmations.
 */
export default function Toaster() {
  const { toasts, dismiss } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed top-4 right-4 z-[100] flex flex-col gap-2 w-[min(24rem,calc(100vw-2rem))] pointer-events-none"
      aria-live="polite"
    >
      {toasts.map((t) => {
        const v = VARIANT_STYLES[t.variant];
        return (
          <div
            key={t.id}
            role={t.variant === "error" ? "alert" : "status"}
            aria-live={t.variant === "error" ? "assertive" : "polite"}
            className={`pointer-events-auto flex items-start gap-2.5 rounded-xl shadow-lg px-4 py-3 text-sm animate-slide-down ${v.wrap}`}
          >
            <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              {v.icon}
            </svg>
            <span className="flex-1 leading-snug break-words">{t.message}</span>
            <button
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss notification"
              className="shrink-0 -mr-1 -mt-0.5 p-1 rounded hover:bg-white/20 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        );
      })}
    </div>
  );
}
