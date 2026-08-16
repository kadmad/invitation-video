import { useState, useRef, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";

type Step = "phone" | "otp";

export default function AuthModal() {
  const { showAuthModal, closeAuthModal, sendOTP, verifyOTP } = useAuthStore();
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [resendTimer, setResendTimer] = useState(0);
  // Pre-ticked, as agreed with the product owner. Users can untick it, and the
  // consent that is actually recorded is the state of this box at verify time.
  const [acceptedTerms, setAcceptedTerms] = useState(true);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  // Reset state when modal opens
  useEffect(() => {
    if (showAuthModal) {
      setStep("phone");
      setPhone("");
      setOtp(["", "", "", "", "", ""]);
      setError("");
      setLoading(false);
      setResendTimer(0);
      setAcceptedTerms(true);
    }
    return () => clearInterval(timerRef.current);
  }, [showAuthModal]);

  const startResendTimer = useCallback(() => {
    setResendTimer(30);
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setResendTimer((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const handleSendOTP = async () => {
    if (phone.length < 10) {
      setError("Enter valid 10-digit mobile number");
      return;
    }
    if (!acceptedTerms) {
      setError("Please accept the Terms & Conditions and Privacy Policy to continue");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await sendOTP(phone);
      setStep("otp");
      startResendTimer();
      // Focus first OTP input after step change
      setTimeout(() => otpRefs.current[0]?.focus(), 100);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to send OTP");
    } finally {
      setLoading(false);
    }
  };

  const handleResendOTP = async () => {
    if (resendTimer > 0) return;
    setLoading(true);
    setError("");
    try {
      await sendOTP(phone);
      startResendTimer();
      setOtp(["", "", "", "", "", ""]);
      otpRefs.current[0]?.focus();
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to resend OTP");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    const code = otp.join("");
    if (code.length !== 6) {
      setError("Enter 6-digit OTP");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await verifyOTP(phone, code, acceptedTerms);
      // Modal closes automatically via store
    } catch (err: any) {
      setError(err.response?.data?.detail || "Invalid OTP");
    } finally {
      setLoading(false);
    }
  };

  const handleOtpChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const digit = value.slice(-1);
    const newOtp = [...otp];
    newOtp[index] = digit;
    setOtp(newOtp);
    if (digit && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
    if (e.key === "Enter") {
      handleVerifyOTP();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;
    const newOtp = [...otp];
    for (let i = 0; i < 6; i++) {
      newOtp[i] = pasted[i] || "";
    }
    setOtp(newOtp);
    const focusIndex = Math.min(pasted.length, 5);
    otpRefs.current[focusIndex]?.focus();
  };

  if (!showAuthModal) return null;

  const displayPhone = phone.length === 10 ? `+91 ${phone.slice(0, 5)} ${phone.slice(5)}` : phone;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in"
        onClick={closeAuthModal}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 sm:p-8 animate-fade-in">
        {/* Close button */}
        <button
          onClick={closeAuthModal}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {step === "phone" ? (
          <>
            <h2 className="text-xl font-bold text-slate-800 mb-1">Login / Sign Up</h2>
            <p className="text-sm text-slate-500 mb-6">Enter your mobile number to continue</p>

            <div className="flex gap-2 mb-4">
              <div className="flex items-center px-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-600 font-medium">
                +91
              </div>
              <input
                type="tel"
                inputMode="numeric"
                maxLength={10}
                placeholder="98765 43210"
                value={phone}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, "").slice(0, 10);
                  setPhone(val);
                  setError("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSendOTP();
                }}
                autoFocus
                className="input-field flex-1 text-lg tracking-wider"
              />
            </div>

            <label className="flex items-start gap-2.5 mb-4 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={acceptedTerms}
                onChange={(e) => {
                  setAcceptedTerms(e.target.checked);
                  setError("");
                }}
                className="mt-0.5 w-4 h-4 shrink-0 rounded accent-primary-500 cursor-pointer"
              />
              <span className="text-xs text-slate-500 leading-relaxed">
                I agree to the{" "}
                <Link
                  to="/terms"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-primary-500 hover:underline font-medium"
                >
                  Terms &amp; Conditions
                </Link>
                ,{" "}
                <Link
                  to="/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-primary-500 hover:underline font-medium"
                >
                  Privacy Policy
                </Link>{" "}
                and{" "}
                <Link
                  to="/refund"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-primary-500 hover:underline font-medium"
                >
                  Refund Policy
                </Link>
                , and to receiving OTP and order updates on this number.
              </span>
            </label>

            {error && <p className="text-red-500 text-sm mb-3">{error}</p>}

            <button
              onClick={handleSendOTP}
              disabled={loading || phone.length < 10 || !acceptedTerms}
              className="btn-primary w-full py-3 text-base disabled:opacity-50"
            >
              {loading ? "Sending..." : "Send OTP"}
            </button>
          </>
        ) : (
          <>
            <h2 className="text-xl font-bold text-slate-800 mb-1">Enter OTP</h2>
            <p className="text-sm text-slate-500 mb-6">
              Sent to {displayPhone}
              <button
                onClick={() => { setStep("phone"); setError(""); }}
                className="text-primary-500 ml-2 hover:underline"
              >
                Change
              </button>
            </p>

            {/* OTP digit boxes */}
            <div className="flex gap-2 sm:gap-3 justify-center mb-4" onPaste={handleOtpPaste}>
              {otp.map((digit, i) => (
                <input
                  key={i}
                  ref={(el) => { otpRefs.current[i] = el; }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleOtpChange(i, e.target.value)}
                  onKeyDown={(e) => handleOtpKeyDown(i, e)}
                  className="w-11 h-13 sm:w-12 sm:h-14 text-center text-xl font-semibold border-2 border-slate-200 rounded-xl focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none transition-colors"
                />
              ))}
            </div>

            {error && <p className="text-red-500 text-sm mb-3 text-center">{error}</p>}

            <button
              onClick={handleVerifyOTP}
              disabled={loading || otp.join("").length !== 6}
              className="btn-primary w-full py-3 text-base disabled:opacity-50"
            >
              {loading ? "Verifying..." : "Verify & Continue"}
            </button>

            <p className="text-sm text-slate-500 text-center mt-4">
              {resendTimer > 0 ? (
                <>Resend OTP in {resendTimer}s</>
              ) : (
                <button
                  onClick={handleResendOTP}
                  disabled={loading}
                  className="text-primary-500 hover:underline font-medium"
                >
                  Resend OTP
                </button>
              )}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
