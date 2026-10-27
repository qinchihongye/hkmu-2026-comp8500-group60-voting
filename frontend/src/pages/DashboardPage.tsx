import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../features/auth/AuthProvider";
import { getMyVotes, getPolls } from "../features/polls/api";
import { useI18n, type Translate } from "../i18n/LocaleProvider";
import "../styles/dashboard.css";

interface DisplayCard {
  id: string | number;
  title: string;
  badge: "OPEN" | "PRIVATE" | "UPCOMING";
  meta: string;
  timeLeft: string;
  progressPercent: number;
  progressLabel?: string;
  progressDetail?: string;
  description: string;
  actionText: string;
  actionUrl: string;
  avatars?: string[];
  isUpcoming?: boolean;
}

function mockCards(t: Translate): DisplayCard[] {
  return [
    {
      id: "mock-1",
      title: t("dashboard.park.title"),
      badge: "OPEN",
      meta: t("dashboard.park.meta"),
      timeLeft: t("dashboard.park.time"),
      progressPercent: 72,
      progressLabel: t("dashboard.park.progress"),
      progressDetail: t("dashboard.park.detail"),
      description: t("dashboard.park.description"),
      actionText: t("dashboard.park.action"),
      actionUrl: "/public-polls",
      avatars: [
        "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=80&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=80&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=80&auto=format&fit=crop&q=80",
      ],
    },
    {
      id: "mock-2",
      title: t("dashboard.bylaw.title"),
      badge: "PRIVATE",
      meta: t("dashboard.bylaw.meta"),
      timeLeft: t("dashboard.bylaw.time"),
      progressPercent: 15,
      progressLabel: t("dashboard.bylaw.progress"),
      progressDetail: t("dashboard.bylaw.detail"),
      description: t("dashboard.bylaw.description"),
      actionText: t("dashboard.bylaw.action"),
      actionUrl: "/public-polls",
    },
    {
      id: "mock-3",
      title: t("dashboard.awards.title"),
      badge: "OPEN",
      meta: t("dashboard.awards.meta"),
      timeLeft: t("dashboard.awards.time"),
      progressPercent: 88,
      progressLabel: t("dashboard.awards.progress"),
      progressDetail: t("dashboard.awards.detail"),
      description: t("dashboard.awards.description"),
      actionText: t("dashboard.awards.action"),
      actionUrl: "/public-polls",
      avatars: [
        "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=80&auto=format&fit=crop&q=80",
      ],
    },
    {
      id: "mock-4",
      title: t("dashboard.goals.title"),
      badge: "UPCOMING",
      meta: t("dashboard.goals.meta"),
      timeLeft: t("dashboard.goals.time"),
      progressPercent: 0,
      progressLabel: t("dashboard.goals.progress"),
      description: t("dashboard.goals.description"),
      actionText: t("dashboard.goals.action"),
      actionUrl: "/public-polls",
      isUpcoming: true,
    },
  ];
}

