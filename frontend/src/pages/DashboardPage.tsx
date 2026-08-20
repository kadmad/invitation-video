import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import { listRenders } from "@/api/renders";
import PageTransition from "@/components/common/PageTransition";
import type { RenderJob } from "@/types";

export default function DashboardPage() {
  const { user } = useAuthStore();
  const [recentRenders, setRecentRenders] = useState<RenderJob[]>([]);

  useEffect(() => {
    listRenders()
      .then((renders) => setRecentRenders(renders.slice(0, 3)))
      .catch(() => {});
  }, []);

  return (
    <PageTransition>
      {/* Hero greeting */}
      <div className="text-center py-12">
        <h1 className="text-3xl font-bold text-ink mb-2">
          Welcome back, {user?.first_name || user?.full_name}
        </h1>
        <p className="text-ink-muted mb-8">
          Create beautiful video invitations in minutes
        </p>
        <div className="flex justify-center gap-4">
          <Link to="/templates" className="btn-brand text-lg">
            Browse Templates
          </Link>
          <Link to="/my-orders" className="btn-brand-outline text-lg">
            My Orders
          </Link>
        </div>
      </div>

      {/* Quick stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mt-8 animate-slide-up">
        {/* Renders stat */}
        <div className="card p-5 flex items-center gap-4">
          <div className="flex-shrink-0 w-12 h-12 rounded-full bg-brand-100 flex items-center justify-center">
            <svg
              className="w-6 h-6 text-brand-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
              />
            </svg>
          </div>
          <div>
            <p className="text-2xl font-bold text-ink">&mdash;</p>
            <p className="text-sm text-ink-muted">Renders</p>
          </div>
        </div>

        {/* Drafts stat */}
        <div className="card p-5 flex items-center gap-4">
          <div className="flex-shrink-0 w-12 h-12 rounded-full bg-accent-100 flex items-center justify-center">
            <svg
              className="w-6 h-6 text-accent-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
              />
            </svg>
          </div>
          <div>
            <p className="text-2xl font-bold text-ink">&mdash;</p>
            <p className="text-sm text-ink-muted">Drafts</p>
          </div>
        </div>

        {/* Templates available stat */}
        <div className="card p-5 flex items-center gap-4">
          <div className="flex-shrink-0 w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center">
            <svg
              className="w-6 h-6 text-amber-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm0 8a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zm10 0a1 1 0 011-1h4a1 1 0 011 1v6a1 1 0 01-1 1h-4a1 1 0 01-1-1v-6z"
              />
            </svg>
          </div>
          <div>
            <p className="text-2xl font-bold text-ink">&mdash;</p>
            <p className="text-sm text-ink-muted">Templates Available</p>
          </div>
        </div>
      </div>

      {/* Recent renders section */}
      <div className="mt-12 animate-slide-up">
        <h2 className="text-xl font-semibold text-ink mb-4">
          Recent Renders
        </h2>
        {recentRenders.length === 0 ? (
          <div className="card p-8 text-center">
            <p className="text-ink-muted">
              No renders yet. Browse templates to create your first video
              invitation.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {recentRenders.map((render) => (
              <Link
                key={render.id}
                to="/my-orders"
                className="card p-4 flex items-center gap-3"
              >
                <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-brand-50 flex items-center justify-center">
                  <svg
                    className="w-5 h-5 text-brand-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink truncate">
                    Render {render.id.slice(0, 8)}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {render.status} &middot;{" "}
                    {new Date(render.created_at).toLocaleDateString()}
                  </p>
                </div>
                <span
                  className={`flex-shrink-0 inline-block w-2 h-2 rounded-full ${
                    render.status === "completed"
                      ? "bg-green-400"
                      : render.status === "failed"
                        ? "bg-red-400"
                        : render.status === "processing"
                          ? "bg-amber-400"
                          : "bg-slate-300"
                  }`}
                />
              </Link>
            ))}
          </div>
        )}
      </div>
    </PageTransition>
  );
}
