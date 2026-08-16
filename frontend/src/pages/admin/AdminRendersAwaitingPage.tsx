import { useEffect, useState } from "react";
import { listAwaitingRenders, claimRender, completeRender } from "@/api/admin";
import { listFonts } from "@/api/fonts";
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
  autoRenderEnabled,
  onClaimed,
  onCompleted,
}: {
  render: AwaitingRender;
  fontsById: Record<string, Font>;
  autoRenderEnabled: boolean;
  onClaimed: (r: AwaitingRender) => void;
  onCompleted: (id: string) => void;
}) {
  const [claiming, setClaiming] = useState(false);
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
          <p className="font-semibold text-slate-800">
            {render.order_number}
            <span
              className={`ml-2 text-xs font-medium px-2 py-0.5 rounded-full ${
                render.status === "processing" ? "bg-primary-100 text-primary-700" : "bg-amber-100 text-amber-700"
              }`}
            >
              {render.status === "processing" ? "Claimed" : "Waiting"}
            </span>
          </p>
          <p className="text-sm text-slate-500 mt-0.5">
            {render.user_name}
            {render.user_phone && <span className="text-slate-400"> · {render.user_phone}</span>}
          </p>
          <p className="text-sm text-slate-500">{render.template_name}</p>
        </div>
        <span className="text-xs text-slate-400 flex-shrink-0" title={render.created_at}>
          {timeAgo(render.created_at)}
        </span>
      </div>

      <div className="bg-slate-50 rounded-xl p-3 mb-3 space-y-1">
        {Object.entries(render.field_values).map(([key, val]) => (
          <div key={key} className="flex justify-between gap-4 text-sm">
            <span className="text-slate-400">{key.replace(/_/g, " ")}</span>
            <span className="text-slate-700 font-medium text-right break-all">{val}</span>
          </div>
        ))}
        {fontName && (
          <div className="flex justify-between gap-4 text-sm pt-1 border-t border-slate-200">
            <span className="text-slate-400">Font</span>
            <span className="text-slate-700 font-medium">{fontName}</span>
          </div>
        )}
        {render.location_url && (
          <div className="flex justify-between gap-4 text-sm">
            <span className="text-slate-400">Location</span>
            <a href={render.location_url} target="_blank" rel="noopener noreferrer" className="text-primary-500 hover:underline truncate">
              {render.location_url}
            </a>
          </div>
        )}
        {render.block_overrides && (
          <details className="text-xs text-slate-400 pt-1">
            <summary className="cursor-pointer">Advanced-mode block text</summary>
            <pre className="whitespace-pre-wrap break-all mt-1 text-slate-600">
              {JSON.stringify(render.block_overrides, null, 2)}
            </pre>
          </details>
        )}
        {render.has_pdf && (
          <p className="text-xs text-primary-500 pt-1">This template also needs a PDF upload.</p>
        )}
      </div>

      {error && <p className="text-red-500 text-sm mb-2">{error}</p>}

      {render.status === "pending" ? (
        <button onClick={handleClaim} disabled={claiming} className="btn-primary text-sm disabled:opacity-50">
          {claiming ? "Claiming..." : "Run Render (claim this order)"}
        </button>
      ) : (
        <div className="space-y-3">
          {autoRenderEnabled && (
            <div>
              <div className="bg-slate-100 rounded-full h-2">
                <div
                  className="bg-gradient-to-r from-primary-400 to-primary-600 rounded-full h-2 transition-all"
                  style={{ width: `${render.progress}%` }}
                />
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Rendering automatically on this machine — {render.progress}% complete
              </p>
            </div>
          )}

          <div>
            {autoRenderEnabled && (
              <p className="text-xs text-slate-400 mb-1.5">Or upload a video manually instead (overrides the automatic render):</p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-xs text-slate-500">
                Video{!autoRenderEnabled && " (required)"}
                <input
                  type="file"
                  accept="video/mp4,video/*"
                  onChange={(e) => setVideoFile(e.target.files?.[0] ?? null)}
                  className="block text-xs mt-1"
                />
              </label>
              {render.has_pdf && (
                <label className="text-xs text-slate-500">
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
        </div>
      )}
    </div>
  );
}

export default function AdminRendersAwaitingPage() {
  const [renders, setRenders] = useState<AwaitingRender[]>([]);
  const [typicalHours, setTypicalHours] = useState<number | null>(null);
  const [autoRenderEnabled, setAutoRenderEnabled] = useState(false);
  const [fontsById, setFontsById] = useState<Record<string, Font>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const refresh = () =>
      listAwaitingRenders().then((data) => {
        setRenders(data.renders);
        setTypicalHours(data.typical_turnaround_hours);
        setAutoRenderEnabled(data.auto_render_enabled);
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

  if (loading) return <div className="text-center py-12 text-slate-400">Loading...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold text-slate-800">Renders Awaiting</h1>
      </div>
      <p className="text-sm text-slate-500 mb-6">
        {renders.length} order{renders.length === 1 ? "" : "s"} waiting, oldest first
        {typicalHours != null && <> · typical turnaround ~{typicalHours}h</>}
      </p>

      {renders.length === 0 ? (
        <div className="card p-10 text-center text-slate-400">
          Nothing waiting right now.
        </div>
      ) : (
        <div className="space-y-4">
          {renders.map((r) => (
            <RenderRow
              key={r.id}
              render={r}
              fontsById={fontsById}
              autoRenderEnabled={autoRenderEnabled}
              onClaimed={(updated) =>
                setRenders((prev) =>
                  prev.map((x) => (x.id === updated.id ? { ...x, status: updated.status, progress: updated.progress } : x))
                )
              }
              onCompleted={(id) => setRenders((prev) => prev.filter((x) => x.id !== id))}
            />
          ))}
        </div>
      )}
    </div>
  );
}
