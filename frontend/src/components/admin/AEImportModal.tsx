import { useRef, useState } from "react";
import { createTextBlock, previewAeImport } from "@/api/admin";
import type { AEImportPreviewLayer, AEImportPreviewResponse, TextBlock } from "@/types";

interface Props {
  templateId: string;
  sortOrderStart: number;
  onClose: () => void;
  onImported: (blocks: TextBlock[]) => void;
}

/**
 * Import from After Effects: upload the JSON manifest produced by
 * scripts/ae-export/export_text_layers.jsx, review the proposed blocks
 * (font/position/timing only — no animation), then create the accepted
 * ones as real text_blocks. Font is matched by name against our library;
 * unmatched fonts stay unset and can be picked manually after import.
 */
export default function AEImportModal({ templateId, sortOrderStart, onClose, onImported }: Props) {
  const [preview, setPreview] = useState<AEImportPreviewResponse | null>(null);
  const [checked, setChecked] = useState<boolean[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setError("");
    setLoading(true);
    try {
      const text = await file.text();
      let manifest: unknown;
      try {
        manifest = JSON.parse(text);
      } catch {
        throw new Error("That file isn't valid JSON — make sure it's the export from export_text_layers.jsx");
      }
      const result = await previewAeImport(templateId, manifest);
      setPreview(result);
      setChecked(result.layers.map(() => true));
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || "Failed to read export file");
    } finally {
      setLoading(false);
    }
  };

  const toggleRow = (i: number) => {
    setChecked((prev) => prev.map((c, idx) => (idx === i ? !c : c)));
  };

  const handleImport = async () => {
    if (!preview) return;
    const rows = preview.layers.filter((_, i) => checked[i]);
    if (rows.length === 0) return;

    setImporting(true);
    setError("");
    try {
      const created: TextBlock[] = [];
      let sortOrder = sortOrderStart;
      for (const row of rows) {
        const block = await createTextBlock(templateId, {
          content: row.name,
          sort_order: sortOrder++,
          position_x: row.position_x,
          position_y: row.position_y,
          max_width: 0.8,
          font_id: row.matched_font_id,
          font_size_ratio: row.font_size_ratio,
          text_color: "#FFFFFF",
          text_align: "center",
          animation_type: "none",
          animation_out: "none",
          anim_in_direction: "ltr",
          anim_out_direction: "ltr",
          anim_in_duration: 1.0,
          anim_out_duration: 1.0,
          start_time: row.start_time,
          end_time: row.end_time,
        });
        created.push(block);
      }
      onImported(created);
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Failed to create one or more blocks");
    } finally {
      setImporting(false);
    }
  };

  const matchedCount = preview ? preview.layers.filter((l) => l.matched_font_id).length : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-semibold text-slate-800">Import from After Effects</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Font, position, and start/stop time only — animation stays manual.
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {!preview ? (
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={loading}
                className="w-full border-2 border-dashed border-slate-200 rounded-xl py-10 flex flex-col items-center gap-2 hover:border-primary-300 hover:bg-primary-50/30 transition-colors disabled:opacity-50"
              >
                <svg className="w-8 h-8 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
                <span className="text-sm text-slate-500">
                  {loading ? "Reading export…" : "Click to select the exported .json file"}
                </span>
              </button>
              <p className="text-[11px] text-slate-400 mt-3">
                In After Effects: File &gt; Scripts &gt; Run Script File… &gt;{" "}
                <code className="bg-slate-100 px-1 py-0.5 rounded">scripts/ae-export/export_text_layers.jsx</code>
              </p>
              {error && <p className="text-red-500 text-sm mt-3">{error}</p>}
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm text-slate-600">
                  <span className="font-medium">{preview.comp_name}</span>
                  <span className="text-slate-400"> · {preview.layers.length} text layer(s) · {matchedCount} font(s) matched</span>
                </p>
                <button
                  onClick={() => { setPreview(null); setChecked([]); }}
                  className="text-xs text-primary-500 hover:underline"
                >
                  Choose a different file
                </button>
              </div>

              <div className="border border-slate-100 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-500 text-xs">
                    <tr>
                      <th className="px-3 py-2 text-left w-8"></th>
                      <th className="px-3 py-2 text-left">Layer</th>
                      <th className="px-3 py-2 text-left">Font</th>
                      <th className="px-3 py-2 text-left">Position</th>
                      <th className="px-3 py-2 text-left">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.layers.map((row: AEImportPreviewLayer, i: number) => (
                      <tr key={i} className="border-t border-slate-100">
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={checked[i] ?? true}
                            onChange={() => toggleRow(i)}
                            className="accent-primary-500"
                          />
                        </td>
                        <td className="px-3 py-2 text-slate-700">{row.name}</td>
                        <td className="px-3 py-2">
                          {row.matched_font_id ? (
                            <span className="text-slate-600">{row.matched_font_name}</span>
                          ) : (
                            <span className="text-amber-600 text-xs" title={`Requested: ${row.requested_font}`}>
                              Not found — pick manually
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-slate-500 text-xs">
                          {(row.position_x * 100).toFixed(0)}%, {(row.position_y * 100).toFixed(0)}%
                        </td>
                        <td className="px-3 py-2 text-slate-500 text-xs">
                          {row.start_time.toFixed(1)}–{row.end_time.toFixed(1)}s
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="text-[11px] text-slate-400 mt-3">
                Position is AE's layer anchor point, not guaranteed pixel-exact against this template's
                alignment — nudge into place after import if needed. Unmatched fonts import with no font
                set; pick one afterward in the block's Styling section.
              </p>

              {error && <p className="text-red-500 text-sm mt-3">{error}</p>}
            </div>
          )}
        </div>

        {preview && (
          <div className="px-5 py-4 border-t border-slate-100 flex justify-end gap-2">
            <button onClick={onClose} className="btn-secondary text-sm">
              Cancel
            </button>
            <button
              onClick={handleImport}
              disabled={importing || checked.filter(Boolean).length === 0}
              className="btn-primary text-sm disabled:opacity-50"
            >
              {importing
                ? "Importing…"
                : `Import ${checked.filter(Boolean).length} block${checked.filter(Boolean).length === 1 ? "" : "s"}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
