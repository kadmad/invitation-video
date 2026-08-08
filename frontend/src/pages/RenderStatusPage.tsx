import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { getRender, getDownloadUrl } from "@/api/renders";
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

    const poll = async () => {
      const data = await getRender(id);
      setJob(data);
      if (data.status === "pending" || data.status === "processing") {
        setTimeout(poll, 2000);
      }
    };

    poll();
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

  const handleRerender = () => {
    if (!job) return;
    setPrefill({
      fieldValues: job.field_values,
      fontId: job.font_id,
      textColorOverrides: job.text_color_override,
    });
    navigate(`/editor/${job.template_id}`);
  };

  const handleCopyLink = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!job) return <div className="text-center py-12">Loading...</div>;

  const statusColors: Record<string, string> = {
    pending: "text-yellow-600",
    processing: "text-primary-600",
    completed: "text-accent-500",
    failed: "text-red-500",
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
              className="w-16 h-16 text-primary-500 animate-spin"
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
        </div>

        <p className={`text-2xl font-bold mb-6 ${statusColors[job.status]}`}>
          {job.status.charAt(0).toUpperCase() + job.status.slice(1)}
        </p>

        {/* Step Indicators */}
        {(job.status === "pending" || job.status === "processing") && (
          <>
            <div className="flex items-center justify-center gap-3 mb-6">
              {steps.map((step, i) => (
                <div key={step} className="flex items-center gap-3">
                  <div className="flex flex-col items-center gap-1.5">
                    <div
                      className={`w-3 h-3 rounded-full ${
                        i + 1 <= currentStep ? "bg-primary-500" : "bg-slate-300"
                      }`}
                    />
                    <span
                      className={`text-xs font-medium ${
                        i + 1 <= currentStep ? "text-primary-500" : "text-slate-300"
                      }`}
                    >
                      {step}
                    </span>
                  </div>
                  {i < steps.length - 1 && (
                    <div
                      className={`w-10 h-0.5 mb-5 ${
                        i + 1 < currentStep ? "bg-primary-500" : "bg-slate-200"
                      }`}
                    />
                  )}
                </div>
              ))}
            </div>

            {/* Progress Bar */}
            <div className="bg-slate-100 rounded-full h-3 mb-3">
              <div
                className="bg-gradient-to-r from-primary-400 to-primary-600 rounded-full h-3 transition-all"
                style={{ width: `${job.progress}%` }}
              />
            </div>
            <p className="text-slate-500 text-sm">{job.progress}% complete</p>

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
              <div className="mt-4 px-4 py-3 bg-primary-50 border border-primary-100 rounded-xl text-left">
                <p className="text-xs font-medium text-primary-400 uppercase tracking-wider mb-1">Note</p>
                <p className="text-sm text-primary-700">{job.render_notes}</p>
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

            {/* Share Buttons */}
            <div className="flex gap-3">
              <a
                href="https://wa.me/?text=Check out my video invitation!"
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <svg className="w-5 h-5 text-green-500" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
                </svg>
                WhatsApp
              </a>
              <button
                onClick={handleCopyLink}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
                </svg>
                {copied ? "Copied!" : "Copy Link"}
              </button>
            </div>

            <button
              onClick={handleRerender}
              className="btn-secondary w-full"
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
              className="btn-primary w-full"
            >
              Edit & Retry
            </button>
          </div>
        )}
      </div>

      {/* Field values summary */}
      <div className="card p-5 mt-4 text-left">
        <h3 className="text-sm font-medium text-slate-500 mb-2">Values used</h3>
        <div>
          {Object.entries(job.field_values).map(([key, val]) => (
            <div key={key} className="flex justify-between gap-4 text-sm border-b border-slate-50 py-2">
              <span className="text-slate-400 flex-shrink-0">{key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</span>
              <span className="font-medium text-slate-800 text-right break-all">{val}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="text-center mt-6 mb-8">
        <Link
          to="/my-orders"
          className="text-primary-500 hover:text-primary-600 font-medium"
        >
          View all orders
        </Link>
      </div>
    </div>
    </PageTransition>
  );
}
