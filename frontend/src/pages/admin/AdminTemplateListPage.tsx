import { useEffect, useRef, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  listAdminTemplates,
  createTemplate,
  deleteTemplate,
  listAdminCategories,
  getTemplateVideoUrl,
} from "@/api/admin";
import ConfirmModal from "@/components/admin/ConfirmModal";
import type { Template, Category } from "@/types";

const PER_PAGE = 12;
const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000/api";

/* ── Shared video URL cache ── */
interface CachedUrl { url: string; fetchedAt: number }
const adminVideoCache = new Map<string, CachedUrl>();
const adminInflight = new Map<string, Promise<string>>();

async function getCachedVideoUrl(templateId: string): Promise<string> {
  const cached = adminVideoCache.get(templateId);
  const now = Date.now();
  // Cache valid for 5 minutes
  if (cached && now - cached.fetchedAt < 5 * 60 * 1000) return cached.url;

  const pending = adminInflight.get(templateId);
  if (pending) return pending;

  const promise = (async () => {
    const url = await getTemplateVideoUrl(templateId);
    adminVideoCache.set(templateId, { url, fetchedAt: Date.now() });
    adminInflight.delete(templateId);
    return url;
  })();
  adminInflight.set(templateId, promise);
  return promise;
}

interface CreateForm {
  name: string;
  slug: string;
  category_id: string;
}

type StatusFilter = "all" | "published" | "draft";

