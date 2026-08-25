import { useEffect, lazy, Suspense } from "react";
import { Routes, Route, Navigate, Outlet } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import PageLayout from "@/components/layout/PageLayout";
import AuthModal from "@/components/auth/AuthModal";
import ScrollToTop from "@/components/common/ScrollToTop";
import Toaster from "@/components/common/Toaster";
import { usePageViews } from "@/lib/analytics";

// The landing page is the overwhelmingly common entry point, so it stays in
// the main chunk — lazy-loading it would just add a network round-trip before
// first paint. Everything else is split out.
//
// Two of these dominated the old single 967 kB bundle and were being shipped
// to every anonymous visitor: EditorPage (pulls @remotion/player plus the
// whole composition tree) and the /admin/* subtree (pulls react-moveable,
// which only admins can ever reach).
import LandingPage from "@/pages/LandingPage";

const TemplateBrowsePage = lazy(() => import("@/pages/TemplateBrowsePage"));
const EditorPage = lazy(() => import("@/pages/EditorPage"));
const DashboardPage = lazy(() => import("@/pages/DashboardPage"));
const RenderStatusPage = lazy(() => import("@/pages/RenderStatusPage"));
const WatchPage = lazy(() => import("@/pages/WatchPage"));
const MyOrdersPage = lazy(() => import("@/pages/MyOrdersPage"));
const InvoicePage = lazy(() => import("@/pages/InvoicePage"));
const MyCustomizationsPage = lazy(() => import("@/pages/MyCustomizationsPage"));
const ProfilePage = lazy(() => import("@/pages/ProfilePage"));
const LoginCallbackPage = lazy(() => import("@/pages/LoginCallbackPage"));
const TermsPage = lazy(() => import("@/pages/legal/TermsPage"));
const PrivacyPage = lazy(() => import("@/pages/legal/PrivacyPage"));
const RefundPage = lazy(() => import("@/pages/legal/RefundPage"));

const AdminRoute = lazy(() => import("@/components/admin/AdminRoute"));
const AdminLayout = lazy(() => import("@/components/admin/AdminLayout"));
const AdminDashboardPage = lazy(() => import("@/pages/admin/AdminDashboardPage"));
const AdminCategoriesPage = lazy(() => import("@/pages/admin/AdminCategoriesPage"));
const AdminTemplateListPage = lazy(() => import("@/pages/admin/AdminTemplateListPage"));
const AdminTemplateEditorPage = lazy(() => import("@/pages/admin/AdminTemplateEditorPage"));
const AdminFontsPage = lazy(() => import("@/pages/admin/AdminFontsPage"));
const AdminRendersAwaitingPage = lazy(() => import("@/pages/admin/AdminRendersAwaitingPage"));
const AdminAnalyticsPage = lazy(() => import("@/pages/admin/AdminAnalyticsPage"));

/** Shown while a route chunk is fetched. Deliberately minimal — matching the
 *  page background avoids a flash of contrasting colour on slow connections. */
function RouteFallback() {
  return <div className="py-20 text-center text-ink-muted">Loading...</div>;
}

/** Gates customer-facing pages behind login. Instead of bouncing an
 *  unauthenticated visitor to "/", it opens the login modal in place and
 *  stays put — a successful login just re-renders this with a token, so the
 *  visitor lands exactly where they meant to go. Only closing the modal
 *  without logging in sends them home. */
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { token, loading, showAuthModal, openAuthModal } = useAuthStore();

  useEffect(() => {
    if (!loading && !token) openAuthModal();
  }, [loading, token, openAuthModal]);

  if (loading) return <div className="p-8 text-center">Loading...</div>;
  if (!token) return showAuthModal ? null : <Navigate to="/" replace />;
  return <>{children}</>;
}

/** Layout route for every customer-facing page: Navbar, the centred
 *  `max-w-7xl` content column, and the Footer.
 *
 *  The admin console deliberately does NOT sit under this. It used to, which
 *  meant the whole console was squeezed into the same 7xl column — measured at
 *  976 px on a 1600 px screen, so a bigger monitor bought the template editor
 *  (canvas + timeline + block panel) exactly nothing. AdminLayout is now a
 *  sibling top-level route that owns the full viewport: dark sidebar flush to
 *  the left edge, content taking all the width that's left. It also drops the
 *  customer Navbar, which was redundant chrome — AdminLayout has its own
 *  sidebar nav plus a "Back to Site" link, and losing it gives the editor back
 *  a strip of vertical space too. */
function CustomerLayout() {
  return (
    <PageLayout>
      <Outlet />
    </PageLayout>
  );
}

export default function App() {
  const { loadUser } = useAuthStore();

  // Reports a GA page_view per client-side navigation. Without it the whole
  // SPA counted as one view of the entry URL.
  usePageViews();

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  return (
    <>
      <ScrollToTop />
      <Suspense fallback={<RouteFallback />}>
      <Routes>
        {/* Admin routes — a top-level sibling of the customer layout, so the
            console renders at full viewport width rather than inside the
            customer Navbar/max-w-7xl/Footer shell. */}
        <Route path="/admin" element={<ProtectedRoute><AdminRoute><AdminLayout /></AdminRoute></ProtectedRoute>}>
          <Route index element={<AdminDashboardPage />} />
          <Route path="categories" element={<AdminCategoriesPage />} />
          <Route path="templates" element={<AdminTemplateListPage />} />
          <Route path="templates/:id" element={<AdminTemplateEditorPage />} />
          <Route path="fonts" element={<AdminFontsPage />} />
          <Route path="renders" element={<AdminRendersAwaitingPage />} />
          <Route path="analytics" element={<AdminAnalyticsPage />} />
        </Route>

        {/* Customer site — everything else, inside PageLayout. */}
        <Route element={<CustomerLayout />}>
          {/* Public routes */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/templates" element={<TemplateBrowsePage />} />
          <Route path="/editor/:slug" element={<EditorPage />} />
          <Route path="/watch/:id" element={<WatchPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/refund" element={<RefundPage />} />
          <Route path="/login-callback" element={<LoginCallbackPage />} />

          {/* Protected routes */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/render/:id"
            element={
              <ProtectedRoute>
                <RenderStatusPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/my-orders"
            element={
              <ProtectedRoute>
                <MyOrdersPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/invoice/:paymentId"
            element={
              <ProtectedRoute>
                <InvoicePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/my-customizations"
            element={
              <ProtectedRoute>
                <MyCustomizationsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <ProfilePage />
              </ProtectedRoute>
            }
          />

          {/* No page matched. There's no 404 page yet; this keeps the previous
              behaviour — an unknown URL still renders the site chrome with an
              empty content area, rather than a completely blank document. */}
          <Route path="*" element={<></>} />
        </Route>
      </Routes>
      </Suspense>
      {/* Outside the layout routes: the auth modal is a fixed overlay and must
          survive on any route, admin included. */}
      <AuthModal />
      <Toaster />
    </>
  );
}
