import { Link, NavLink } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";

export default function Navbar() {
  const { user, logout, openAuthModal } = useAuthStore();

  return (
    <nav className="bg-white/80 backdrop-blur-md border-b border-slate-100 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          <Link to="/" className="text-xl font-bold bg-gradient-to-r from-primary-500 to-accent-500 bg-clip-text text-transparent">
            Invitation Video
          </Link>

          <div className="flex items-center gap-6">
            <NavLink
              to="/templates"
              className={({ isActive }) =>
                `hidden md:inline-block text-sm font-medium transition-colors ${
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
                    `hidden md:inline-block text-sm font-medium transition-colors ${
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
                    `hidden md:inline-block text-sm font-medium transition-colors ${
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
                      `hidden md:inline-block text-sm font-medium transition-colors ${
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
              <button
                onClick={() => openAuthModal()}
                className="btn-primary text-sm"
              >
                Login
              </button>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
