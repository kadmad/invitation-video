import { useEffect, useState } from "react";
import { listAdminFonts, uploadFont, deleteFont } from "@/api/admin";
import ConfirmModal from "@/components/admin/ConfirmModal";
import type { Font } from "@/types";
import { toast, errorMessage } from "@/store/toastStore";

export default function AdminFontsPage() {
  const [fonts, setFonts] = useState<Font[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [previewText, setPreviewText] = useState("The quick brown fox jumps over the lazy dog");
  const [initialLoad, setInitialLoad] = useState(true);

  const load = (isInitial = false) => {
    if (isInitial) setLoading(true);
    listAdminFonts()
      .then(setFonts)
      .finally(() => {
        setLoading(false);
        setInitialLoad(false);
      });
  };

  useEffect(() => {
    load(true);
  }, []);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (files.length === 0) return;
    setSaving(true);
    try {
      const result = await uploadFont(files);
      setShowUpload(false);
      setFiles([]);
      if (result.errors.length > 0) {
        const failed = result.errors.map(({ filename, error }) => `${filename}: ${error}`).join("; ");
        toast.error(`${result.uploaded.length} uploaded. Failed: ${failed}`, 12000);
      } else {
        toast.success(`${result.uploaded.length} font${result.uploaded.length === 1 ? "" : "s"} uploaded`);
      }
      load();
    } catch (err) {
      console.error("Failed to upload font", err);
      toast.error(errorMessage(err, "Failed to upload font"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteFont(deleteTarget.id);
      setDeleteTarget(null);
      load();
    } catch (err) {
      console.error("Failed to delete font", err);
      toast.error(errorMessage(err, "Failed to delete font"));
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-ink">Fonts</h1>
        <button onClick={() => setShowUpload(true)} className="btn-primary text-sm">
          Upload Font
        </button>
      </div>

      {showUpload && (
        <form
          onSubmit={handleUpload}
          className="card p-6 mb-6 space-y-4 animate-slide-up"
        >
          <h2 className="font-semibold text-lg text-ink">Upload Font</h2>
          <div>
            <p className="text-sm text-ink-muted mb-3">
              Choose one or more font files. Name, family, language, weight, style, and preview text are detected automatically. You can select up to 1,000 files per batch.
            </p>
            <input
              type="file"
              accept=".ttf,.otf,.woff,.woff2"
              multiple
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
              className="input-field w-full max-w-md text-sm file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100"
              required
            />
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving || files.length === 0} className="btn-primary text-sm disabled:opacity-50">
              {saving ? `Uploading ${files.length}...` : `Upload${files.length > 1 ? ` ${files.length} Fonts` : ""}`}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowUpload(false);
                setFiles([]);
              }}
              className="btn-secondary text-sm"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Preview text input */}
      {!loading && fonts.length > 0 && (
        <div className="mb-4">
          <label className="block text-xs font-medium text-ink-muted mb-1">Preview Text</label>
          <input
            type="text"
            value={previewText}
            onChange={(e) => setPreviewText(e.target.value)}
            className="input-field w-full max-w-md text-sm"
          />
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card p-4 skeleton">
              <div className="h-5 w-40 bg-slate-200 rounded mb-2" />
              <div className="h-4 w-64 bg-surface-alt rounded" />
            </div>
          ))}
        </div>
      ) : fonts.length === 0 ? (
        <div className="text-center py-16">
          <svg className="w-12 h-12 text-slate-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 011.037-.443 48.282 48.282 0 005.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
          </svg>
          <p className="text-ink-muted font-medium">No fonts uploaded yet</p>
          <p className="text-sm text-ink-muted mt-1">Upload your first font to use in templates</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-surface-alt border-b border-edge">
              <tr>
                <th className="px-4 py-3 text-sm font-medium text-ink-muted">Name</th>
                <th className="px-4 py-3 text-sm font-medium text-ink-muted">Family</th>
                <th className="px-4 py-3 text-sm font-medium text-ink-muted">Language</th>
                <th className="px-4 py-3 text-sm font-medium text-ink-muted">Weight</th>
                <th className="px-4 py-3 text-sm font-medium text-ink-muted">Style</th>
                <th className="px-4 py-3 text-sm font-medium text-ink-muted">Preview</th>
                <th className="px-4 py-3 text-sm font-medium text-ink-muted">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-edge">
              {fonts.map((font, i) => (
                <tr
                  key={font.id}
                  className={`hover:bg-surface-alt transition ${initialLoad ? "opacity-0 animate-slide-up" : ""}`}
                  style={initialLoad ? { animationDelay: `${Math.min(i * 50, 300)}ms`, animationFillMode: "forwards" } : undefined}
                >
                  <td className="px-4 py-3 text-sm font-medium text-ink">{font.name}</td>
                  <td className="px-4 py-3 text-sm text-ink-muted font-mono">{font.family_name}</td>
                  <td className="px-4 py-3 text-sm text-ink-muted">
                    {font.language || <span className="text-slate-300">-</span>}
                  </td>
                  <td className="px-4 py-3 text-sm text-ink-muted">{font.weight}</td>
                  <td className="px-4 py-3 text-sm text-ink-muted">{font.style}</td>
                  <td className="px-4 py-3 text-sm text-ink max-w-[200px] truncate" style={{ fontFamily: font.family_name }} title={previewText}>
                    {previewText}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setDeleteTarget({ id: font.id, name: font.name })}
                      className="text-red-500 hover:text-red-700 font-medium text-sm"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmModal
        open={!!deleteTarget}
        title="Delete Font"
        message={`Are you sure you want to delete "${deleteTarget?.name}"? Templates using this font will fall back to default.`}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