export function DashboardPage() {
  const { t } = useI18n();
  const auth = useAuth();
  const [openTotal, setOpenTotal] = useState<number | null>(null);
  const [namedTotal, setNamedTotal] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    void getPolls({ page: 1, page_size: 1, status: "OPEN" })
      .then((page) => {
        if (!cancelled) {
          setOpenTotal(page.total);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setOpenTotal(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (auth.status !== "authenticated") {
      return;
    }
    let cancelled = false;
    void getMyVotes({ page: 1, page_size: 1 })
      .then((page) => {
        if (!cancelled) {
          setNamedTotal(page.total);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setNamedTotal(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [auth.status]);

  const filteredCards = mockCards(t).filter((card) =>
    card.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    card.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="dashboard-root" data-testid="dashboard">
      {/* ================= DASHBOARD HEADER ================= */}
      <header className="dashboard-header">
        <div className="dashboard-title-area">
          <h1 className="dashboard-heading">{t("dashboard.title")}</h1>
          <p style={{ position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0, 0, 0, 0)", whiteSpace: "nowrap", border: 0 }}>
            {t("dashboard.note")}
          </p>
        </div>

        <div className="dashboard-header-right">
          {/* Top Live Stats Chips (Preserving test ids) */}
          <div className="dashboard-stats-strip">
            <div className="dashboard-stat-chip">
              <span>{t("dashboard.openPolls")}</span>
              <strong data-testid="open-total">{openTotal ?? "—"}</strong>
            </div>

            {auth.status === "authenticated" ? (
              <div className="dashboard-stat-chip">
                <span>{t("dashboard.myVotes")}</span>
                <strong data-testid="named-total">{namedTotal ?? "—"}</strong>
              </div>
            ) : null}
          </div>

          {/* Search Pill */}
          <div className="dashboard-search-wrap">
            <svg
              className="dashboard-search-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder={t("dashboard.search")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="dashboard-search-input"
            />
          </div>
        </div>
      </header>

      {/* ================= 2x2 POLLING CARDS GRID ================= */}
      <div className="dashboard-grid">
        {filteredCards.map((card) => (
          <article key={card.id} className="poll-card">
            {/* Card Header: Title & Status Badge */}
            <div className="poll-card-top">
              <div className="poll-card-title-group">
                <h3 className="poll-card-title">{card.title}</h3>
                <span className="poll-card-meta">{card.meta}</span>
              </div>

              {/* Status Badge */}
              {card.badge === "OPEN" ? (
                <span className="poll-badge poll-badge-open">
                  <span className="poll-badge-dot" />
                  {t("dashboard.badgeOpen")}
                </span>
              ) : card.badge === "PRIVATE" ? (
                <span className="poll-badge poll-badge-private">
                  {t("dashboard.badgePrivate")}
                </span>
              ) : (
                <span className="poll-badge poll-badge-upcoming">
                  {t("dashboard.badgeUpcoming")}
                </span>
              )}
            </div>

            {/* Time & Avatar Stack Row */}
            <div className="poll-card-info-row">
              <div className="poll-card-time">
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 14 14" />
                </svg>
                <span>{card.timeLeft}</span>
              </div>

              {card.avatars && card.avatars.length > 0 ? (
                <div className="poll-avatar-stack">
                  {card.avatars.map((avatar, idx) => (
                    <img
                      key={idx}
                      src={avatar}
                      alt=""
                      className="poll-avatar-item"
                    />
                  ))}
                  <span className="poll-avatar-more">👥</span>
                </div>
              ) : null}
            </div>

            {/* Progress Bar (if not pure upcoming) */}
            {!card.isUpcoming ? (
              <div className="poll-progress-wrap">
                <div className="poll-progress-labels">
                  <span>{card.progressLabel}</span>
                  <span>{card.progressDetail}</span>
                </div>
                <div className="poll-progress-track">
                  <div
                    className={`poll-progress-fill ${
                      card.badge === "PRIVATE"
                        ? "poll-progress-fill-coral"
                        : "poll-progress-fill-blue"
                    }`}
                    style={{ width: `${card.progressPercent}%` }}
                  />
                </div>
              </div>
            ) : null}

            {/* Description */}
            <p className="poll-card-desc">{card.description}</p>

            {/* Card Footer Button */}
            <div className="poll-card-footer">
              <Link to={card.actionUrl} className="poll-card-btn">
                {card.actionText}
              </Link>
            </div>

            {/* Decorative Colorful Ribbon for Card 4 matching mockup */}
            {card.isUpcoming ? (
              <svg
                className="poll-card-ribbon"
                viewBox="0 0 120 100"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                {/* 3D Wave Layers in Cyan, Purple, Pink, Yellow */}
                <path
                  d="M10 100 C 40 70, 70 90, 100 50 C 110 35, 115 15, 120 0 L 120 100 Z"
                  fill="url(#ribbonGrad1)"
                />
                <path
                  d="M30 100 C 60 75, 80 85, 105 60 C 112 50, 118 30, 120 15 L 120 100 Z"
                  fill="url(#ribbonGrad2)"
                />
                <path
                  d="M55 100 C 80 85, 95 90, 110 75 C 116 68, 119 55, 120 40 L 120 100 Z"
                  fill="url(#ribbonGrad3)"
                />
                <defs>
                  <linearGradient id="ribbonGrad1" x1="0" y1="100" x2="120" y2="0" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#06b6d4" />
                    <stop offset="100%" stopColor="#3b82f6" />
                  </linearGradient>
                  <linearGradient id="ribbonGrad2" x1="20" y1="100" x2="120" y2="10" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#8b5cf6" />
                    <stop offset="100%" stopColor="#ec4899" />
                  </linearGradient>
                  <linearGradient id="ribbonGrad3" x1="40" y1="100" x2="120" y2="30" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#f59e0b" />
                    <stop offset="100%" stopColor="#f43f5e" />
                  </linearGradient>
                </defs>
              </svg>
            ) : null}
          </article>
        ))}
      </div>
    </div>
  );
}
