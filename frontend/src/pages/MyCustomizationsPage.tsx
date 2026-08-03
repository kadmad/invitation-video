import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { listDrafts, deleteDraft, type DraftListItem } from "@/api/drafts";
import { useEditorStore } from "@/store/editorStore";
import PageTransition from "@/components/common/PageTransition";

function humanizeTag(tag: string): string {
  return tag
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function MyCustomizationsPage() {
  const [drafts, setDrafts] = useState<DraftListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { setPrefill } = useEditorStore();

  useEffect(() => {
    listDrafts()
      .then(setDrafts)
      .finally(() => setLoading(false));
  }, []);

  const handleResume = (draft: DraftListItem) => {
    setPrefill({
      fieldValues: draft.field_values,
      fontId: draft.font_id,
      textColorOverrides: draft.text_color_override,
    });
    navigate(`/editor/${draft.template_slug}`);
  };

  const handleDelete = async (templateId: string) => {
    if (!confirm("Remove this saved customization?")) return;
    await deleteDraft(templateId);
    setDrafts((prev) => prev.filter((d) => d.template_id !== templateId));
  };

  if (loading) return <div className="text-center py-12">Loading...</div>;

  return (
    <PageTransition>
    <div>
      <h1 className="text-3xl font-bold text-slate-900 mb-2">My Customizations</h1>
      <p className="text-slate-500 mb-6">Your saved work-in-progress templates</p>

      {drafts.length === 0 ? (
        <div className="text-center py-12 text-slate-500">
          <p>No saved customizations yet.</p>
          <Link
            to="/templates"
            className="text-primary-500 hover:underline mt-2 inline-block"
          >
            Browse templates to get started
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {drafts.map((draft) => (
            <div
              key={draft.template_id}
              className="card p-6"
            >
              <div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-lg text-slate-900">
                    {draft.template_name}
                  </h3>
                  <p className="text-sm text-slate-400 mt-1">
                    Last edited: {new Date(draft.updated_at).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {Object.entries(draft.field_values)
                      .filter(([, v]) => v.trim())
                      .map(([key, value]) => (
                        <span
                          key={key}
                          className="inline-flex items-center bg-slate-50 border border-slate-100 rounded-full px-3 py-1 text-sm"
                        >
                          <span className="text-slate-400 mr-1">{humanizeTag(key)}:</span>
                          <span className="text-slate-800 font-medium break-all">{value}</span>
                        </span>
                      ))}
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-4">
                  <button
                    onClick={() => handleResume(draft)}
                    className="btn-primary text-sm"
                  >
                    Continue Editing
                  </button>
                  <button
                    onClick={() => handleDelete(draft.template_id)}
                    className="text-red-400 hover:text-red-600 text-sm px-2 py-2 transition-colors"
                    title="Remove"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
    </PageTransition>
  );
}
