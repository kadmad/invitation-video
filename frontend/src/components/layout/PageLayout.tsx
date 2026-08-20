import { ReactNode } from "react";
import Navbar from "./Navbar";
import Footer from "./Footer";

// Customer-facing shell only. The /admin tree renders AdminLayout directly as a
// top-level route (see App.tsx) so the console can use the full viewport — it
// must not be wrapped in this centred, width-capped column.
export default function PageLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-page">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
        {children}
      </main>

      <Footer />
    </div>
  );
}
