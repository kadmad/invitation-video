import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { getRender, getDownloadUrl, getPdfDownloadUrl } from "@/api/renders";
import { useEditorStore } from "@/store/editorStore";
import type { RenderJob } from "@/types";
import PageTransition from "@/components/common/PageTransition";

export default function RenderStatusPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { setPrefill } = useEditorStore();
  const [job, setJob] = useState<RenderJob | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!id) return;
    let active = true;

    const poll = async () => {
      if (!active) return;
      try {
        const data = await getRender(id);
        if (!active) return;
        setJob(data);
        const videoInProgress = data.status === "pending" || data.status === "processing";
        const pdfInProgress = data.pdf_status === "queued" || data.pdf_status === "generating";
        if (videoInProgress || pdfInProgress) {
          // Manual jobs now auto-dispatch and render live too — poll fast
          // (same as automatic renders) once a worker's actually on it
          // (status "processing", progress moving) so the bar looks real-time.
          // Only back off to a slow poll while still "pending": queued but
          // no connected worker has picked it up yet, so nothing's changing.
          const isManualStillWaiting = data.render_method === "manual" && data.status === "pending";
          setTimeout(poll, isManualStillWaiting ? 30000 : 2000);
        }
      } catch {
        if (active) setTimeout(poll, 5000);
      }
    };

    poll();
    return () => { active = false; };
  }, [id]);

  const handleDownload = async () => {
    if (!id) return;
    const url = getDownloadUrl(id);
    const token = localStorage.getItem("token");
    const response = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = `render_${id}.mp4`;
    a.click();
    URL.revokeObjectURL(blobUrl);
  };

  const handlePdfDownload = async () => {
    if (!id) return;
    const url = getPdfDownloadUrl(id);
    const token = localStorage.getItem("token");
    const response = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = `invitation_${id}.pdf`;
    a.click();
    URL.revokeObjectURL(blobUrl);
  };

  const handleRerender = () => {
    if (!job) return;
    setPrefill({
      fieldValues: job.field_values,
      fontId: job.font_id,
      textColorOverrides: job.text_color_override,
    });
    navigate(`/editor/${job.template_id}`);
  };

  const handleEditDetails = () => {
    if (!job) return;
    navigate(`/editor/${job.template_id}?editRender=${job.id}`);
  };

  const watchUrl = id ? `${window.location.origin}/watch/${id}` : "";

  const handleCopyLink = async () => {
    await navigator.clipboard.writeText(watchUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!job) return <div className="text-center py-12">Loading...</div>;

  const statusColors: Record<string, string> = {
    pending: "text-yellow-600",
    processing: "text-brand-600",
    completed: "text-accent-500",
    failed: "text-red-500",
    cancelled: "text-ink-muted",
  };

  const currentStep =
    job.status === "pending"
      ? 1
      : job.status === "processing"
        ? 2
        : job.status === "completed"
          ? 3
          : 0;

  const steps = ["Queued", "Rendering", "Finalizing"];

  return (
    <PageTransition>
    <div className="max-w-lg mx-auto mt-8">
      <div className="card p-8 text-center">
        {/* Status Icon */}
        <div className="flex justify-center mb-5">
          {job.status === "pending" && (
            <svg
              className="w-16 h-16 text-yellow-500 animate-[spin_3s_linear_infinite]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" fill="none" />
              <path strokeLinecap="round" d="M12 6v6l4 2" />
            </svg>
          )}
          {job.status === "processing" && (
            <svg
              className="w-16 h-16 text-brand-500 animate-spin"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182"
              />
            </svg>
          )}
          {job.status === "completed" && (
            <svg
              className="w-16 h-16 text-accent-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
              />
            </svg>
          )}
          {job.status === "failed" && (
            <svg
              className="w-16 h-16 text-red-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m9.75 9.75 4.5 4.5m0-4.5-4.5 4.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
              />
            </svg>
          )}
          {job.status === "cancelled" && (
            <svg
              className="w-16 h-16 text-ink-muted"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" fill="none" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.75v4.5m4.5-4.5v4.5" />
            </svg>
          )}
        </div>

        <p className={`text-2xl font-bold mb-6 ${statusColors[job.status]}`}>
          {job.status.charAt(0).toUpperCase() + job.status.slice(1)}
        </p>

        {/* Manual-render, still pending: queued for a worker (auto-dispatched
            at checkout, no admin action needed) but nobody's picked it up
            yet, so there's no live progress to show — a waiting message and
            a chance to fix a typo instead. Once it flips to "processing" a
            worker is actively on it and we fall through to the shared live
            progress bar below, same as an automatic render. */}
        {job.render_method === "manual" && job.status === "pending" && (
          <>
            <div className="mt-1 px-4 py-3 bg-green-50 border border-green-100 rounded-xl text-left">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
                </svg>
                <div>
                  <p className="text-sm font-medium text-green-800">You can close this page</p>
                  <p className="text-xs text-green-600 mt-0.5">
                    We'll send you a WhatsApp message with the download link once your video is ready.
                    {job.typical_turnaround_hours != null ? (
                      <> Orders like this are usually done in about {job.typical_turnaround_hours < 1
                        ? `${Math.round(job.typical_turnaround_hours * 60)} minutes`
                        : `${job.typical_turnaround_hours} hours`}, </>
                    ) : (
                      <> This can take a little while, </>
                    )}
                    max 24 hours.
                  </p>
                </div>
              </div>
            </div>

            <button onClick={handleEditDetails} className="btn-brand-outline w-full mt-4">
              Edit Your Details
            </button>

            {job.render_notes && (
              <div className="mt-4 px-4 py-3 bg-brand-50 border border-brand-100 rounded-xl text-left">
                <p className="text-xs font-medium text-brand-400 uppercase tracking-wider mb-1">Note</p>
                <p className="text-sm text-brand-700">{job.render_notes}</p>
              </div>
            )}
          </>
        )}

        {/* Order was paused by an admin mid-queue (e.g. to fix something on
            their end) — not a failure, just temporarily on hold. They'll
            restart it from their side; nothing for the customer to do. */}
        {job.status === "cancelled" && (
          <p className="text-ink-muted text-sm">
            Your order is temporarily on hold — we'll pick it back up shortly. No action needed on your end.
          </p>
        )}

        {/* Live progress from the worker — automatic renders always, manual
            renders once a worker has actually picked the job up. */}
        {(job.render_method !== "manual" ? job.status === "pending" || job.status === "processing" : job.status === "processing") && (
          <>
            <div className="flex items-center justify-center gap-3 mb-6">
              {steps.map((step, i) => (
                <div key={step} className="flex items-center gap-3">
                  <div className="flex flex-col items-center gap-1.5">
                    <div
                      className={`w-3 h-3 rounded-full ${
                        i + 1 <= currentStep ? "bg-brand-500" : "bg-slate-300"
                      }`}
                    />
                    <span
                      className={`text-xs font-medium ${
                        i + 1 <= currentStep ? "text-brand-500" : "text-slate-300"
                      }`}
                    >
                      {step}
                    </span>
                  </div>
                  {i < steps.length - 1 && (
                    <div
                      className={`w-10 h-0.5 mb-5 ${
                        i + 1 < currentStep ? "bg-brand-500" : "bg-slate-200"
                      }`}
                    />
                  )}
                </div>
              ))}
            </div>

            {/* Progress Bar */}
            <div className="bg-surface-alt rounded-full h-3 mb-3">
              <div
                className="bg-gradient-to-r from-brand-400 to-brand-600 rounded-full h-3 transition-all"
                style={{ width: `${job.progress}%` }}
              />
            </div>
            <p className="text-ink-muted text-sm">{job.progress}% complete</p>

            {/* WhatsApp notification banner */}
            <div className="mt-5 px-4 py-3 bg-green-50 border border-green-100 rounded-xl text-left">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
                </svg>
                <div>
                  <p className="text-sm font-medium text-green-800">You can close this page</p>
                  <p className="text-xs text-green-600 mt-0.5">
                    We'll send you a WhatsApp message with the download link once your video is ready.
                  </p>
                </div>
              </div>
            </div>

            {/* Render notes from admin */}
            {job.render_notes && (
              <div className="mt-4 px-4 py-3 bg-brand-50 border border-brand-100 rounded-xl text-left">
                <p className="text-xs font-medium text-brand-400 uppercase tracking-wider mb-1">Note</p>
                <p className="text-sm text-brand-700">{job.render_notes}</p>
              </div>
            )}
          </>
        )}

        {/* Completed State */}
        {job.status === "completed" && (
          <div className="space-y-3">
            <button
              onClick={handleDownload}
              className="btn-accent w-full py-3.5 text-lg"
            >
              Download Video
            </button>

            {/* PDF status indicator */}
            {job.pdf_status === "queued" && (
              <div className="w-full flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 py-3 px-4">
                <div className="w-5 h-5 rounded-full border-2 border-amber-400 border-t-transparent animate-spin flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-amber-700">Invitation PDF</p>
                  <p className="text-xs text-amber-500">In queue...</p>
                </div>
              </div>
            )}
            {job.pdf_status === "generating" && (
              <div className="w-full rounded-xl border border-brand-200 bg-brand-50 py-3 px-4">
                <div className="flex items-center gap-3 mb-2">
                  <svg className="w-5 h-5 text-brand-500 animate-pulse flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                  </svg>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-brand-700">Creating Invitation PDF</p>
                    <p className="text-xs text-brand-400">Extracting frames & building pages...</p>
                  </div>
                </div>
                <div className="bg-brand-100 rounded-full h-1.5 overflow-hidden">
                  <div className="bg-brand-500 rounded-full h-1.5 animate-[pdfProgress_2s_ease-in-out_infinite]" />
                </div>
              </div>
            )}
            {job.pdf_status === "completed" && job.pdf_key && (
              <button
                onClick={handlePdfDownload}
                className="w-full flex items-center justify-center gap-2 rounded-xl border border-brand-200 bg-brand-50 py-3 text-base font-medium text-brand-700 hover:bg-brand-100 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                </svg>
                Download Invitation PDF
              </button>
            )}
            {job.pdf_status === "failed" && (
              <div className="w-full flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 py-3 px-4">
                <svg className="w-5 h-5 text-red-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
                </svg>
                <p className="text-sm text-red-600">PDF generation failed</p>
              </div>
            )}

            {/* Share Buttons */}
            <div className="flex gap-3">
              <a
                href={`https://wa.me/?text=${encodeURIComponent(`Check out my video invitation!\n${watchUrl}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-edge py-2.5 text-sm font-medium text-ink hover:bg-surface-alt transition-colors"
              >
                <svg className="w-5 h-5 text-green-500" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
                </svg>
                WhatsApp
              </a>
              <button
                onClick={handleCopyLink}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-edge py-2.5 text-sm font-medium text-ink hover:bg-surface-alt transition-colors"
              >
                <svg className="w-5 h-5 text-ink-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
                </svg>
                {copied ? "Copied!" : "Copy Link"}
              </button>
            </div>

            <button
              onClick={handleRerender}
              className="btn-brand-outline w-full"
            >
              Edit & Re-render
            </button>
          </div>
        )}

        {/* Failed State */}
        {job.status === "failed" && (
          <div className="space-y-3">
            <p className="text-red-500 text-sm">{job.error_message}</p>
            <button
              onClick={handleRerender}
              className="btn-brand w-full"
            >
              Edit & Retry
            </button>
          </div>
        )}
      </div>

      {/* Field values summary */}
      <div className="card p-5 mt-4 text-left">
        <h3 className="text-sm font-medium text-ink-muted mb-2">Values used</h3>
        <div>
          {Object.entries(job.field_values).map(([key, val]) => (
            <div key={key} className="flex justify-between gap-4 text-sm border-b border-slate-50 py-2">
              <span className="text-ink-muted flex-shrink-0">{key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</span>
              <span className="font-medium text-ink text-right break-all">{val}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="text-center mt-6 mb-8">
        <Link
          to="/my-orders"
          className="text-brand-500 hover:text-brand-600 font-medium"
        >
          View all orders
        </Link>
      </div>
    </div>
    </PageTransition>
  );
}
