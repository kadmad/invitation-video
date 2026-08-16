import { useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import MobileNavDrawer from "./MobileNavDrawer";

export default function Navbar() {
  const { user, logout, openAuthModal } = useAuthStore();
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <>
    <nav className="bg-white/80 backdrop-blur-md border-b border-slate-100 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          <Link to="/" className="text-xl font-bold bg-gradient-to-r from-primary-500 to-accent-500 bg-clip-text text-transparent">
            Bring My Matter
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-6">
            <NavLink
              to="/templates"
              className={({ isActive }) =>
                `text-sm font-medium transition-colors ${
                  isActive
                    ? "text-primary-500 underline underline-offset-4 decoration-2"
                    : "text-slate-600 hover:text-primary-500"
                }`
              }
            >
              Templates
            </NavLink>

            {user ? (
              <>
                <NavLink
                  to="/my-customizations"
                  className={({ isActive }) =>
                    `text-sm font-medium transition-colors ${
                      isActive
                        ? "text-primary-500 underline underline-offset-4 decoration-2"
                        : "text-slate-600 hover:text-primary-500"
                    }`
                  }
                >
                  My Drafts
                </NavLink>
                <NavLink
                  to="/my-orders"
                  className={({ isActive }) =>
                    `text-sm font-medium transition-colors ${
                      isActive
                        ? "text-primary-500 underline underline-offset-4 decoration-2"
                        : "text-slate-600 hover:text-primary-500"
                    }`
                  }
                >
                  My Orders
                </NavLink>
                {user.is_admin && (
                  <NavLink
                    to="/admin"
                    className={({ isActive }) =>
                      `text-sm font-medium transition-colors ${
                        isActive
                          ? "text-primary-500 underline underline-offset-4 decoration-2"
                          : "text-slate-600 hover:text-primary-500"
                      }`
                    }
                  >
                    Admin
                  </NavLink>
                )}
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-sm font-semibold">
                    {user.full_name?.charAt(0)?.toUpperCase() || "U"}
                  </div>
                  <button
                    onClick={logout}
                    className="text-sm text-slate-500 hover:text-red-600 transition-colors"
                  >
                    Logout
                  </button>
                </div>
              </>
            ) : (
              <button onClick={() => openAuthModal()} className="btn-primary text-sm">
                Login
              </button>
            )}
          </div>

          {/* Mobile: login button (guests) + hamburger */}
          <div className="flex md:hidden items-center gap-3">
            {!user && (
              <button onClick={() => openAuthModal()} className="btn-primary text-sm px-4 py-2">
                Login
              </button>
            )}
            {user && (
              <div className="w-8 h-8 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-sm font-semibold">
                {user.full_name?.charAt(0)?.toUpperCase() || "U"}
              </div>
            )}
            <button
              onClick={() => setDrawerOpen(true)}
              aria-label="Open menu"
              className="text-slate-500 hover:text-slate-700 p-1.5 -mr-1.5"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </nav>
    <MobileNavDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </>
  );
}
