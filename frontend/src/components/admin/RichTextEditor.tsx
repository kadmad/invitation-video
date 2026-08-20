import { useState, useRef, useCallback, useEffect, useMemo, useLayoutEffect } from "react";
import type { FormatRange } from "@/types";

interface RichTextEditorProps {
  content: string;
  formatRanges: FormatRange[] | null;
  onChange: (content: string, formatRanges: FormatRange[]) => void;
  tagKeys?: string[];
  showLabel?: boolean;
}

interface Segment {
  text: string;
  start: number;
  end: number;
  bold?: boolean;
  italic?: boolean;
  superscript?: boolean;
  color?: string;
  stroke_color?: string;
  stroke_width?: number;
  isTag: boolean;
}

const PRESET_COLORS = [
  "#FFFFFF", "#000000", "#F5F5F5", "#9E9E9E",
  "#FF0000", "#E91E63", "#FF5722", "#FF9800",
  "#FFD600", "#FFEB3B", "#8BC34A", "#4CAF50",
  "#00BCD4", "#03A9F4", "#2196F3", "#3F51B5",
  "#9C27B0", "#673AB7", "#795548", "#607D8B",
  "#FFD700", "#C0C0C0", "#B87333", "#D4AF37",
];

/** Split content into styled segments based on format ranges */
function buildSegments(content: string, ranges: FormatRange[]): Segment[] {
  if (!content) return [];

  const boundaries = new Set<number>([0, content.length]);

  const tagRegex = /\{(\w+)\}/g;
  let tagMatch;
  const tagSpans: Array<[number, number]> = [];
  while ((tagMatch = tagRegex.exec(content)) !== null) {
    tagSpans.push([tagMatch.index, tagMatch.index + tagMatch[0].length]);
    boundaries.add(tagMatch.index);
    boundaries.add(tagMatch.index + tagMatch[0].length);
  }

  for (const r of ranges) {
    const s = Math.max(0, Math.min(r.start, content.length));
    const e = Math.max(0, Math.min(r.end, content.length));
    boundaries.add(s);
    boundaries.add(e);
  }

  const sorted = Array.from(boundaries).sort((a, b) => a - b);
  const segments: Segment[] = [];

  for (let i = 0; i < sorted.length - 1; i++) {
    const start = sorted[i];
    const end = sorted[i + 1];
    if (start === end) continue;

    const text = content.slice(start, end);
    const isTag = tagSpans.some(([ts, te]) => start >= ts && end <= te);

    let bold: boolean | undefined;
    let italic: boolean | undefined;
    let superscript: boolean | undefined;
    let color: string | undefined;
    let stroke_color: string | undefined;
    let stroke_width: number | undefined;

    for (const r of ranges) {
      if (r.start <= start && r.end >= end) {
        if (r.bold !== undefined) bold = r.bold;
        if (r.italic !== undefined) italic = r.italic;
        if (r.superscript !== undefined) superscript = r.superscript;
        if (r.color !== undefined) color = r.color;
        if (r.stroke_color !== undefined) stroke_color = r.stroke_color;
        if (r.stroke_width !== undefined) stroke_width = r.stroke_width;
      }
    }

    segments.push({ text, start, end, bold, italic, superscript, color, stroke_color, stroke_width, isTag });
  }

  return segments;
}

/** Adjust format ranges after content edit */
function adjustRanges(
  ranges: FormatRange[],
  editStart: number,
  oldLength: number,
  newLength: number,
): FormatRange[] {
  const delta = newLength - oldLength;
  if (delta === 0) return ranges;

  const editEnd = editStart + oldLength;

  return ranges
    .map((r) => {
      let { start, end } = r;

      if (start >= editEnd) {
        start += delta;
        end += delta;
      } else if (end <= editStart) {
        // no change
      } else {
        if (start >= editStart) start = editStart + newLength;
        if (end >= editEnd) end += delta;
        else if (end > editStart) end = editStart + newLength;
      }

      return { ...r, start: Math.max(0, start), end: Math.max(0, end) };
    })
    .filter((r) => r.end > r.start);
}

