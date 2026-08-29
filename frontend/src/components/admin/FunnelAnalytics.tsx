import { useEffect, useMemo, useState } from "react";
import client from "@/api/client";

interface FunnelStage {
  event: string;
  label: string;
  actors: number;
  pct_of_top: number;
}

interface DropOffs {
  filled_in_but_no_checkout: number;
  blocked_at_login: number;
  ordered_but_unpaid: number;
  ordered_but_unpaid_value: number;
}

interface FunnelTemplateRow {
  template_id: string;
  name: string;
  slug: string;
  is_published: boolean;
  card_clicks: number;
  preview_plays: number;
  preview_10s: number;
  editor_opens: number;
  customization_started: number;
  customization_complete: number;
  checkout_opened: number;
  orders: number;
  paid: number;
  revenue: number;
  watch_to_edit_pct: number | null;
  watch_to_paid_pct: number | null;
}

interface FunnelData {
  days: number;
  funnel: FunnelStage[];
  drop_offs: DropOffs;
  paying_customers: number;
  templates: FunnelTemplateRow[];
}

const RANGES = [
  { days: 7, label: "7 Days" },
  { days: 30, label: "30 Days" },
  { days: 90, label: "90 Days" },
  { days: 365, label: "1 Year" },
];

type SortKey = "preview_10s" | "editor_opens" | "customization_complete" | "paid" | "watch_to_paid_pct";

function formatCurrency(paise: number): string {
  return "₹" + (paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 0 });
}

/** Change from the stage above, which is the number that actually points at a
 *  problem — a stage can look healthy in absolute terms while losing most of
 *  the people who reached the one before it.
 *
 *  The stages are NOT strictly nested, so this can legitimately be positive:
 *  a visitor arriving on a shared /editor link plays a preview without ever
 *  clicking a template card, which makes "Started a preview" wider than
 *  "Opened a template". Growth is shown as growth rather than as a negative
 *  loss, because reading "−−51%" tells nobody anything. */
function stepChange(stages: FunnelStage[], i: number): number | null {
  if (i === 0) return null;
  const prev = stages[i - 1].actors;
  if (prev === 0) return null;
  return Math.round((stages[i].actors / prev - 1) * 100);
}

