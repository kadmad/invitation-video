import { useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import PageLayout from "@/components/layout/PageLayout";
import AuthModal from "@/components/auth/AuthModal";
import DashboardPage from "@/pages/DashboardPage";
import LandingPage from "@/pages/LandingPage";
import TemplateBrowsePage from "@/pages/TemplateBrowsePage";
import EditorPage from "@/pages/EditorPage";
import RenderStatusPage from "@/pages/RenderStatusPage";
import MyOrdersPage from "@/pages/MyOrdersPage";
import InvoicePage from "@/pages/InvoicePage";
import MyCustomizationsPage from "@/pages/MyCustomizationsPage";
import TermsPage from "@/pages/legal/TermsPage";
import PrivacyPage from "@/pages/legal/PrivacyPage";
import RefundPage from "@/pages/legal/RefundPage";
import AdminRoute from "@/components/admin/AdminRoute";
import AdminLayout from "@/components/admin/AdminLayout";
import AdminDashboardPage from "@/pages/admin/AdminDashboardPage";
import AdminCategoriesPage from "@/pages/admin/AdminCategoriesPage";
import AdminTemplateListPage from "@/pages/admin/AdminTemplateListPage";
import AdminTemplateEditorPage from "@/pages/admin/AdminTemplateEditorPage";
import AdminFontsPage from "@/pages/admin/AdminFontsPage";
import AdminRendersAwaitingPage from "@/pages/admin/AdminRendersAwaitingPage";
import AdminAnalyticsPage from "@/pages/admin/AdminAnalyticsPage";
import AdminLoginPage from "@/pages/admin/AdminLoginPage";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { token, loading } = useAuthStore();
  if (loading) return <div className="p-8 text-center">Loading...</div>;
  if (!token) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  const { loadUser } = useAuthStore();

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  return (
    <PageLayout>
      <Routes>
        {/* Public routes */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/templates" element={<TemplateBrowsePage />} />
        <Route path="/editor/:slug" element={<EditorPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/refund" element={<RefundPage />} />

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

        <Route path="/admin/login" element={<AdminLoginPage />} />

        {/* Admin routes */}
        <Route path="/admin" element={<ProtectedRoute><AdminRoute><AdminLayout /></AdminRoute></ProtectedRoute>}>
          <Route index element={<AdminDashboardPage />} />
          <Route path="categories" element={<AdminCategoriesPage />} />
          <Route path="templates" element={<AdminTemplateListPage />} />
          <Route path="templates/:id" element={<AdminTemplateEditorPage />} />
          <Route path="fonts" element={<AdminFontsPage />} />
          <Route path="renders" element={<AdminRendersAwaitingPage />} />
          <Route path="analytics" element={<AdminAnalyticsPage />} />
        </Route>
      </Routes>
      <AuthModal />
    </PageLayout>
  );
}
