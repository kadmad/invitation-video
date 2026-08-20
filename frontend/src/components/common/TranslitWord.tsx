import { useState, useEffect, useRef } from "react";
import type { WordCandidates } from "@/api/transliterate";

export type { WordCandidates };

export default function TranslitWord({
  word,
  selectedIndex,
  onSelect,
}: {
  word: WordCandidates;
  selectedIndex: number;
  onSelect: (index: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = word.candidates[selectedIndex] ?? word.candidates[0] ?? word.word;

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  if (word.candidates.length <= 1) {
    return <span className="text-primary-500 text-xs font-medium">{current}</span>;
  }

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="bg-primary-50 text-primary-600 text-xs font-medium px-1.5 py-0.5 rounded cursor-pointer hover:bg-primary-100 border border-primary-200"
      >
        {current} ▾
      </button>
      {open && (
        <div className="absolute z-20 mt-1 bg-surface border rounded-lg shadow-lg p-1 min-w-[80px]">
          {word.candidates.map((c, i) => (
            <button
              key={i}
              onClick={() => {
                onSelect(i);
                setOpen(false);
              }}
              className={`block w-full text-left px-2 py-1 text-xs rounded ${
                i === selectedIndex
                  ? "bg-primary-50 text-primary-700 font-bold"
                  : "hover:bg-surface-alt"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