export default function FunnelAnalytics() {
  const [data, setData] = useState<FunnelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [sortBy, setSortBy] = useState<SortKey>("preview_10s");
  const [search, setSearch] = useState("");
  const [hidePublishedOnly, setHidePublishedOnly] = useState(false);

  useEffect(() => {
    setLoading(true);
    client
      .get<FunnelData>(`/admin/analytics/funnel?days=${days}`)
      .then((r) => setData(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [days]);

  const rows = useMemo(() => {
    if (!data) return [];
    let list = data.templates;
    if (hidePublishedOnly) list = list.filter((t) => t.is_published);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((t) => t.name.toLowerCase().includes(q) || t.slug.toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => (b[sortBy] ?? -1) - (a[sortBy] ?? -1));
  }, [data, sortBy, search, hidePublishedOnly]);

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

  if (!data) return <p className="text-red-500">Failed to load funnel analytics.</p>;

  const watched10s = data.funnel.find((f) => f.event === "preview_10s")?.actors ?? 0;
  const paid = data.funnel.find((f) => f.event === "payment_paid")?.actors ?? 0;

  return (
    <div className="space-y-6">
      {/* Range */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-[11px] text-ink-muted max-w-xl">
          Every number below counts <span className="font-medium text-ink">people</span>, not clicks —
          signed-in visitors by account, everyone else by a per-browser id. One person replaying a
          preview five times is one interested visitor.
        </p>
        <div className="flex gap-1 bg-surface-alt rounded-lg p-1">
          {RANGES.map((r) => (
            <button
              key={r.days}
              onClick={() => setDays(r.days)}
              className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition ${
                days === r.days ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* The four numbers worth acting on */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card p-5">
          <p className="text-[11px] font-medium text-ink-muted uppercase tracking-wider mb-2">
            Watched 10s+ of a preview
          </p>
          <p className="text-2xl font-bold text-ink">{watched10s}</p>
          <p className="text-[11px] text-ink-muted mt-1.5">People who saw enough to have an opinion</p>
        </div>
        <div className="card p-5">
          <p className="text-[11px] font-medium text-ink-muted uppercase tracking-wider mb-2">
            Filled everything in, never checked out
          </p>
          <p className="text-2xl font-bold text-amber-600">{data.drop_offs.filled_in_but_no_checkout}</p>
          <p className="text-[11px] text-ink-muted mt-1.5">Highest-intent traffic on the site</p>
        </div>
        <div className="card p-5">
          <p className="text-[11px] font-medium text-ink-muted uppercase tracking-wider mb-2">
            Stopped at the login wall
          </p>
          <p className="text-2xl font-bold text-amber-600">{data.drop_offs.blocked_at_login}</p>
          <p className="text-[11px] text-ink-muted mt-1.5">A signup-friction problem, not a pricing one</p>
        </div>
        <div className="card p-5">
          <p className="text-[11px] font-medium text-ink-muted uppercase tracking-wider mb-2">
            Ordered, never paid
          </p>
          <p className="text-2xl font-bold text-red-500">{data.drop_offs.ordered_but_unpaid}</p>
          <p className="text-[11px] text-ink-muted mt-1.5">
            {formatCurrency(data.drop_offs.ordered_but_unpaid_value)} left in Razorpay
          </p>
        </div>
      </div>

      {/* Funnel */}
      <div className="card p-5">
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-sm font-semibold text-ink">Funnel — last {data.days} days</h2>
          <p className="text-[11px] text-ink-muted">
            {watched10s > 0 && (
              <>
                {((paid / watched10s) * 100).toFixed(1)}% of people who watched 10s+ ended up paying
              </>
            )}
          </p>
        </div>
        <div className="space-y-1.5">
          {data.funnel.map((stage, i) => {
            const change = stepChange(data.funnel, i);
            return (
              <div key={stage.event} className="flex items-center gap-3">
                <span className="w-52 shrink-0 text-xs text-ink-muted">{stage.label}</span>
                <div className="flex-1 h-7 bg-surface-alt rounded-md overflow-hidden relative min-w-0">
                  <div
                    className="h-full bg-brand-400/70 rounded-md transition-all duration-500"
                    style={{ width: `${Math.max(stage.pct_of_top, stage.actors > 0 ? 2 : 0)}%` }}
                  />
                  <span className="absolute inset-y-0 left-2 flex items-center text-[11px] font-medium text-ink tabular-nums">
                    {stage.actors}
                  </span>
                </div>
                <span className="w-14 shrink-0 text-right text-[11px] text-ink-muted tabular-nums">
                  {stage.pct_of_top}%
                </span>
                <span
                  className={`w-20 shrink-0 text-right text-[11px] tabular-nums ${
                    change !== null && change <= -50 ? "text-red-500 font-medium" : "text-ink-muted"
                  }`}
                  title={
                    change !== null && change > 0
                      ? "More people than the stage above — these arrived deeper in, on a shared link"
                      : "Share of the previous stage lost here"
                  }
                >
                  {change === null ? "" : change > 0 ? `+${change}%` : `−${Math.abs(change)}%`}
                </span>
              </div>
            );
          })}
        </div>
        <p className="text-[11px] text-ink-muted mt-4">
          The last two stages come from the payments table, not from tracking — a Razorpay order is
          the record of itself. Everything above them is first-party event data, so an ad blocker
          can't hide it the way it hides Google Analytics.
        </p>
      </div>

      {/* Per template */}
      <div className="card overflow-hidden">
        <div className="p-4 border-b border-edge flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-sm font-semibold text-ink">Which template earns its attention</h2>
            <p className="text-[11px] text-ink-muted mt-0.5">
              Sort by <span className="font-medium">Watch→Paid</span> to find where ad spend converts;
              a template with many 10s watches and a low rate is a good ad and a weak product.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-[11px] text-ink-muted cursor-pointer">
              <input
                type="checkbox"
                checked={hidePublishedOnly}
                onChange={(e) => setHidePublishedOnly(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-slate-300"
              />
              Published only
            </label>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search templates..."
              className="input-field text-xs w-44"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-surface-alt text-ink-muted">
              <tr>
                <th className="text-left font-medium px-4 py-2.5">Template</th>
                {(
                  [
                    ["preview_10s", "Watched 10s+"],
                    ["editor_opens", "Opened editor"],
                    ["customization_complete", "Filled in"],
                    ["paid", "Paid"],
                    ["watch_to_paid_pct", "Watch→Paid"],
                  ] as [SortKey, string][]
                ).map(([key, label]) => (
                  <th key={key} className="text-right font-medium px-3 py-2.5">
                    <button
                      onClick={() => setSortBy(key)}
                      className={`hover:text-ink transition ${sortBy === key ? "text-ink font-semibold" : ""}`}
                    >
                      {label}
                    </button>
                  </th>
                ))}
                <th className="text-right font-medium px-4 py-2.5">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.template_id} className="border-t border-edge hover:bg-surface-alt/60">
                  <td className="px-4 py-2.5">
                    <span className="text-ink font-medium">{t.name}</span>
                    {!t.is_published && (
                      <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-surface-alt text-ink-muted">
                        draft
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-ink">{t.preview_10s}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-ink-muted">{t.editor_opens}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-ink-muted">
                    {t.customization_complete}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-ink">{t.paid}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {t.watch_to_paid_pct === null ? (
                      <span className="text-ink-muted">—</span>
                    ) : (
                      <span
                        className={
                          t.watch_to_paid_pct >= 10
                            ? "text-green-600 font-medium"
                            : t.watch_to_paid_pct > 0
                              ? "text-ink"
                              : "text-red-500"
                        }
                      >
                        {t.watch_to_paid_pct}%
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-ink">
                    {formatCurrency(t.revenue)}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-ink-muted">
                    No activity recorded in this window yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
