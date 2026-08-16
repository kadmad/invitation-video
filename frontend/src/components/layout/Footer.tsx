import { Link } from "react-router-dom";
import { SITE_NAME, SITE_TAGLINE, SUPPORT_EMAIL } from "@/lib/site";

const productLinks = [
  { to: "/templates", label: "Browse templates" },
  { to: "/my-customizations", label: "My drafts" },
  { to: "/my-orders", label: "My orders" },
];

const legalLinks = [
  { to: "/terms", label: "Terms & Conditions" },
  { to: "/privacy", label: "Privacy Policy" },
  { to: "/refund", label: "Refund & Cancellation" },
];

export default function Footer() {
  return (
    <footer className="border-t border-slate-100 bg-white mt-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="grid gap-8 sm:grid-cols-3">
          <div>
            <Link
              to="/"
              className="text-lg font-bold bg-gradient-to-r from-primary-500 to-accent-500 bg-clip-text text-transparent"
            >
              {SITE_NAME}
            </Link>
            <p className="text-sm text-slate-500 mt-2 max-w-xs">{SITE_TAGLINE}</p>
          </div>

          <div>
            <h2 className="text-sm font-semibold text-slate-900 mb-3">Product</h2>
            <ul className="space-y-2 text-sm">
              {productLinks.map((l) => (
                <li key={l.to}>
                  <Link to={l.to} className="text-slate-500 hover:text-primary-500 transition-colors">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="text-sm font-semibold text-slate-900 mb-3">Legal</h2>
            <ul className="space-y-2 text-sm">
              {legalLinks.map((l) => (
                <li key={l.to}>
                  <Link to={l.to} className="text-slate-500 hover:text-primary-500 transition-colors">
                    {l.label}
                  </Link>
                </li>
              ))}
              <li>
                <a
                  href={`mailto:${SUPPORT_EMAIL}`}
                  className="text-slate-500 hover:text-primary-500 transition-colors"
                >
                  Contact support
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-slate-100 mt-8 pt-6 flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between text-xs text-slate-400">
          <p>
            © {new Date().getFullYear()} {SITE_NAME}. All rights reserved.
          </p>
          <p className="flex gap-4">
            <Link to="/terms" className="hover:text-primary-500 transition-colors">
              Terms
            </Link>
            <Link to="/privacy" className="hover:text-primary-500 transition-colors">
              Privacy
            </Link>
            <Link to="/refund" className="hover:text-primary-500 transition-colors">
              Refunds
            </Link>
          </p>
        </div>
      </div>
    </footer>
  );
}
