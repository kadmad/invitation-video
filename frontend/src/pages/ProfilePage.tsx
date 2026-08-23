import { useState, FormEvent } from "react";
import { useAuthStore } from "@/store/authStore";
import { setPassword as setPasswordApi, updateProfile } from "@/api/auth";
import PageTransition from "@/components/common/PageTransition";

const PASSWORD_PATTERN = /^[A-Za-z0-9]{8,}$/;

function ProfileForm() {
  const { user, loadUser } = useAuthStore();
  const [fullName, setFullName] = useState(user?.full_name || "");
  const [firstName, setFirstName] = useState(user?.first_name || "");
  const [lastName, setLastName] = useState(user?.last_name || "");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (!fullName.trim()) {
      setError("Full name cannot be empty.");
      return;
    }
    setSubmitting(true);
    try {
      await updateProfile(fullName.trim(), firstName.trim() || null, lastName.trim() || null);
      await loadUser();
      setSuccess("Profile updated.");
    } catch (err: unknown) {
      const detail =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Something went wrong. Please try again.";
      setError(detail);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 bg-surface border border-edge rounded-2xl p-6">
      <div>
        <label className="block text-sm font-medium text-ink mb-1.5">Email</label>
        <input
          type="email"
          disabled
          value={user?.email || ""}
          className="w-full border border-edge rounded-xl py-2.5 px-3.5 text-sm text-ink-muted bg-surface-alt cursor-not-allowed"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-ink mb-1.5">Full name</label>
        <input
          type="text"
          required
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className="w-full border border-edge rounded-xl py-2.5 px-3.5 text-sm text-ink bg-surface focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-ink mb-1.5">First name</label>
          <input
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className="w-full border border-edge rounded-xl py-2.5 px-3.5 text-sm text-ink bg-surface focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-ink mb-1.5">Last name</label>
          <input
            type="text"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className="w-full border border-edge rounded-xl py-2.5 px-3.5 text-sm text-ink bg-surface focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
      </div>

      {error && <p className="text-red-500 text-sm">{error}</p>}
      {success && <p className="text-green-600 text-sm">{success}</p>}

      <button type="submit" disabled={submitting} className="w-full btn-brand text-sm py-2.5 disabled:opacity-60">
        {submitting ? "Saving..." : "Save Changes"}
      </button>
    </form>
  );
}

function SecurityForm() {
  const { user, loadUser } = useAuthStore();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const hasPassword = !!user?.has_password;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!PASSWORD_PATTERN.test(newPassword)) {
      setError("Password must be at least 8 characters, letters and numbers only (no special characters).");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      await setPasswordApi(newPassword, hasPassword ? currentPassword : undefined);
      await loadUser();
      setSuccess(hasPassword ? "Password updated." : "Password set. You can now log in with your email and password.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: unknown) {
      const detail =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Something went wrong. Please try again.";
      setError(detail);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 bg-surface border border-edge rounded-2xl p-6">
      <p className="text-sm text-ink-muted -mt-1">
        {hasPassword
          ? "Change your password. You'll still be able to log in with Google too."
          : "Set a password so you can log in with your email, in addition to Google."}
      </p>

      {hasPassword && (
        <div>
          <label className="block text-sm font-medium text-ink mb-1.5">Current password</label>
          <input
            type="password"
            required
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="w-full border border-edge rounded-xl py-2.5 px-3.5 text-sm text-ink bg-surface focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-ink mb-1.5">{hasPassword ? "New password" : "Password"}</label>
        <input
          type="password"
          required
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className="w-full border border-edge rounded-xl py-2.5 px-3.5 text-sm text-ink bg-surface focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        <p className="text-xs text-ink-muted mt-1">At least 8 characters, letters and numbers only.</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-ink mb-1.5">Confirm password</label>
        <input
          type="password"
          required
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="w-full border border-edge rounded-xl py-2.5 px-3.5 text-sm text-ink bg-surface focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      {error && <p className="text-red-500 text-sm">{error}</p>}
      {success && <p className="text-green-600 text-sm">{success}</p>}

      <button type="submit" disabled={submitting} className="w-full btn-brand text-sm py-2.5 disabled:opacity-60">
        {submitting ? "Saving..." : hasPassword ? "Update Password" : "Set Password"}
      </button>
    </form>
  );
}

export default function ProfilePage() {
  return (
    <PageTransition>
      <div className="max-w-md mx-auto py-8 space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-ink mb-1">Profile</h1>
          <p className="text-sm text-ink-muted">Manage your account details.</p>
        </div>

        <ProfileForm />

        <div>
          <h2 className="text-lg font-semibold text-ink mb-3">Security</h2>
          <SecurityForm />
        </div>
      </div>
    </PageTransition>
  );
}
