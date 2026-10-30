import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";

import { AuthLocaleMenu } from "../components/AuthLocaleMenu";
import { useAuth } from "../features/auth/AuthProvider";
import { useI18n } from "../i18n/LocaleProvider";
import { GlobalAnnouncementTicker } from "./GlobalAnnouncementTicker";
import { NotificationDropdown } from "../features/notifications/NotificationDropdown";
import { useNotifications } from "../features/notifications/useNotifications";
import "./AppLayout.css";

const MOBILE_NAV_QUERY = "(max-width: 960px)";

function subscribeMobileNav(onChange: () => void) {
  if (typeof window.matchMedia !== "function") {
    return () => undefined;
  }
  const media = window.matchMedia(MOBILE_NAV_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function mobileNavSnapshot() {
  if (typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia(MOBILE_NAV_QUERY).matches;
}

function useMobileNav() {
  return useSyncExternalStore(subscribeMobileNav, mobileNavSnapshot, () => false);
}

export function AppLayout() {
  const { t } = useI18n();
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const mobileNav = useMobileNav();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const { notifications, unreadCount, markAsRead, markAllAsRead, clearAll } = useNotifications();
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem("sidebar_collapsed") === "true";
    } catch {
      return false;
    }
  });
  const authenticated = auth.status === "authenticated";
  const isAdmin = auth.user?.role === "ADMIN";

  const isAuthPage = location.pathname === "/login" || location.pathname === "/register";

  useEffect(() => {
    if (!userMenuOpen && !notifOpen) return;
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (userMenuOpen && userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
      if (notifOpen && notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setNotifOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setUserMenuOpen(false);
        setNotifOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside, { passive: true });
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [userMenuOpen, notifOpen]);

  function toggleSidebar() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("sidebar_collapsed", String(next));
      } catch {
        // ignore
      }
      return next;
    });
  }

  async function logout() {
    await auth.logout();
    navigate("/login");
  }

  if (isAuthPage) {
    return (
      <main id="main" style={{ minHeight: "100vh", width: "100%" }}>
        <Outlet />
      </main>
    );
  }

  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        {t("nav.skip")}
      </a>

      {/* ================= LEFT SIDEBAR ================= */}
      <aside className={`sidebar ${collapsed ? "collapsed" : ""}`}>
        {/* Brand & Collapse Toggle */}
        <div className="sidebar-header">
          <Link to="/overview" className="brand" aria-label={t("nav.home")} title={t("nav.home")}>
            <img className="brand-logo-icon" src="/favicon.png" alt="" />
            {!collapsed && <span className="brand-name">VOTE</span>}
          </Link>

          <button
            type="button"
            className="sidebar-collapse-btn"
            aria-label={collapsed ? t("nav.expand") : t("nav.collapse")}
            title={collapsed ? t("nav.expand") : t("nav.collapse")}
            onClick={toggleSidebar}
          >
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <line x1="9" y1="3" x2="9" y2="21" />
            </svg>
          </button>
        </div>

        {/* Navigation Items with Icons */}
        <nav className="sidebar-nav-group" aria-label={t("nav.main")}>
          {/* Overview */}
          <NavLink
            to="/overview"
            end
            className="sidebar-nav-item"
            aria-label={t("nav.overview")}
            title={t("nav.overview")}
          >
            <span className="sidebar-nav-icon">
              {/* 4 squares grid icon */}
              <svg viewBox="0 0 20 20" width="18" height="18" fill="currentColor">
                <rect x="2" y="2" width="6.5" height="6.5" rx="2" />
                <rect x="11.5" y="2" width="6.5" height="6.5" rx="2" />
                <rect x="2" y="11.5" width="6.5" height="6.5" rx="2" />
                <rect x="11.5" y="11.5" width="6.5" height="6.5" rx="2" />
              </svg>
            </span>
            <span className="sidebar-nav-text">{t("nav.overview")}</span>
          </NavLink>

          {authenticated ? (
            <>
              {/* My Polls */}
              <NavLink
                to="/my-polls"
                end
                className="sidebar-nav-item"
                aria-label={t("nav.myPolls")}
                title={t("nav.myPolls")}
              >
                <span className="sidebar-nav-icon">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 11 12 14 22 4" />
                    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                  </svg>
                </span>
                <span className="sidebar-nav-text">{t("nav.myPolls")}</span>
              </NavLink>

              {/* History / My Votes */}
              <NavLink
                to="/my-votes"
                className="sidebar-nav-item"
                aria-label={t("nav.history")}
                title={t("nav.history")}
              >
                <span className="sidebar-nav-icon">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 14 14" />
                  </svg>
                </span>
                <span className="sidebar-nav-text">{t("nav.history")}</span>
              </NavLink>

              {/* Create Poll + (Distinctive highlighted pill button) */}
              <NavLink
                to="/my-polls/new"
                className="sidebar-create-btn"
                aria-label={t("nav.create")}
                title={t("nav.create")}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="16" />
                    <line x1="8" y1="12" x2="16" y2="12" />
                  </svg>
                  <span className="sidebar-nav-text">{t("nav.create")}</span>
                </div>
                <span className="sidebar-create-plus" style={{ fontSize: "1.2rem", fontWeight: 700 }}>+</span>
              </NavLink>

              {isAdmin ? (
                <>
                  <NavLink
                    to="/admin/polls"
                    className="sidebar-nav-item"
                    aria-label={t("nav.supervision")}
                    title={t("nav.supervision")}
                  >
                    <span className="sidebar-nav-icon">
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    </span>
                    <span className="sidebar-nav-text">{t("nav.supervision")}</span>
                  </NavLink>
                  <NavLink
                    to="/admin/audit"
                    className="sidebar-nav-item"
                    aria-label={t("nav.audit")}
                    title={t("nav.audit")}
                  >
                    <span className="sidebar-nav-icon">
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="12 2 2 7 12 12 22 7 12 2" />
                        <polyline points="2 17 12 22 22 17" />
                        <polyline points="2 12 12 17 22 12" />
                      </svg>
                    </span>
                    <span className="sidebar-nav-text">{t("nav.audit")}</span>
                  </NavLink>
                </>
              ) : null}
            </>
          ) : null}
        </nav>

        {/* Sidebar Bottom (Login if not authenticated) */}
        {!authenticated ? (
          <div className="sidebar-footer">
            <Link to="/login" className="sidebar-nav-item" title={t("nav.signIn")}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                <polyline points="10 17 15 12 10 7" />
                <line x1="15" y1="12" x2="3" y2="12" />
              </svg>
              <span className="sidebar-nav-text">{t("nav.signIn")}</span>
            </Link>
          </div>
        ) : null}
      </aside>

      {/* ================= MAIN SHELL ================= */}
      <div className="shell-main">
        {/* Topbar Navigation Header */}
        <header className="topbar">
          <div className="topbar-mobile-left">
            <Link to="/overview" className="topbar-mobile-brand" aria-label={t("nav.home")}>
              <img className="brand-logo-icon" src="/favicon.png" alt="" style={{ width: 24, height: 24 }} />
              <span className="brand-name" style={{ fontSize: "1.15rem" }}>VOTE</span>
            </Link>
          </div>

          <div className="topbar-left-group">
            <GlobalAnnouncementTicker />
          </div>

          {/* Right Action / User Profile */}
          <div className="topbar-right">
            {authenticated && auth.user ? (
              <div className="topbar-user-section">
                {/* Notification Bell with Dropdown */}
                <div className="notif-dropdown-wrapper" ref={notifRef}>
                  <button
                    type="button"
                    className={`topbar-bell-btn ${notifOpen ? "active" : ""}`}
                    data-testid="topbar-bell-btn"
                    title={t("nav.notifications")}
                    aria-label={t("nav.notifications")}
                    aria-haspopup="true"
                    aria-expanded={notifOpen}
                    onClick={() => {
                      setNotifOpen((prev) => !prev);
                      setUserMenuOpen(false);
                    }}
                  >
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                    </svg>
                    {unreadCount > 0 ? (
                      <span className="topbar-bell-badge" data-testid="topbar-bell-dot">
                        {unreadCount > 99 ? "99+" : unreadCount}
                      </span>
                    ) : null}
                  </button>

                  {notifOpen ? (
                    <NotificationDropdown
                      notifications={notifications}
                      unreadCount={unreadCount}
                      onMarkAsRead={markAsRead}
                      onMarkAllAsRead={markAllAsRead}
                      onClearAll={clearAll}
                      onClose={() => setNotifOpen(false)}
                    />
                  ) : null}
                </div>

                {/* User Dropdown Trigger Button */}
                <div style={{ position: "relative" }} ref={userMenuRef}>
                  <button
                    type="button"
                    className={`topbar-user-trigger ${userMenuOpen ? "active" : ""}`}
                    data-testid="topbar-user-menu"
                    aria-label={t("nav.account")}
                    aria-haspopup="true"
                    aria-expanded={userMenuOpen}
                    onClick={() => {
                      setUserMenuOpen((prev) => !prev);
                      setNotifOpen(false);
                    }}
                  >
                    {/* Avatar */}
                    <span className="topbar-avatar">
                      {(auth.user.username === "admin" ? "admin" : auth.user.display_name).charAt(0).toUpperCase()}
                    </span>
                    <span className="topbar-user-name">
                      {auth.user.username === "admin" ? "admin" : auth.user.display_name}
                    </span>

                    {/* Dropdown chevron */}
                    <svg
                      viewBox="0 0 24 24"
                      width="16"
                      height="16"
                      fill="none"
                      stroke="#64748b"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="topbar-chevron"
                      style={{
                        transform: userMenuOpen ? "rotate(180deg)" : "none",
                      }}
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>

                  {/* Dropdown Menu */}
                  <div
                    className={`topbar-dropdown-menu ${userMenuOpen ? "open" : ""}`}
                    role="menu"
                  aria-label={t("nav.accountMenu")}
                >
                  {/* User Info Header */}
                  <div className="topbar-dropdown-header">
                    <div className="topbar-dropdown-avatar">
                      {(auth.user.username === "admin" ? "admin" : auth.user.display_name).charAt(0).toUpperCase()}
                    </div>
                    <div className="topbar-dropdown-meta">
                      <div className="topbar-dropdown-name">@{auth.user.username}</div>
                      {isAdmin ? (
                        <div className="topbar-dropdown-role">
                          <span className="topbar-role-badge admin">{t("role.admin")}</span>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="topbar-dropdown-divider" />
                  <div className="topbar-dropdown-locale">
                    <AuthLocaleMenu layout="inline" />
                  </div>

                  {isAdmin ? (
                    <>
                      <div className="topbar-dropdown-divider" />
                      <Link
                        to="/admin/polls"
                        className="topbar-dropdown-item"
                        onClick={() => setUserMenuOpen(false)}
                      >
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                        <span>{t("nav.supervision")}</span>
                      </Link>
                      <Link
                        to="/admin/audit"
                        className="topbar-dropdown-item"
                        onClick={() => setUserMenuOpen(false)}
                      >
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polygon points="12 2 2 7 12 12 22 7 12 2" />
                          <polyline points="2 17 12 22 22 17" />
                          <polyline points="2 12 12 17 22 12" />
                        </svg>
                        <span>{t("nav.audit")}</span>
                      </Link>
                    </>
                  ) : null}

                  <div className="topbar-dropdown-divider" />

                  {/* Logout Button */}
                  <button
                    type="button"
                    className="topbar-dropdown-item topbar-dropdown-logout"
                    aria-label={t("nav.logOut")}
                    title={t("nav.logOut")}
                    onClick={() => {
                      setUserMenuOpen(false);
                      void logout();
                    }}
                  >
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                      <polyline points="16 17 21 12 16 7" />
                      <line x1="21" y1="12" x2="9" y2="12" />
                    </svg>
                    <span>{t("nav.logOut")}</span>
                  </button>
                </div>
              </div>
            </div>
            ) : (
              <div className="topbar-auth-links">
                <Link to="/login" className="topbar-login-link">
                  {t("nav.logIn")}
                </Link>
                <Link to="/register" className="topbar-register-link">
                  {t("nav.signUp")}
                </Link>
              </div>
            )}
          </div>
        </header>

        {/* Content Page Outlet */}
        <main id="main" className="content">
          <Outlet />
        </main>
        {mobileNav ? (
          <nav className="mobile-tabbar" aria-label={t("nav.mobile")}>
            <NavLink to="/overview" end className="mobile-tab" aria-label={t("nav.overview")}>
              <TabIcon name="overview" />
              <span>{t("nav.overview")}</span>
            </NavLink>
            {authenticated ? (
              <NavLink to="/my-polls/new" className="mobile-tab mobile-tab-create" aria-label={t("nav.create")}>
                <span className="mobile-tab-create-mark" aria-hidden="true">+</span>
                <span>{t("nav.createShort")}</span>
              </NavLink>
            ) : null}
            {authenticated ? (
              <NavLink to="/my-polls" end className="mobile-tab" aria-label={t("nav.myPolls")}>
                <TabIcon name="mine" />
                <span>{t("nav.myPolls")}</span>
              </NavLink>
            ) : null}
            {authenticated ? (
              <NavLink to="/my-votes" className="mobile-tab" aria-label={t("nav.history")}>
                <TabIcon name="history" />
                <span>{t("nav.history")}</span>
              </NavLink>
            ) : null}
          </nav>
        ) : null}
      </div>
    </div>
  );
}

function TabIcon({ name }: { name: "overview" | "polls" | "mine" | "history" }) {
  if (name === "overview") {
    return (
      <svg viewBox="0 0 20 20" width="20" height="20" fill="currentColor" aria-hidden="true">
        <rect x="2" y="2" width="6.5" height="6.5" rx="2" />
        <rect x="11.5" y="2" width="6.5" height="6.5" rx="2" />
        <rect x="2" y="11.5" width="6.5" height="6.5" rx="2" />
        <rect x="11.5" y="11.5" width="6.5" height="6.5" rx="2" />
      </svg>
    );
  }
  if (name === "polls") {
    return (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <path d="M18 20V10" />
        <path d="M12 20V4" />
        <path d="M6 20v-6" />
      </svg>
    );
  }
  if (name === "mine") {
    return (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <polyline points="9 11 12 14 22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}
