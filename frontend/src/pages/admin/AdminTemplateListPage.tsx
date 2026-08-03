import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  listAdminTemplates,
  createTemplate,
  deleteTemplate,
  listAdminCategories,
} from "@/api/admin";
import ConfirmModal from "@/components/admin/ConfirmModal";
import type { Template, Category } from "@/types";

interface CreateForm {
  name: string;
  slug: string;
  category_id: string;
}

type StatusFilter = "all" | "published" | "draft";

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
  const [initialLoad, setInitialLoad] = useState(true);

  const load = (isInitial = false) => {
    if (isInitial) setLoading(true);
    Promise.all([listAdminTemplates(), listAdminCategories()])
      .then(([t, c]) => {
        setTemplates(t);
        setCategories(c);
      })
      .finally(() => {
        setLoading(false);
        setInitialLoad(false);
      });
  };

  useEffect(() => {
    load(true);
  }, []);

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

  const autoSlug = (name: string) =>
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");

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
        <form
          onSubmit={handleCreate}
          className="card p-6 mb-6 space-y-4 animate-slide-up"
        >
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card overflow-hidden skeleton">
              <div className="aspect-video bg-slate-200" />
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((t, i) => (
            <div
              key={t.id}
              className={`card overflow-hidden group relative ${initialLoad ? "opacity-0 animate-slide-up" : ""}`}
              style={initialLoad ? { animationDelay: `${Math.min(i * 50, 300)}ms`, animationFillMode: "forwards" } : undefined}
            >
              <Link to={`/admin/templates/${t.id}`} className="block">
                <div className="aspect-video bg-slate-100 rounded-t-2xl flex items-center justify-center text-slate-400">
                  {t.video_key ? (
                    <span className="text-sm text-green-600 font-medium">Video uploaded</span>
                  ) : (
                    <span className="text-sm text-slate-400">No video</span>
                  )}
                </div>
                <div className="p-4">
                  <h3 className="font-semibold text-base text-slate-900">{t.name}</h3>
                  <p className="text-sm text-slate-500 mt-1">{t.slug}</p>
                  <div className="flex items-center gap-2 mt-3">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                      t.is_published ? "bg-accent-50 text-accent-700" : "bg-amber-50 text-amber-700"
                    }`}>
                      {t.is_published ? "Published" : "Draft"}
                    </span>
                    <span className="flex items-center gap-1">
                      <span className={`inline-block w-2 h-2 rounded-full ${t.video_key ? "bg-green-500" : "bg-slate-300"}`} />
                      <span className="text-xs text-slate-500">{t.video_key ? "Video" : "No video"}</span>
                    </span>
                    {(t.text_blocks?.length ?? 0) > 0 && (
                      <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                        {t.text_blocks.length} block{t.text_blocks.length !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
              <button
                onClick={() => setDeleteTarget({ id: t.id, name: t.name })}
                className="absolute top-2 right-2 p-1.5 rounded-lg bg-white/80 text-red-400 hover:text-red-600 hover:bg-white opacity-0 group-hover:opacity-100 transition shadow-sm"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                </svg>
              </button>
            </div>
          ))}
        </div>
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