/** Merge a new format into existing ranges */
function applyFormat(
  ranges: FormatRange[],
  selStart: number,
  selEnd: number,
  format: Partial<Pick<FormatRange, "bold" | "italic" | "superscript" | "color" | "stroke_color" | "stroke_width">>,
): FormatRange[] {
  const newRange: FormatRange = {
    start: selStart,
    end: selEnd,
    ...format,
  };
  return [...ranges, newRange];
}

/** Remove all formatting in a range */
function clearFormat(ranges: FormatRange[], selStart: number, selEnd: number): FormatRange[] {
  const result: FormatRange[] = [];
  for (const r of ranges) {
    if (r.end <= selStart || r.start >= selEnd) {
      result.push(r);
    } else if (r.start < selStart && r.end > selEnd) {
      result.push({ ...r, end: selStart });
      result.push({ ...r, start: selEnd });
    } else if (r.start < selStart) {
      result.push({ ...r, end: selStart });
    } else if (r.end > selEnd) {
      result.push({ ...r, start: selEnd });
    }
  }
  return result;
}

/** Calculate character offset from Range */
function getCaretPositionFromRange(container: HTMLElement, range: Range): number {
  if (!container.contains(range.startContainer)) return 0;
  let pos = 0;

  function walk(node: Node): boolean {
    if (node === range.startContainer) {
      if (node.nodeType === Node.TEXT_NODE) {
        pos += range.startOffset;
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        for (let i = 0; i < range.startOffset && i < node.childNodes.length; i++) {
          const child = node.childNodes[i];
          if (child.nodeType === Node.TEXT_NODE) {
            pos += (child as Text).length;
          } else if (child.nodeType === Node.ELEMENT_NODE) {
            if ((child as HTMLElement).tagName === "BR") {
              pos += 1;
            } else {
              pos += child.textContent?.length || 0;
            }
          }
        }
      }
      return true;
    }

    if (node.nodeType === Node.TEXT_NODE) {
      pos += (node as Text).length;
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      if ((node as HTMLElement).tagName === "BR") {
        pos += 1;
      } else {
        for (let i = 0; i < node.childNodes.length; i++) {
          if (walk(node.childNodes[i])) return true;
        }
      }
    }
    return false;
  }

  walk(container);
  return pos;
}

/** Get character offset of current caret position */
function getCaretPosition(container: HTMLElement): number {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return 0;
  return getCaretPositionFromRange(container, sel.getRangeAt(0));
}

/** Extract plain text content from DOM element including line breaks */
function getContentFromDOM(element: HTMLElement): string {
  if (element.childNodes.length === 1 && (element.firstChild as HTMLElement)?.tagName === "BR") {
    return "";
  }

  let result = "";

  function walk(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) {
      result += node.nodeValue;
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const elem = node as HTMLElement;
      if (elem.tagName === "BR") {
        const parentNode: Node | null = node.parentNode;
        const isLastChild = node === element.lastChild || (parentNode === element.lastChild && node === parentNode?.lastChild);
        if (isLastChild && result.endsWith("\n")) {
          return;
        }
        result += "\n";
      } else if (elem.tagName === "DIV" || elem.tagName === "P") {
        if (result.length > 0 && !result.endsWith("\n")) {
          result += "\n";
        }
        for (let i = 0; i < node.childNodes.length; i++) {
          walk(node.childNodes[i]);
        }
      } else {
        for (let i = 0; i < node.childNodes.length; i++) {
          walk(node.childNodes[i]);
        }
      }
    }
  }

  walk(element);
  return result;
}

