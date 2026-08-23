import { useEffect, useRef, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import MobileNavDrawer from "./MobileNavDrawer";

export default function Navbar() {
  const { user, logout, openAuthModal } = useAuthStore();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!profileMenuOpen) return;
    const onClickOutside = (e: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target as Node)) {
        setProfileMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [profileMenuOpen]);

  // Once the page has scrolled past the top, morph the full logo down to
  // just its "B" mark (see the crop-window comment below) so the sticky
  // header stays a reasonable height instead of eating scroll real estate.
  // Applies on both mobile and desktop.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
    <nav className="bg-surface/80 backdrop-blur-md border-b border-edge sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between py-3 items-center">
          <Link to="/" className="flex items-center">
            {/* A single-image crop-window morph, not an asset swap or
                crossfade. The "window" (outer div, overflow hidden)
                shrinks from the full logo's own bounding box down to
                exactly the "B" mark's region inside that same image,
                while the image underneath shifts up-left by the same
                amount so that region stays put in view — reads as the
                whole logo continuously zooming/cropping down to its mark,
                not two things fading into each other. The crop box below
                (29x26 at -47,-18) was measured directly against the same
                B region used to make logo-mark.png (top:350 left:920
                559x500 out of the 2400x1554 source, scaled to this 80px
                render height). The md+ block further below is the same
                math scaled 2x for its 160px render height. */}
            <div
              className="md:hidden relative overflow-hidden"
              style={{
                width: scrolled ? 29 : 124,
                height: scrolled ? 26 : 80,
                transition: "width 600ms cubic-bezier(0.4,0,0.2,1), height 600ms cubic-bezier(0.4,0,0.2,1)",
              }}
            >
              <img
                src="/logo.png"
                alt="Bring My Matter"
                draggable={false}
                style={{
                  position: "absolute",
                  height: 80,
                  width: "auto",
                  maxWidth: "none",
                  top: scrolled ? -18 : 0,
                  left: scrolled ? -47 : 0,
                  transition: "top 600ms cubic-bezier(0.4,0,0.2,1), left 600ms cubic-bezier(0.4,0,0.2,1)",
                }}
              />
            </div>
            {/* md+: same crop-window morph as mobile, just scaled 2x (this
                logo renders at h-40/160px vs mobile's 80px, so the full-size
                box, crop box, and offsets below are exactly double the
                mobile numbers). */}
            <div
              className="hidden md:block relative overflow-hidden"
              style={{
                width: scrolled ? 58 : 248,
                height: scrolled ? 52 : 160,
                transition: "width 600ms cubic-bezier(0.4,0,0.2,1), height 600ms cubic-bezier(0.4,0,0.2,1)",
              }}
            >
              <img
                src="/logo.png"
                alt="Bring My Matter"
                draggable={false}
                style={{
                  position: "absolute",
                  height: 160,
                  width: "auto",
                  maxWidth: "none",
                  top: scrolled ? -36 : 0,
                  left: scrolled ? -94 : 0,
                  transition: "top 600ms cubic-bezier(0.4,0,0.2,1), left 600ms cubic-bezier(0.4,0,0.2,1)",
                }}
              />
            </div>
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-6">
            <NavLink
              to="/templates"
              className={({ isActive }) =>
                `text-sm font-medium transition-colors ${
                  isActive
                    ? "text-brand-500 underline underline-offset-4 decoration-2"
                    : "text-ink-muted hover:text-brand-500"
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
                        ? "text-brand-500 underline underline-offset-4 decoration-2"
                        : "text-ink-muted hover:text-brand-500"
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
                        ? "text-brand-500 underline underline-offset-4 decoration-2"
                        : "text-ink-muted hover:text-brand-500"
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
                          ? "text-brand-500 underline underline-offset-4 decoration-2"
                          : "text-ink-muted hover:text-brand-500"
                      }`
                    }
                  >
                    Admin
                  </NavLink>
                )}
                <div className="relative" ref={profileMenuRef}>
                  <button
                    type="button"
                    onClick={() => setProfileMenuOpen((v) => !v)}
                    className="flex items-center gap-1.5"
                    aria-haspopup="menu"
                    aria-expanded={profileMenuOpen}
                  >
                    {user.avatar_url ? (
                      <img
                        src={user.avatar_url}
                        alt={user.full_name || "User"}
                        referrerPolicy="no-referrer"
                        className="w-8 h-8 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-sm font-semibold">
                        {user.first_name?.charAt(0)?.toUpperCase() || user.full_name?.charAt(0)?.toUpperCase() || "U"}
                      </div>
                    )}
                    <svg
                      className={`w-3.5 h-3.5 text-ink-muted transition-transform ${profileMenuOpen ? "rotate-180" : ""}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {profileMenuOpen && (
                    <div
                      role="menu"
                      className="absolute right-0 top-full mt-2 w-44 bg-surface border border-edge rounded-xl shadow-lg py-1.5 z-50"
                    >
                      <Link
                        to="/profile"
                        role="menuitem"
                        onClick={() => setProfileMenuOpen(false)}
                        className="block px-4 py-2 text-sm text-ink hover:bg-surface-alt transition-colors"
                      >
                        Profile
                      </Link>
                      <button
                        role="menuitem"
                        onClick={() => {
                          setProfileMenuOpen(false);
                          logout();
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-surface-alt transition-colors"
                      >
                        Logout
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <button onClick={() => openAuthModal()} className="btn-brand text-sm">
                Login
              </button>
            )}
          </div>

          {/* Mobile: login button (guests) + hamburger */}
          <div className="flex md:hidden items-center gap-2">
            {!user && (
              <button onClick={() => openAuthModal()} className="btn-brand text-sm px-4 py-2">
                Login
              </button>
            )}
            {user && (
              user.avatar_url ? (
                <img
                  src={user.avatar_url}
                  alt={user.full_name || "User"}
                  referrerPolicy="no-referrer"
                  className="w-8 h-8 rounded-full object-cover"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-sm font-semibold">
                  {user.first_name?.charAt(0)?.toUpperCase() || user.full_name?.charAt(0)?.toUpperCase() || "U"}
                </div>
              )
            )}
            <button
              onClick={() => setDrawerOpen(true)}
              aria-label="Open menu"
              className="text-ink-muted hover:text-ink p-1.5 -mr-1.5"
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
