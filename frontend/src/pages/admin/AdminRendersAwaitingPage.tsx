import { useEffect, useState } from "react";
import { listAwaitingRenders, claimRender, cancelRender, completeRender } from "@/api/admin";
import { listFonts } from "@/api/fonts";
import ConfirmModal from "@/components/admin/ConfirmModal";
import type { AwaitingRender, Font } from "@/types";

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const hours = ms / 3_600_000;
  if (hours < 1) return `${Math.max(1, Math.round(ms / 60_000))}m ago`;
  if (hours < 48) return `${Math.round(hours)}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function RenderRow({
  render,
  fontsById,
  onClaimed,
  onCompleted,
}: {
  render: AwaitingRender;
  fontsById: Record<string, Font>;
  onClaimed: (r: AwaitingRender) => void;
  onCompleted: (id: string) => void;
}) {
  const [claiming, setClaiming] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);

  const handleClaim = async () => {
    setClaiming(true);
    setError("");
    try {
      const updated = await claimRender(render.id);
      onClaimed(updated);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to claim");
    } finally {
      setClaiming(false);
    }
  };

  const handleCancel = async () => {
    setConfirmingCancel(false);
    setCancelling(true);
    setError("");
    try {
      const updated = await cancelRender(render.id);
      onClaimed(updated);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to cancel");
    } finally {
      setCancelling(false);
    }
  };

  const handleComplete = async () => {
    if (!videoFile) {
      setError("Select the rendered video file first");
      return;
    }
    setUploading(true);
    setError("");
    try {
      await completeRender(render.id, videoFile, pdfFile);
      onCompleted(render.id);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to upload");
    } finally {
      setUploading(false);
    }
  };

  const fontName = render.font_id ? fontsById[render.font_id]?.name : null;

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <p className="font-semibold text-ink">
            {render.order_number}
            <span
              className={`ml-2 text-xs font-medium px-2 py-0.5 rounded-full ${
                {
                  pending: "bg-amber-100 text-amber-700",
                  processing: "bg-primary-100 text-primary-700",
                  failed: "bg-red-100 text-red-700",
                  cancelled: "bg-slate-200 text-ink-muted",
                }[render.status] ?? "bg-surface-alt text-ink-muted"
              }`}
            >
              {
                {
                  pending: "Waiting",
                  processing: "Rendering",
                  failed: "Failed",
                  cancelled: "Cancelled",
                }[render.status] ?? render.status
              }
            </span>
            {render.source === "production" && (
              <span
                className="ml-2 text-xs font-medium px-2 py-0.5 rounded-full bg-purple-100 text-purple-700"
                title="This job lives in production's database — view only here"
              >
                PROD
              </span>
            )}
          </p>
          <p className="text-sm text-ink-muted mt-0.5">
            {render.user_name}
            {render.user_phone && <span className="text-ink-muted"> · {render.user_phone}</span>}
          </p>
          <p className="text-sm text-ink-muted">{render.template_name}</p>
        </div>
        <span className="text-xs text-ink-muted flex-shrink-0" title={render.created_at}>
          {timeAgo(render.created_at)}
        </span>
      </div>

      <div className="bg-surface-alt rounded-xl p-3 mb-3 space-y-1">
        {Object.entries(render.field_values).map(([key, val]) => (
          <div key={key} className="flex justify-between gap-4 text-sm">
            <span className="text-ink-muted">{key.replace(/_/g, " ")}</span>
            <span className="text-ink font-medium text-right break-all">{val}</span>
          </div>
        ))}
        {fontName && (
          <div className="flex justify-between gap-4 text-sm pt-1 border-t border-edge">
            <span className="text-ink-muted">Font</span>
            <span className="text-ink font-medium">{fontName}</span>
          </div>
        )}
        {render.location_url && (
          <div className="flex justify-between gap-4 text-sm">
            <span className="text-ink-muted">Location</span>
            <a href={render.location_url} target="_blank" rel="noopener noreferrer" className="text-primary-500 hover:underline truncate">
              {render.location_url}
            </a>
          </div>
        )}
        {render.block_overrides && (
          <details className="text-xs text-ink-muted pt-1">
            <summary className="cursor-pointer">Advanced-mode block text</summary>
            <pre className="whitespace-pre-wrap break-all mt-1 text-ink-muted">
              {JSON.stringify(render.block_overrides, null, 2)}
            </pre>
          </details>
        )}
        {render.has_pdf && (
          <p className="text-xs text-primary-500 pt-1">This template also needs a PDF upload.</p>
        )}
      </div>

      {error && <p className="text-red-500 text-sm mb-2">{error}</p>}

      <>
          {(render.status === "failed" || render.status === "cancelled") && (
            <div className="space-y-3">
              {render.status === "failed" && render.error_message && (
                <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  {render.error_message}
                </p>
              )}
              {render.status === "cancelled" && (
                <p className="text-xs text-ink-muted">Stopped by an admin. Restart to try again.</p>
              )}
              <button onClick={handleClaim} disabled={claiming} className="btn-primary text-sm disabled:opacity-50">
                {claiming ? "Restarting..." : "Restart Render"}
              </button>
            </div>
          )}

          {render.status === "pending" && (
            <div className="space-y-2">
              {render.auto_dispatched ? (
                <p className="text-xs text-ink-muted">
                  Queued — will render automatically on the next available local worker, oldest first. No action needed.
                </p>
              ) : (
                <button onClick={handleClaim} disabled={claiming} className="btn-primary text-sm disabled:opacity-50">
                  {claiming ? "Claiming..." : "Run Render (claim this order)"}
                </button>
              )}
              <button
                onClick={() => setConfirmingCancel(true)}
                disabled={cancelling}
                className="block text-xs text-red-500 hover:text-red-600 hover:underline disabled:opacity-50"
              >
                {cancelling ? "Cancelling..." : "Cancel order"}
              </button>
            </div>
          )}

          {render.status === "processing" && (
            <div className="space-y-3">
              {render.auto_dispatched && (
                <div>
                  <div className="bg-surface-alt rounded-full h-2">
                    <div
                      className="bg-gradient-to-r from-primary-400 to-primary-600 rounded-full h-2 transition-all"
                      style={{ width: `${render.progress}%` }}
                    />
                  </div>
                  <p className="text-xs text-ink-muted mt-1">
                    Rendering automatically — {render.progress}% complete
                  </p>
                </div>
              )}

              <div>
                {render.auto_dispatched && (
                  <p className="text-xs text-ink-muted mb-1.5">Or upload a video manually instead (overrides the automatic render):</p>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <label className="text-xs text-ink-muted">
                    Video{!render.auto_dispatched && " (required)"}
                    <input
                      type="file"
                      accept="video/mp4,video/*"
                      onChange={(e) => setVideoFile(e.target.files?.[0] ?? null)}
                      className="block text-xs mt-1"
                    />
                  </label>
                  {render.has_pdf && (
                    <label className="text-xs text-ink-muted">
                      PDF (optional)
                      <input
                        type="file"
                        accept="application/pdf"
                        onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)}
                        className="block text-xs mt-1"
                      />
                    </label>
                  )}
                </div>
                <button onClick={handleComplete} disabled={uploading || !videoFile} className="btn-accent text-sm disabled:opacity-50 mt-2">
                  {uploading ? "Uploading..." : "Mark Completed & Notify Customer"}
                </button>
              </div>

              <button
                onClick={() => setConfirmingCancel(true)}
                disabled={cancelling}
                className="block text-xs text-red-500 hover:text-red-600 hover:underline disabled:opacity-50"
              >
                {cancelling ? "Cancelling..." : "Cancel render"}
              </button>
            </div>
          )}
      </>

      <ConfirmModal
        open={confirmingCancel}
        title="Cancel this render?"
        message={
          render.status === "processing"
            ? "This stops the render currently in progress on whatever worker is running it. The customer's order stays in the queue as \"Cancelled\" until you restart it."
            : "This removes the order from the render queue until you restart it. The customer's order is marked \"Cancelled\"."
        }
        confirmLabel="Cancel render"
        cancelLabel="Never mind"
        variant="danger"
        onConfirm={handleCancel}
        onCancel={() => setConfirmingCancel(false)}
      />
    </div>
  );
}

export default function AdminRendersAwaitingPage() {
  const [renders, setRenders] = useState<AwaitingRender[]>([]);
  const [typicalHours, setTypicalHours] = useState<number | null>(null);
  const [fontsById, setFontsById] = useState<Record<string, Font>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const refresh = () =>
      listAwaitingRenders().then((data) => {
        setRenders(data.renders);
        setTypicalHours(data.typical_turnaround_hours);
      });
    refresh().finally(() => setLoading(false));
    listFonts().then((fonts) => {
      setFontsById(Object.fromEntries(fonts.map((f) => [f.id, f])));
    });
    // Poll for progress on whatever's currently rendering, and to notice
    // when an auto-render finishes and drops off the list on its own.
    const interval = setInterval(refresh, 3000);
    return () => clearInterval(interval);
  }, []);

  if (loading) return <div className="text-center py-12 text-ink-muted">Loading...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold text-ink">Renders Awaiting</h1>
      </div>
      <p className="text-sm text-ink-muted mb-6">
        {renders.length} order{renders.length === 1 ? "" : "s"} need attention, oldest first
        {typicalHours != null && <> · typical turnaround ~{typicalHours}h</>}
      </p>

      {renders.length === 0 ? (
        <div className="card p-10 text-center text-ink-muted">
          Nothing waiting right now.
        </div>
      ) : (
        <div className="space-y-4">
          {renders.map((r) => (
            <RenderRow
              key={r.id}
              render={r}
              fontsById={fontsById}
              onClaimed={(updated) =>
                setRenders((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))
              }
              onCompleted={(id) => setRenders((prev) => prev.filter((x) => x.id !== id))}
            />
          ))}
        </div>
      )}
    </div>
  );
}