/** Find DOM node and offset for target character position */
function getNodeAndOffset(container: HTMLElement, targetOffset: number): { node: Node; offset: number } | null {
  let currentOffset = 0;
  let result: { node: Node; offset: number } | null = null;

  function walk(node: Node): boolean {
    if (node.nodeType === Node.TEXT_NODE) {
      const len = (node as Text).length;
      if (currentOffset + len >= targetOffset) {
        result = { node, offset: Math.max(0, Math.min(targetOffset - currentOffset, len)) };
        return true;
      }
      currentOffset += len;
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const elem = node as HTMLElement;
      if (elem.tagName === "BR") {
        if (currentOffset === targetOffset || currentOffset + 1 === targetOffset) {
          const parent = elem.parentNode || container;
          const idx = Array.from(parent.childNodes).indexOf(elem as ChildNode);
          result = { node: parent, offset: idx + 1 };
          return true;
        }
        currentOffset += 1;
      } else {
        for (let i = 0; i < node.childNodes.length; i++) {
          if (walk(node.childNodes[i])) return true;
        }
      }
    }
    return false;
  }

  walk(container);
  return result;
}

/** Set selection range or collapsed caret */
function setSelectionRange(container: HTMLElement, startOffset: number, endOffset: number) {
  const sel = window.getSelection();
  if (!sel) return;

  const start = getNodeAndOffset(container, startOffset);
  const end = startOffset === endOffset ? start : getNodeAndOffset(container, endOffset);

  if (start) {
    try {
      const range = document.createRange();
      range.setStart(start.node, start.offset);
      if (end) {
        range.setEnd(end.node, end.offset);
      } else {
        range.collapse(true);
      }
      sel.removeAllRanges();
      sel.addRange(range);
    } catch {
      const range = document.createRange();
      range.selectNodeContents(container);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  } else {
    const range = document.createRange();
    range.selectNodeContents(container);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  }
}

export default function RichTextEditor({
  content,
  formatRanges,
  onChange,
  tagKeys = [],
  showLabel = true,
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<{ start: number; end: number } | null>(null);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [customColor, setCustomColor] = useState("#FF0000");
  const [showStrokePicker, setShowStrokePicker] = useState(false);
  const [strokeColor, setStrokeColor] = useState("#000000");
  const [strokeWidth, setStrokeWidth] = useState(1);
  const [showTagMenu, setShowTagMenu] = useState(false);
  const prevContentRef = useRef(content);
  const isComposingRef = useRef(false);
  const pendingCaretRef = useRef<number | null>(null);
  const pendingSelectionRef = useRef<{ start: number; end: number } | null>(null);

  const ranges = useMemo(() => formatRanges ?? [], [formatRanges]);
  const segments = useMemo(() => buildSegments(content, ranges), [content, ranges]);

  // Active formatting at current selection
  const activeFormats = useMemo(() => {
    if (!selection) return { bold: false, italic: false, superscript: false, color: undefined as string | undefined, stroke_color: undefined as string | undefined, stroke_width: undefined as number | undefined };
    let bold = false;
    let italic = false;
    let superscript = false;
    let color: string | undefined;
    let stroke_color: string | undefined;
    let stroke_width: number | undefined;
    for (const r of ranges) {
      if (r.start <= selection.start && r.end >= selection.end) {
        if (r.bold) bold = true;
        if (r.italic) italic = true;
        if (r.superscript) superscript = true;
        if (r.color) color = r.color;
        if (r.stroke_color) stroke_color = r.stroke_color;
        if (r.stroke_width) stroke_width = r.stroke_width;
      }
    }
    return { bold, italic, superscript, color, stroke_color, stroke_width };
  }, [selection, ranges]);

  const hasSelection = selection !== null && selection.start !== selection.end;

  // Convert DOM selection to character offsets
  const getSelectionOffsets = useCallback((): { start: number; end: number } | null => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !editorRef.current) return null;

    const range = sel.getRangeAt(0);
    if (!editorRef.current.contains(range.startContainer)) return null;

    const startRange = range.cloneRange();
    startRange.collapse(true);
    const endRange = range.cloneRange();
    endRange.collapse(false);

    const start = getCaretPositionFromRange(editorRef.current, startRange);
    const end = getCaretPositionFromRange(editorRef.current, endRange);

    if (start === end) return null;
    return { start: Math.min(start, end), end: Math.max(start, end) };
  }, []);

  // Track selection changes
  const updateSelection = useCallback(() => {
    requestAnimationFrame(() => {
      const offsets = getSelectionOffsets();
      setSelection(offsets);
      if (!offsets) {
        setShowColorPicker(false);
        setShowTagMenu(false);
      }
    });
  }, [getSelectionOffsets]);

  const handleInput = useCallback(() => {
    if (!editorRef.current || isComposingRef.current) return;

    const caretPos = getCaretPosition(editorRef.current);
    const newContent = getContentFromDOM(editorRef.current);
    const oldContent = prevContentRef.current;

    if (newContent === oldContent) return;

    let editStart = 0;
    while (editStart < oldContent.length && editStart < newContent.length && oldContent[editStart] === newContent[editStart]) {
      editStart++;
    }

    let oldEnd = oldContent.length;
    let newEnd = newContent.length;
    while (oldEnd > editStart && newEnd > editStart && oldContent[oldEnd - 1] === newContent[newEnd - 1]) {
      oldEnd--;
      newEnd--;
    }

    const adjusted = adjustRanges(ranges, editStart, oldEnd - editStart, newEnd - editStart);
    prevContentRef.current = newContent;
    pendingCaretRef.current = caretPos;
    onChange(newContent, adjusted);
  }, [ranges, onChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (!editorRef.current) return;

    const caretPos = getCaretPosition(editorRef.current);
    const before = content.slice(0, caretPos);
    const after = content.slice(caretPos);
    const newContent = before + "\n" + after;
    const adjusted = adjustRanges(ranges, caretPos, 0, 1);
    prevContentRef.current = newContent;
    pendingCaretRef.current = caretPos + 1;
    onChange(newContent, adjusted);
  }, [content, ranges, onChange]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain").replace(/\r\n/g, "\n");
    if (!editorRef.current) return;

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    range.deleteContents();

    const textNode = document.createTextNode(text);
    range.insertNode(textNode);

    range.setStartAfter(textNode);
    range.setEndAfter(textNode);
    selection.removeAllRanges();
    selection.addRange(range);

    editorRef.current.normalize();
    handleInput();
  }, [handleInput]);

  // Build HTML from segments
  const segmentsHtml = useMemo(() => {
    if (segments.length === 0) {
      return !content ? "<br>" : "";
    }
    const html = segments.map((seg) => {
      const styles: string[] = [];
      if (seg.bold) styles.push("font-weight:bold");
      if (seg.italic) styles.push("font-style:italic");
      if (seg.superscript) styles.push("vertical-align:super", "font-size:0.65em");
      if (seg.color) styles.push(`color:${seg.color}`);
      if (seg.stroke_color) {
        styles.push(`-webkit-text-stroke:${seg.stroke_width ?? 1}px ${seg.stroke_color}`);
        styles.push("paint-order:stroke fill");
      }
      const cls = seg.isTag
        ? ' class="bg-purple-100 text-purple-700 rounded px-0.5 mx-0.5 font-mono text-xs inline-block"'
        : "";
      const style = styles.length > 0 ? ` style="${styles.join(";")}"` : "";
      const escaped = seg.text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      return `<span${cls}${style}>${escaped}</span>`;
    }).join("");

    return html || "<br>";
  }, [segments, content]);

  // Imperatively update editor DOM and restore caret / selection
  useLayoutEffect(() => {
    if (!editorRef.current) return;
    editorRef.current.innerHTML = segmentsHtml;

    if (pendingSelectionRef.current) {
      const { start, end } = pendingSelectionRef.current;
      setSelectionRange(editorRef.current, start, end);
      pendingSelectionRef.current = null;
    } else if (pendingCaretRef.current !== null) {
      setSelectionRange(editorRef.current, pendingCaretRef.current, pendingCaretRef.current);
      pendingCaretRef.current = null;
    }
  }, [segmentsHtml]);

  // Sync prevContentRef when content changes externally
  useEffect(() => {
    prevContentRef.current = content;
  }, [content]);

  // Format actions
  const applyFormatAction = useCallback(
    (format: Partial<Pick<FormatRange, "bold" | "italic" | "superscript" | "color" | "stroke_color" | "stroke_width">>) => {
      if (!selection) return;
      const updated = applyFormat(ranges, selection.start, selection.end, format);
      pendingSelectionRef.current = { start: selection.start, end: selection.end };
      onChange(content, updated);
    },
    [selection, ranges, content, onChange],
  );

  const handleClearFormat = useCallback(() => {
    if (!selection) return;
    const updated = clearFormat(ranges, selection.start, selection.end);
    pendingSelectionRef.current = { start: selection.start, end: selection.end };
    onChange(content, updated);
  }, [selection, ranges, content, onChange]);

  const handleInsertTag = useCallback(
    (tagKey: string) => {
      if (!editorRef.current) return;
      const tag = `{${tagKey}}`;

      let cursorPos = content.length;
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0 && editorRef.current.contains(sel.anchorNode)) {
        cursorPos = getCaretPosition(editorRef.current);
      }

      const before = content.slice(0, cursorPos);
      const after = content.slice(cursorPos);
      const newContent = before + tag + after;
      const adjusted = adjustRanges(ranges, cursorPos, 0, tag.length);

      pendingCaretRef.current = cursorPos + tag.length;
      prevContentRef.current = newContent;
      onChange(newContent, adjusted);
      setShowTagMenu(false);
    },
    [content, ranges, onChange],
  );

  const handleColorApply = useCallback(
    (color: string) => {
      applyFormatAction({ color });
      setShowColorPicker(false);
    },
    [applyFormatAction],
  );

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-richtext-dropdown]")) {
        setShowColorPicker(false);
        setShowStrokePicker(false);
        setShowTagMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative">
      {showLabel && <label className="block text-xs text-ink-muted mb-1">Content</label>}

      {/* ── Persistent Word-like Toolbar ── */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 bg-surface-alt border border-edge rounded-t-lg border-b-0 flex-wrap">
        {/* Bold */}
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => applyFormatAction({ bold: !activeFormats.bold })}
          disabled={!hasSelection}
          className={`w-7 h-7 flex items-center justify-center rounded text-xs font-bold transition ${
            activeFormats.bold
              ? "bg-primary-100 text-primary-700 ring-1 ring-primary-300"
              : hasSelection
                ? "text-ink hover:bg-slate-200"
                : "text-slate-300 cursor-not-allowed"
          }`}
          title="Bold (select text first)"
        >
          B
        </button>

        {/* Italic */}
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => applyFormatAction({ italic: !activeFormats.italic })}
          disabled={!hasSelection}
          className={`w-7 h-7 flex items-center justify-center rounded text-xs transition ${
            activeFormats.italic
              ? "bg-primary-100 text-primary-700 ring-1 ring-primary-300"
              : hasSelection
                ? "text-ink hover:bg-slate-200"
                : "text-slate-300 cursor-not-allowed"
          }`}
          title="Italic (select text first)"
          style={{ fontStyle: "italic", fontFamily: "Georgia, serif" }}
        >
          I
        </button>

        {/* Superscript */}
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => applyFormatAction({ superscript: !activeFormats.superscript })}
          disabled={!hasSelection}
          className={`w-7 h-7 flex items-center justify-center rounded text-xs transition ${
            activeFormats.superscript
              ? "bg-primary-100 text-primary-700 ring-1 ring-primary-300"
              : hasSelection
                ? "text-ink hover:bg-slate-200"
                : "text-slate-300 cursor-not-allowed"
          }`}
          title="Superscript (select text first)"
        >
          x²
        </button>

        <div className="w-px h-5 bg-slate-300 mx-1" />

        {/* Color picker dropdown */}
        <div className="relative" data-richtext-dropdown>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => { if (hasSelection) setShowColorPicker(!showColorPicker); }}
            disabled={!hasSelection}
            className={`w-7 h-7 flex items-center justify-center rounded text-xs transition ${
              hasSelection ? "text-ink hover:bg-slate-200" : "text-slate-300 cursor-not-allowed"
            }`}
            title="Text color (select text first)"
          >
            <span className="flex flex-col items-center leading-none">
              <span className="text-[11px] font-bold">A</span>
              <span
                className="w-4 h-1 rounded-sm mt-px"
                style={{ backgroundColor: activeFormats.color || customColor }}
              />
            </span>
          </button>

          {showColorPicker && (
            <div className="absolute top-full left-0 mt-1 bg-surface rounded-lg shadow-xl border border-edge p-2 z-50 w-[210px]">
              <div className="grid grid-cols-6 gap-1 mb-2">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handleColorApply(c)}
                    className={`w-7 h-7 rounded-md border-2 transition hover:scale-110 ${
                      activeFormats.color === c ? "border-primary-500 ring-2 ring-primary-200" : "border-edge"
                    }`}
                    style={{ backgroundColor: c }}
                    title={c}
                  />
                ))}
              </div>
              <div className="flex items-center gap-1.5 pt-1.5 border-t border-edge">
                <input
                  type="color"
                  value={customColor}
                  onChange={(e) => setCustomColor(e.target.value)}
                  className="w-8 h-8 rounded cursor-pointer border border-edge p-0"
                />
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleColorApply(customColor)}
                  className="flex-1 text-xs bg-primary-500 text-white rounded-md py-1.5 hover:bg-primary-600 transition font-medium"
                >
                  Apply
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Clear formatting */}
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={handleClearFormat}
          disabled={!hasSelection}
          className={`w-7 h-7 flex items-center justify-center rounded text-xs transition ${
            hasSelection ? "text-ink hover:bg-slate-200" : "text-slate-300 cursor-not-allowed"
          }`}
          title="Clear formatting (select text first)"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9.75L14.25 12m0 0l2.25 2.25M14.25 12l2.25-2.25M14.25 12L12 14.25m-2.58 4.92l-6.374-6.375a1.125 1.125 0 010-1.59L9.42 4.83c.21-.211.497-.33.795-.33H19.5a2.25 2.25 0 012.25 2.25v10.5a2.25 2.25 0 01-2.25 2.25h-9.284c-.298 0-.585-.119-.795-.33z" />
          </svg>
        </button>

        <div className="w-px h-5 bg-slate-300 mx-1" />

        {/* Stroke color — same palette as font color */}
        <div className="relative" data-richtext-dropdown>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => { if (hasSelection) setShowStrokePicker(!showStrokePicker); }}
            disabled={!hasSelection}
            className={`w-7 h-7 flex items-center justify-center rounded text-xs transition ${
              hasSelection ? "text-ink hover:bg-slate-200" : "text-slate-300 cursor-not-allowed"
            }`}
            title="Text stroke color (select text first)"
          >
            <span className="flex flex-col items-center leading-none">
              <span className="text-[11px] font-bold" style={{ WebkitTextStroke: "1px currentColor" }}>S</span>
              <span
                className="w-4 h-1 rounded-sm mt-px"
                style={{ backgroundColor: activeFormats.stroke_color || strokeColor }}
              />
            </span>
          </button>

          {showStrokePicker && (
            <div className="absolute top-full left-0 mt-1 bg-surface rounded-lg shadow-xl border border-edge p-2 z-50 w-[210px]">
              <div className="grid grid-cols-6 gap-1 mb-2">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setStrokeColor(c);
                      applyFormatAction({ stroke_color: c, stroke_width: strokeWidth });
                      setShowStrokePicker(false);
                    }}
                    className={`w-7 h-7 rounded-md border-2 transition hover:scale-110 ${
                      activeFormats.stroke_color === c ? "border-primary-500 ring-2 ring-primary-200" : "border-edge"
                    }`}
                    style={{ backgroundColor: c }}
                    title={c}
                  />
                ))}
              </div>
              <div className="flex items-center gap-1.5 pt-1.5 border-t border-edge">
                <input
                  type="color"
                  value={strokeColor}
                  onChange={(e) => setStrokeColor(e.target.value)}
                  className="w-8 h-8 rounded cursor-pointer border border-edge p-0"
                />
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    applyFormatAction({ stroke_color: strokeColor, stroke_width: strokeWidth });
                    setShowStrokePicker(false);
                  }}
                  className="flex-1 text-xs bg-primary-500 text-white rounded-md py-1.5 hover:bg-primary-600 transition font-medium"
                >
                  Apply
                </button>
              </div>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  if (selection) {
                    const updated = applyFormat(ranges, selection.start, selection.end, { stroke_color: undefined, stroke_width: undefined });
                    onChange(content, updated);
                  }
                  setShowStrokePicker(false);
                }}
                className="w-full text-[10px] text-ink-muted hover:text-red-500 hover:bg-red-50 rounded-md py-1 mt-1.5 transition border-t border-edge pt-1.5"
              >
                Remove Stroke
              </button>
            </div>
          )}
        </div>

        {/* Stroke width — inline beside stroke color */}
        <div className="flex items-center gap-0.5" title="Stroke width">
          <input
            type="range"
            min="0.5"
            max="5"
            step="0.5"
            value={strokeWidth}
            onInput={(e) => {
              const w = parseFloat((e.target as HTMLInputElement).value);
              setStrokeWidth(w);
              if (selection && activeFormats.stroke_color) {
                applyFormatAction({ stroke_color: activeFormats.stroke_color, stroke_width: w });
              }
            }}
            onChange={(e) => {
              const w = parseFloat(e.target.value);
              setStrokeWidth(w);
            }}
            className="w-16 accent-primary-500 cursor-pointer"
          />
          <span className="text-[9px] tabular-nums w-5 text-ink-muted">{strokeWidth}</span>
        </div>

        <div className="w-px h-5 bg-slate-300 mx-1" />

        {/* Insert tag dropdown */}
        {tagKeys.length > 0 && (
          <div className="relative" data-richtext-dropdown>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setShowTagMenu(!showTagMenu)}
              className="h-7 px-2 flex items-center gap-1 rounded text-xs text-purple-600 hover:bg-purple-50 transition font-medium"
              title="Insert tag at cursor"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" />
              </svg>
              Tag
              <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            </button>

            {showTagMenu && (
              <div className="absolute top-full left-0 mt-1 bg-surface rounded-lg shadow-xl border border-edge py-1 z-50 min-w-[140px]">
                {tagKeys.map((key) => (
                  <button
                    key={key}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handleInsertTag(key)}
                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-purple-50 text-ink flex items-center gap-2 transition"
                  >
                    <span className="bg-purple-100 text-purple-700 rounded px-1.5 py-0.5 font-mono text-[10px]">
                      {`{${key}}`}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Selection indicator */}
        {hasSelection && (
          <span className="ml-auto text-[10px] text-ink-muted font-mono">
            {selection!.end - selection!.start} chars
          </span>
        )}
      </div>

      {/* ── Editor Area ── */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onKeyDown={handleKeyDown}
        onInput={handleInput}
        onMouseUp={updateSelection}
        onKeyUp={updateSelection}
        onPaste={handlePaste}
        onCompositionStart={() => { isComposingRef.current = true; }}
        onCompositionEnd={() => {
          isComposingRef.current = false;
          handleInput();
        }}
        onBlur={() => {
          setTimeout(() => {
            if (!document.activeElement?.closest("[data-richtext-dropdown]")) {
              setSelection(null);
            }
          }, 200);
        }}
        className="border border-edge rounded-b-lg px-3 py-2.5 text-sm w-full min-h-[4rem] whitespace-pre-wrap outline-none cursor-text focus:ring-2 focus:ring-primary-200 focus:border-primary-300 transition bg-surface"
        spellCheck={false}
      />

      {!hasSelection && (
        <p className="text-[10px] text-ink-muted mt-1">Select text to apply formatting</p>
      )}
    </div>
  );
}
