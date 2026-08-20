import { useEffect, useState, useMemo } from "react";
import client from "@/api/client";

interface PeriodData {
  purchases: number;
  revenue: number;
  prev_purchases: number;
  prev_revenue: number;
}

interface TemplateAnalyticsRow {
  template_id: string;
  template_name: string;
  slug: string;
  created_by: string | null;
  created_at: string;
  total_purchases: number;
  total_revenue: number;
  p_7d: PeriodData;
  p_30d: PeriodData;
  p_90d: PeriodData;
  p_365d: PeriodData;
  p_this_year: PeriodData;
  p_last_year: PeriodData;
}

interface AnalyticsSummary {
  total_revenue: number;
  total_purchases: number;
  s_7d: PeriodData;
  s_30d: PeriodData;
  s_90d: PeriodData;
  s_365d: PeriodData;
  s_this_year: PeriodData;
  s_last_year: PeriodData;
  top_template_name: string | null;
  templates: TemplateAnalyticsRow[];
}

type TimeFilter = "all" | "7d" | "30d" | "90d" | "365d" | "this_year" | "last_year";

const FILTERS: { value: TimeFilter; label: string }[] = [
  { value: "all", label: "All Time" },
  { value: "7d", label: "7 Days" },
  { value: "30d", label: "30 Days" },
  { value: "90d", label: "90 Days" },
  { value: "365d", label: "1 Year" },
  { value: "this_year", label: "This Year" },
  { value: "last_year", label: "Last Year" },
];

function formatCurrency(paise: number): string {
  return "\u20B9" + (paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 0 });
}

/** Get period data from a template row based on selected filter */
function getTemplatePeriod(t: TemplateAnalyticsRow, filter: TimeFilter): PeriodData {
  switch (filter) {
    case "7d": return t.p_7d;
    case "30d": return t.p_30d;
    case "90d": return t.p_90d;
    case "365d": return t.p_365d;
    case "this_year": return t.p_this_year;
    case "last_year": return t.p_last_year;
    default: return { purchases: t.total_purchases, revenue: t.total_revenue, prev_purchases: 0, prev_revenue: 0 };
  }
}

/** Get summary period data based on selected filter */
function getSummaryPeriod(data: AnalyticsSummary, filter: TimeFilter): PeriodData {
  switch (filter) {
    case "7d": return data.s_7d;
    case "30d": return data.s_30d;
    case "90d": return data.s_90d;
    case "365d": return data.s_365d;
    case "this_year": return data.s_this_year;
    case "last_year": return data.s_last_year;
    default: return { purchases: data.total_purchases, revenue: data.total_revenue, prev_purchases: 0, prev_revenue: 0 };
  }
}

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null;
  return Math.round(((current - previous) / previous) * 100);
}

/** Arrow indicator with tooltip showing percentage change */
function TrendArrow({ current, previous }: { current: number; previous: number }) {
  const pct = pctChange(current, previous);
  if (pct === null) return null;

  const isUp = pct >= 0;
  const diff = current - previous;
  const sign = diff >= 0 ? "+" : "";

  return (
    <span
      className={`inline-flex items-center gap-0.5 ml-2 px-1.5 py-0.5 rounded-full text-[10px] font-semibold cursor-help group relative ${
        isUp
          ? "bg-green-50 text-green-600"
          : "bg-red-50 text-red-600"
      }`}
    >
      {isUp ? (
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
        </svg>
      ) : (
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      )}
      {Math.abs(pct)}%
      {/* Hover tooltip */}
      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 rounded-lg bg-slate-800 text-white text-[11px] whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-30 shadow-lg font-normal">
        {sign}{pct}% vs prev period ({sign}{diff})
      </span>
    </span>
  );
}

function StatCard({
  label,
  value,
  period,
  isCurrency,
}: {
  label: string;
  value: string;
  period?: PeriodData;
  isCurrency?: boolean;
}) {
  const showTrend = period && period.prev_purchases !== undefined;
  const current = isCurrency ? period?.revenue ?? 0 : period?.purchases ?? 0;
  const previous = isCurrency ? period?.prev_revenue ?? 0 : period?.prev_purchases ?? 0;

  return (
    <div className="card p-5">
      <p className="text-[11px] font-medium text-ink-muted uppercase tracking-wider mb-2">{label}</p>
      <div className="flex items-center flex-wrap gap-1">
        <p className="text-2xl font-bold text-ink">{value}</p>
        {showTrend && <TrendArrow current={current} previous={previous} />}
      </div>
      {showTrend && (
        <p className="text-[11px] text-ink-muted mt-1.5">
          Prev: {isCurrency ? formatCurrency(previous) : previous}
        </p>
      )}
    </div>
  );
}

