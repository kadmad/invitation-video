import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { LEGAL_EFFECTIVE_DATE, LEGAL_VERSION } from "@/lib/site";

export interface LegalSection {
  id: string;
  heading: string;
  body: ReactNode;
}

interface Props {
  title: string;
  intro: ReactNode;
  sections: LegalSection[];
}

/** Shared chrome for Terms / Privacy / Refund: heading, table of contents, numbered sections. */
export default function LegalLayout({ title, intro, sections }: Props) {
  return (
    <div className="max-w-3xl mx-auto">
      <nav aria-label="Breadcrumb" className="text-sm text-slate-400 mb-4">
        <Link to="/" className="hover:text-primary-500">
          Home
        </Link>
        <span className="mx-2">/</span>
        <span className="text-slate-600">{title}</span>
      </nav>

      <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight">{title}</h1>
      <p className="text-sm text-slate-500 mt-2">
        Version {LEGAL_VERSION} · Effective {LEGAL_EFFECTIVE_DATE}
      </p>

      <div className="mt-6 text-slate-600 leading-relaxed space-y-4">{intro}</div>

      <div className="card p-5 mt-8 hover:translate-y-0 hover:shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900 mb-3">On this page</h2>
        <ol className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm list-decimal list-inside marker:text-slate-300">
          {sections.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="text-slate-600 hover:text-primary-500 transition-colors">
                {s.heading}
              </a>
            </li>
          ))}
        </ol>
      </div>

      <div className="mt-10 space-y-10">
        {sections.map((s, i) => (
          <section key={s.id} id={s.id} className="scroll-mt-24">
            <h2 className="text-xl font-semibold text-slate-900">
              <span className="text-slate-300 mr-2">{i + 1}.</span>
              {s.heading}
            </h2>
            <div className="mt-3 text-slate-600 leading-relaxed space-y-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5 [&_a]:text-primary-500 [&_a:hover]:underline [&_strong]:text-slate-800">
              {s.body}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