/* ── Admin Template Card (video preview like user-facing) ─────────── */
function AdminTemplateCard({
  template: t,
  category,
  index,
  onDelete,
}: {
  template: Template;
  category?: Category;
  index: number;
  onDelete: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [videoReady, setVideoReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const hoveredRef = useRef(false);

  // Prefetch video URL when card enters viewport
  useEffect(() => {
    if (!t.video_key || !cardRef.current) return;
    const el = cardRef.current;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          getCachedVideoUrl(t.id).then(setVideoSrc).catch(() => {});
          observer.disconnect();
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [t.id, t.video_key]);

  const startPreview = useCallback(async () => {
    hoveredRef.current = true;
    setHovered(true);
    if (!t.video_key) return;
    if (videoSrc && videoReady) {
      videoRef.current?.play().catch(() => {});
      return;
    }
    try {
      const url = await getCachedVideoUrl(t.id);
      if (!hoveredRef.current) return;
      setVideoSrc(url);
    } catch { /* ignore */ }
  }, [t.id, t.video_key, videoSrc, videoReady]);

  const stopPreview = useCallback(() => {
    hoveredRef.current = false;
    setHovered(false);
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  }, []);

  return (
    <div
      ref={cardRef}
      className="card overflow-hidden group relative opacity-0 animate-slide-up"
      style={{ animationDelay: `${Math.min(index * 50, 300)}ms`, animationFillMode: "forwards" }}
      onMouseEnter={startPreview}
      onMouseLeave={stopPreview}
    >
      <Link to={`/admin/templates/${t.id}`} className="block">
        {/* Thumbnail / video preview */}
        <div className="relative aspect-[9/16] bg-slate-100 overflow-hidden">
          {t.thumbnail_key ? (
            <img
              src={`${BASE_URL}/templates/${t.slug}/thumbnail`}
              alt={t.name}
              loading="lazy"
              draggable={false}
              className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-200 pointer-events-none ${
                hovered && videoReady ? "opacity-0" : "opacity-100"
              }`}
            />
          ) : (
            <div className={`absolute inset-0 flex items-center justify-center text-slate-300 transition-opacity duration-200 ${
              hovered && videoReady ? "opacity-0" : "opacity-100"
            }`}>
              <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
          )}

          {t.video_key && videoSrc && (
            <video
              ref={videoRef}
              src={videoSrc}
              muted
              loop
              playsInline
              preload="metadata"
              controlsList="nodownload nofullscreen noremoteplayback"
              disablePictureInPicture
              onContextMenu={(e) => e.preventDefault()}
              onLoadedData={() => setVideoReady(true)}
              onCanPlay={() => {
                setVideoReady(true);
                if (hoveredRef.current) videoRef.current?.play().catch(() => {});
              }}
              className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-200 pointer-events-none ${
                hovered && videoReady ? "opacity-100" : "opacity-0"
              }`}
            />
          )}

          {/* Hover veil */}
          <div className={`absolute inset-0 bg-black transition-opacity duration-200 pointer-events-none z-[5] ${
            hovered && videoReady ? "opacity-30" : "opacity-0"
          }`} />

          {/* Edit CTA */}
          <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-10">
            <span className="btn-primary text-sm pointer-events-none">Edit Template</span>
          </div>
        </div>

        {/* Info */}
        <div className="p-4">
          <h3 className="font-semibold text-base text-slate-900">{t.name}</h3>
          <p className="text-sm text-slate-500 mt-0.5">{t.slug}</p>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
              t.is_published ? "bg-accent-50 text-accent-700" : "bg-amber-50 text-amber-700"
            }`}>
              {t.is_published ? "Published" : "Draft"}
            </span>
            <span className="flex items-center gap-1">
              <span className={`inline-block w-2 h-2 rounded-full ${t.video_key ? "bg-green-500" : "bg-slate-300"}`} />
              <span className="text-xs text-slate-500">{t.video_key ? "Video" : "No video"}</span>
            </span>
            {category && (
              <span className="bg-primary-50 text-primary-600 rounded-full px-2 py-0.5 text-xs font-medium">
                {category.name}
              </span>
            )}
            <span className="text-xs text-slate-400">
              {t.duration_frames && t.fps ? `${(t.duration_frames / t.fps).toFixed(0)}s` : ""} {t.width}x{t.height}
            </span>
          </div>
        </div>
      </Link>

      {/* Delete button */}
      <button
        onClick={(e) => { e.preventDefault(); onDelete(); }}
        className="absolute top-2 right-2 p-1.5 rounded-lg bg-white/80 text-red-400 hover:text-red-600 hover:bg-white opacity-0 group-hover:opacity-100 transition shadow-sm z-20"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
        </svg>
      </button>
    </div>
  );
}

/* ── Pagination ───────────────────────────────────────────────────── */
function Pagination({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (p: number) => void;
}) {
  if (totalPages <= 1) return null;

  const pages: (number | "...")[] = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || Math.abs(i - page) <= 1) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== "...") {
      pages.push("...");
    }
  }

  return (
    <div className="flex items-center justify-center gap-1 mt-8">
      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page === 1}
        className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50"
      >
        Prev
      </button>
      {pages.map((p, i) =>
        p === "..." ? (
          <span key={`dots-${i}`} className="px-2 text-slate-400">...</span>
        ) : (
          <button
            key={p}
            onClick={() => onPageChange(p)}
            className={`px-3 py-1.5 text-sm rounded-lg border ${
              p === page
                ? "bg-primary-500 text-white border-primary-500"
                : "border-slate-200 hover:bg-slate-50"
            }`}
          >
            {p}
          </button>
        ),
      )}
      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page === totalPages}
        className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50"
      >
        Next
      </button>
    </div>
  );
}

/* ── Main Page ────────────────────────────────────────────────────── */
export default function AdminTemplateListPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<CreateForm>({ name: "", slug: "", category_id: "" });
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [page, setPage] = useState(1);

  const load = (isInitial = false) => {
    if (isInitial) setLoading(true);
    Promise.all([listAdminTemplates(), listAdminCategories()])
      .then(([t, c]) => {
        setTemplates(t);
        setCategories(c);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(true); }, []);

  const filtered = templates.filter((t) => {
    const matchesSearch =
      !search ||
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.slug.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = !categoryFilter || t.category_id === categoryFilter;
    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "published" && t.is_published) ||
      (statusFilter === "draft" && !t.is_published);
    return matchesSearch && matchesCategory && matchesStatus;
  });

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [search, categoryFilter, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const autoSlug = (name: string) =>
    name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await createTemplate(form);
      setShowCreate(false);
      setForm({ name: "", slug: "", category_id: "" });
      load();
    } catch (err) {
      console.error("Failed to create template", err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteTemplate(deleteTarget.id);
      setDeleteTarget(null);
      load();
    } catch (err) {
      console.error("Failed to delete template", err);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Templates</h1>
        <button onClick={() => setShowCreate(true)} className="btn-primary text-sm">
          Create Template
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="text"
            placeholder="Search by name or slug..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-field w-full pl-9 text-sm"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="input-field text-sm"
        >
          <option value="">All Categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <div className="flex rounded-xl border border-slate-200 overflow-hidden">
          {(["all", "published", "draft"] as StatusFilter[]).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-2 text-sm font-medium transition ${
                statusFilter === s
                  ? "bg-primary-500 text-white"
                  : "bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="card p-6 mb-6 space-y-4 animate-slide-up">
          <h2 className="font-semibold text-lg text-slate-900">New Template</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => {
                  const name = e.target.value;
                  setForm((f) => ({ ...f, name, slug: autoSlug(name) }));
                }}
                className="input-field w-full"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Slug</label>
              <input
                type="text"
                value={form.slug}
                onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                className="input-field w-full"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
              <select
                value={form.category_id}
                onChange={(e) => setForm((f) => ({ ...f, category_id: e.target.value }))}
                className="input-field w-full"
                required
              >
                <option value="">Select...</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="btn-primary text-sm disabled:opacity-50">
              {saving ? "Creating..." : "Create"}
            </button>
            <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary text-sm">
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="card overflow-hidden skeleton">
              <div className="aspect-[9/16] bg-slate-200" />
              <div className="p-4 space-y-2">
                <div className="h-5 w-32 bg-slate-200 rounded" />
                <div className="h-4 w-24 bg-slate-100 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <svg className="w-12 h-12 text-slate-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h1.5C5.496 19.5 6 18.996 6 18.375m-2.625 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-1.5A1.125 1.125 0 0118 18.375" />
          </svg>
          <p className="text-slate-500 font-medium">
            {search || categoryFilter || statusFilter !== "all"
              ? "No templates match your filters"
              : "No templates yet"}
          </p>
          {!search && !categoryFilter && statusFilter === "all" && (
            <p className="text-sm text-slate-400 mt-1">Create your first template to get started</p>
          )}
        </div>
      ) : (
        <>
          <p className="text-sm text-slate-400 mb-3">{filtered.length} template{filtered.length !== 1 ? "s" : ""}</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
            {paginated.map((t, i) => {
              const category = categories.find((c) => c.id === t.category_id);
              return (
                <AdminTemplateCard
                  key={t.id}
                  template={t}
                  category={category}
                  index={i}
                  onDelete={() => setDeleteTarget({ id: t.id, name: t.name })}
                />
              );
            })}
          </div>
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </>
      )}

      <ConfirmModal
        open={!!deleteTarget}
        title="Delete Template"
        message={`Are you sure you want to delete "${deleteTarget?.name}"? This action cannot be undone.`}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