export default function AdminAnalyticsPage() {
  const [data, setData] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<TimeFilter>("30d");
  const [sortBy, setSortBy] = useState<"purchases" | "revenue">("purchases");
  const [search, setSearch] = useState("");

  useEffect(() => {
    client
      .get<AnalyticsSummary>("/admin/analytics")
      .then((r) => setData(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filteredTemplates = useMemo(() => {
    if (!data) return [];
    let list = data.templates;

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (t) =>
          t.template_name.toLowerCase().includes(q) ||
          t.slug.toLowerCase().includes(q) ||
          t.template_id.toLowerCase().includes(q),
      );
    }

    list = [...list].sort((a, b) => {
      const pa = getTemplatePeriod(a, filter);
      const pb = getTemplatePeriod(b, filter);
      return sortBy === "revenue"
        ? pb.revenue - pa.revenue
        : pb.purchases - pa.purchases;
    });

    return list;
  }, [data, filter, sortBy, search]);

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="card h-24" />
          ))}
        </div>
        <div className="card h-96" />
      </div>
    );
  }

  if (!data) {
    return <p className="text-red-500">Failed to load analytics.</p>;
  }

  const summary = getSummaryPeriod(data, filter);
  const showComparison = filter !== "all";

  return (
    <div className="space-y-6">
      {/* Header + filter */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-ink">Analytics</h1>
        <div className="flex gap-1 bg-surface-alt rounded-lg p-1 flex-wrap">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition ${
                filter === f.value
                  ? "bg-surface text-ink shadow-sm"
                  : "text-ink-muted hover:text-ink"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Revenue"
          value={formatCurrency(filter === "all" ? data.total_revenue : summary.revenue)}
          period={showComparison ? summary : undefined}
          isCurrency
        />
        <StatCard
          label="Purchases"
          value={(filter === "all" ? data.total_purchases : summary.purchases).toLocaleString()}
          period={showComparison ? summary : undefined}
        />
        <StatCard
          label="Avg Order Value"
          value={
            summary.purchases > 0
              ? formatCurrency(Math.round(summary.revenue / summary.purchases))
              : "\u2014"
          }
        />
        <StatCard
          label="Top Template"
          value={data.top_template_name || "\u2014"}
        />
      </div>

      {/* Table controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <input
          type="text"
          placeholder="Search by name, slug, or ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input-field text-sm flex-1 max-w-xs"
        />
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as "purchases" | "revenue")}
          className="input-field text-sm w-auto min-w-[11rem] flex-shrink-0"
        >
          <option value="purchases">Sort by Purchases</option>
          <option value="revenue">Sort by Revenue</option>
        </select>
      </div>

      {/* Template table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-alt text-left">
                <th className="px-4 py-3 font-medium text-ink-muted text-xs uppercase tracking-wider">Template</th>
                <th className="px-4 py-3 font-medium text-ink-muted text-xs uppercase tracking-wider">ID</th>
                <th className="px-4 py-3 font-medium text-ink-muted text-xs uppercase tracking-wider">Created</th>
                <th className="px-4 py-3 font-medium text-ink-muted text-xs uppercase tracking-wider text-right">Purchases</th>
                <th className="px-4 py-3 font-medium text-ink-muted text-xs uppercase tracking-wider text-right">Revenue</th>
                <th className="px-4 py-3 font-medium text-ink-muted text-xs uppercase tracking-wider text-right">All Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredTemplates.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-ink-muted">
                    No templates found
                  </td>
                </tr>
              ) : (
                filteredTemplates.map((t) => {
                  const period = getTemplatePeriod(t, filter);
                  return (
                    <tr key={t.template_id} className="hover:bg-surface-alt transition-colors">
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium text-ink">{t.template_name}</p>
                          <p className="text-xs text-ink-muted">{t.slug}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-mono text-ink-muted">
                          {t.template_id.slice(0, 8)}...
                        </span>
                      </td>
                      <td className="px-4 py-3 text-ink-muted">
                        {new Date(t.created_at).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <span className="font-medium">{period.purchases}</span>
                          {showComparison && (
                            <TrendArrow
                              current={period.purchases}
                              previous={period.prev_purchases}
                            />
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <span className="font-medium text-green-600">
                            {formatCurrency(period.revenue)}
                          </span>
                          {showComparison && (
                            <TrendArrow
                              current={period.revenue}
                              previous={period.prev_revenue}
                            />
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-ink-muted">
                        <span className="text-xs">
                          {t.total_purchases} / {formatCurrency(t.total_revenue)}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
