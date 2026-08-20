import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getAdminStats, listAdminTemplates } from "@/api/admin";
import type { AdminStats, Template } from "@/types";

function SkeletonCard() {
  return (
    <div className="card p-6 animate-pulse">
      <div className="w-12 h-12 rounded-full bg-slate-200 mb-4" />
      <div className="h-8 w-16 bg-slate-200 rounded mb-2" />
      <div className="h-4 w-20 bg-surface-alt rounded" />
    </div>
  );
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [recentTemplates, setRecentTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getAdminStats(), listAdminTemplates()])
      .then(([s, t]) => {
        setStats(s);
        setRecentTemplates(t.slice(0, 5));
      })
      .finally(() => setLoading(false));
  }, []);

  const cards = stats
    ? [
        {
          label: "Templates",
          value: stats.templates,
          to: "/admin/templates",
          bgColor: "bg-primary-100",
          iconColor: "text-primary-500",
          icon: (
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
            </svg>
          ),
        },
        {
          label: "Categories",
          value: stats.categories,
          to: "/admin/categories",
          bgColor: "bg-accent-100",
          iconColor: "text-accent-500",
          icon: (
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" />
            </svg>
          ),
        },
        {
          label: "Users",
          value: stats.users,
          to: "/admin",
          bgColor: "bg-amber-100",
          iconColor: "text-amber-500",
          icon: (
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
            </svg>
          ),
        },
        {
          label: "Renders",
          value: stats.renders,
          to: "/admin",
          bgColor: "bg-rose-100",
          iconColor: "text-rose-500",
          icon: (
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h1.5C5.496 19.5 6 18.996 6 18.375m-2.625 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-1.5A1.125 1.125 0 0118 18.375M20.625 4.5H3.375m17.25 0c.621 0 1.125.504 1.125 1.125M20.625 4.5h-1.5C18.504 4.5 18 5.004 18 5.625m3.75 0v1.5c0 .621-.504 1.125-1.125 1.125M3.375 4.5c-.621 0-1.125.504-1.125 1.125M3.375 4.5h1.5C5.496 4.5 6 5.004 6 5.625m-2.625 0v1.5c0 .621.504 1.125 1.125 1.125m0 0h1.5m-1.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m1.5-3.75C5.496 8.25 6 7.746 6 7.125v-1.5M4.875 8.25C5.496 8.25 6 8.754 6 9.375v1.5c0 .621-.504 1.125-1.125 1.125m1.5 0h12m-12 0c-.621 0-1.125.504-1.125 1.125M18 12H6.375m11.625 0c.621 0 1.125.504 1.125 1.125m0 0v1.5c0 .621-.504 1.125-1.125 1.125M18 12c-.621 0-1.125-.504-1.125-1.125V9.375c0-.621.504-1.125 1.125-1.125m0 3.75h1.5m-1.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m1.5-3.75c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125M18 15.75h-1.5m1.5 0c.621 0 1.125.504 1.125 1.125" />
            </svg>
          ),
        },
      ]
    : [];

  return (
    <div>
      <h1 className="text-2xl font-bold text-ink mb-6">Admin Dashboard</h1>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
          : cards.map((card) => (
              <Link
                key={card.label}
                to={card.to}
                className="card p-6 hover:shadow-lg transition-shadow group"
              >
                <div
                  className={`${card.bgColor} w-12 h-12 rounded-full flex items-center justify-center ${card.iconColor} mb-4 group-hover:scale-110 transition-transform`}
                >
                  {card.icon}
                </div>
                <p className="text-3xl font-bold text-ink">{card.value}</p>
                <p className="text-sm text-ink-muted mt-1">{card.label}</p>
              </Link>
            ))}
      </div>

      {/* Quick Actions */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-ink mb-3">Quick Actions</h2>
        <div className="flex flex-wrap gap-3">
          <Link to="/admin/templates" className="btn-primary text-sm inline-flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Create Template
          </Link>
          <Link to="/admin/categories" className="btn-secondary text-sm inline-flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add Category
          </Link>
          <Link to="/admin/fonts" className="btn-secondary text-sm inline-flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
            Upload Font
          </Link>
        </div>
      </div>

      {/* Recent Templates */}
      {!loading && recentTemplates.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-ink">Recent Templates</h2>
            <Link to="/admin/templates" className="text-sm text-primary-500 hover:text-primary-700 font-medium">
              View all
            </Link>
          </div>
          <div className="card overflow-hidden">
            <table className="w-full text-left">
              <thead className="bg-surface-alt border-b border-edge">
                <tr>
                  <th className="px-4 py-3 text-sm font-medium text-ink-muted">Name</th>
                  <th className="px-4 py-3 text-sm font-medium text-ink-muted">Slug</th>
                  <th className="px-4 py-3 text-sm font-medium text-ink-muted">Status</th>
                  <th className="px-4 py-3 text-sm font-medium text-ink-muted">Blocks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-edge">
                {recentTemplates.map((t) => (
                  <tr key={t.id} className="hover:bg-surface-alt transition">
                    <td className="px-4 py-3">
                      <Link to={`/admin/templates/${t.id}`} className="text-sm font-medium text-primary-600 hover:text-primary-800">
                        {t.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sm text-ink-muted">{t.slug}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                        t.is_published ? "bg-accent-50 text-accent-700" : "bg-amber-50 text-amber-700"
                      }`}>
                        {t.is_published ? "Published" : "Draft"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-ink-muted">
                      {t.text_blocks?.length ?? 0}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && !stats && (
        <p className="text-red-500">Failed to load stats.</p>
      )}
    </div>
  );
}
