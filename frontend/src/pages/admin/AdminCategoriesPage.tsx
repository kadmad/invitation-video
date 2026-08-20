import { useEffect, useState } from "react";
import {
  listAdminCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} from "@/api/admin";
import ConfirmModal from "@/components/admin/ConfirmModal";
import Toggle from "@/components/common/Toggle";
import type { Category } from "@/types";
import { toast, errorMessage } from "@/store/toastStore";

interface CategoryForm {
  name: string;
  slug: string;
  sort_order: number;
  is_active: boolean;
}

const emptyForm: CategoryForm = {
  name: "",
  slug: "",
  sort_order: 0,
  is_active: true,
};

export default function AdminCategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CategoryForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [initialLoad, setInitialLoad] = useState(true);

  const load = (isInitial = false) => {
    if (isInitial) setLoading(true);
    listAdminCategories()
      .then(setCategories)
      .finally(() => {
        setLoading(false);
        setInitialLoad(false);
      });
  };

  useEffect(() => {
    load(true);
  }, []);

  const filtered = categories.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(true);
  };

  const openEdit = (cat: Category) => {
    setEditingId(cat.id);
    setForm({
      name: cat.name,
      slug: cat.slug,
      sort_order: cat.sort_order,
      is_active: cat.is_active,
    });
    setShowForm(true);
  };

  const cancel = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingId) {
        await updateCategory(editingId, form);
      } else {
        await createCategory(form);
      }
      cancel();
      load();
    } catch (err) {
      console.error("Failed to save category", err);
      toast.error(errorMessage(err, "Failed to save category"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteCategory(deleteTarget.id);
      setDeleteTarget(null);
      load();
    } catch (err) {
      console.error("Failed to delete category", err);
      toast.error(errorMessage(err, "Failed to delete category"));
    }
  };

  const handleToggleActive = async (cat: Category) => {
    const newValue = !cat.is_active;
    // Optimistic update — no reload, no flicker
    setCategories((prev) =>
      prev.map((c) => (c.id === cat.id ? { ...c, is_active: newValue } : c))
    );
    try {
      await updateCategory(cat.id, { is_active: newValue });
    } catch (err) {
      // Revert on failure
      setCategories((prev) =>
        prev.map((c) => (c.id === cat.id ? { ...c, is_active: !newValue } : c))
      );
      console.error("Failed to toggle category", err);
      toast.error(errorMessage(err, "Failed to update category"));
    }
  };

  const autoSlug = (name: string) =>
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-ink">Categories</h1>
        <button onClick={openAdd} className="btn-primary text-sm">
          Add Category
        </button>
      </div>

      {/* Search */}
      <div className="mb-4">
        <div className="relative max-w-sm">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="text"
            placeholder="Search categories..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-field w-full pl-9 text-sm"
          />
        </div>
      </div>

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="card p-6 mb-6 space-y-4 animate-slide-up"
        >
          <h2 className="font-semibold text-lg text-ink">
            {editingId ? "Edit Category" : "New Category"}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-ink mb-1">Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => {
                  const name = e.target.value;
                  setForm((f) => ({
                    ...f,
                    name,
                    slug: editingId ? f.slug : autoSlug(name),
                  }));
                }}
                className="input-field w-full"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink mb-1">Slug</label>
              <input
                type="text"
                value={form.slug}
                onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                className="input-field w-full"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink mb-1">Sort Order</label>
              <input
                type="number"
                value={form.sort_order}
                onChange={(e) =>
                  setForm((f) => ({ ...f, sort_order: parseInt(e.target.value) || 0 }))
                }
                className="input-field w-full"
              />
            </div>
            <div className="flex items-center gap-2 pt-6">
              <input
                type="checkbox"
                id="is_active"
                checked={form.is_active}
                onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
              />
              <label htmlFor="is_active" className="text-sm text-ink">Active</label>
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="btn-primary text-sm disabled:opacity-50">
              {saving ? "Saving..." : editingId ? "Update" : "Create"}
            </button>
            <button type="button" onClick={cancel} className="btn-secondary text-sm">
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card p-4 skeleton">
              <div className="h-4 w-32 bg-slate-200 rounded" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <svg className="w-12 h-12 text-slate-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" />
          </svg>
          <p className="text-ink-muted font-medium">
            {search ? "No categories match your search" : "No categories yet"}
          </p>
          {!search && (
            <p className="text-sm text-ink-muted mt-1">Create your first category to get started</p>
          )}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-surface-alt border-b border-edge">
              <tr>
                <th className="px-4 py-3 text-sm font-medium text-ink-muted">Name</th>
                <th className="px-4 py-3 text-sm font-medium text-ink-muted">Slug</th>
                <th className="px-4 py-3 text-sm font-medium text-ink-muted">Sort Order</th>
                <th className="px-4 py-3 text-sm font-medium text-ink-muted">Active</th>
                <th className="px-4 py-3 text-sm font-medium text-ink-muted">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-edge">
              {filtered.map((cat, i) => (
                <tr
                  key={cat.id}
                  className={`hover:bg-surface-alt transition ${initialLoad ? "opacity-0 animate-slide-up" : ""}`}
                  style={initialLoad ? { animationDelay: `${Math.min(i * 50, 300)}ms`, animationFillMode: "forwards" } : undefined}
                >
                  <td className="px-4 py-3 text-sm font-medium text-ink">{cat.name}</td>
                  <td className="px-4 py-3 text-sm text-ink-muted">{cat.slug}</td>
                  <td className="px-4 py-3 text-sm text-ink-muted">{cat.sort_order}</td>
                  <td className="px-4 py-3">
                    <Toggle
                      checked={cat.is_active}
                      onChange={() => handleToggleActive(cat)}
                      size="sm"
                    />
                  </td>
                  <td className="px-4 py-3 text-sm space-x-2">
                    <button
                      onClick={() => openEdit(cat)}
                      className="text-primary-500 hover:text-primary-700 font-medium"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => setDeleteTarget({ id: cat.id, name: cat.name })}
                      className="text-red-500 hover:text-red-700 font-medium"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmModal
        open={!!deleteTarget}
        title="Delete Category"
        message={`Are you sure you want to delete "${deleteTarget?.name}"? This action cannot be undone.`}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
