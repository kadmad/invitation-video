import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";

export default function LoginCallbackPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { loginWithGoogle } = useAuthStore();
  const [error, setError] = useState("");
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    // Some in-app browsers (WhatsApp/Instagram webviews, Safari private
    // mode) restrict storage access unpredictably on first load and throw
    // on sessionStorage access — without this guard that crashes the whole
    // page to a blank screen (no error boundary would even see it, since
    // this runs synchronously before the promise chain below). Falling
    // back to "no stored state" just routes into the existing "invalid
    // sign-in response" error path instead.
    let returnTo = "/";
    let storedState: string | null = null;
    let acceptedTerms = false;
    try {
      returnTo = sessionStorage.getItem("google_oauth_return_to") || "/";
      storedState = sessionStorage.getItem("google_oauth_state");
      acceptedTerms = sessionStorage.getItem("google_oauth_accepted_terms") === "true";
      sessionStorage.removeItem("google_oauth_return_to");
      sessionStorage.removeItem("google_oauth_state");
      sessionStorage.removeItem("google_oauth_accepted_terms");
    } catch {
      /* storage blocked — fall through with the defaults above */
    }

    const errorParam = params.get("error");
    const code = params.get("code");
    const state = params.get("state");

    if (errorParam) {
      setError("Google sign-in was cancelled.");
      return;
    }
    if (!code || !state || state !== storedState) {
      setError("Invalid sign-in response. Please try again.");
      return;
    }

    const redirectUri = `${window.location.origin}/login-callback`;
    loginWithGoogle(code, redirectUri, acceptedTerms)
      .then(() => navigate(returnTo, { replace: true }))
      .catch((err: any) => {
        setError(err.response?.data?.detail || "Google sign-in failed. Please try again.");
      });
  }, [params, navigate, loginWithGoogle]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-4">
      {error ? (
        <div className="text-center">
          <p className="text-red-500 mb-4">{error}</p>
          <button onClick={() => navigate("/")} className="btn-brand px-6 py-2">
            Back home
          </button>
        </div>
      ) : (
        <p className="text-ink-muted">Signing you in...</p>
      )}
    </div>
  );
}
