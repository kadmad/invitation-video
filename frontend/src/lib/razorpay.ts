const SCRIPT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

let loadPromise: Promise<void> | null = null;

/**
 * Loads the Razorpay checkout SDK on demand, right before it's needed.
 *
 * It used to sit as a `<script defer>` in index.html, loaded unconditionally
 * on every page. That SDK self-initialises on load and fires several of its
 * own network requests (checkout config, a risk-detection bundle) — all paid
 * for by every anonymous landing-page visitor, even though `window.Razorpay`
 * is only ever constructed once, at the moment someone actually clicks pay
 * inside the editor. Cached so repeat calls (retrying a failed payment)
 * don't re-fetch or re-append the script.
 */
export function loadRazorpayCheckout(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.onload = () => resolve();
    script.onerror = () => {
      loadPromise = null;
      reject(new Error("Failed to load payment SDK"));
    };
    document.body.appendChild(script);
  });

  return loadPromise;
}
