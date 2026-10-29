import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { getPolls } from "../features/polls/api";
import { useI18n } from "../i18n/LocaleProvider";
import type { PollSummary } from "../lib/api-types";

export function GlobalAnnouncementTicker() {
  const { locale, t } = useI18n();
  const [topPoll, setTopPoll] = useState<PollSummary | null>(null);
  const [step, setStep] = useState<0 | 1>(0);
  const [isPaused, setIsPaused] = useState(false);

  // Fetch the most popular public poll
  useEffect(() => {
    let cancelled = false;
    void getPolls({ page: 1, page_size: 1, sort_by: "popularity", status: "OPEN" })
      .then((res) => {
        if (!cancelled && res.items.length > 0) {
          setTopPoll(res.items[0]);
        } else if (!cancelled) {
          // Fallback to any public poll if no open ones
          void getPolls({ page: 1, page_size: 1, sort_by: "popularity" })
            .then((fallbackRes) => {
              if (!cancelled && fallbackRes.items.length > 0) {
                setTopPoll(fallbackRes.items[0]);
              }
            })
            .catch(() => {});
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  // Interval timer for 2 seconds loop
  useEffect(() => {
    if (isPaused) {
      return;
    }
    const timer = setInterval(() => {
      setStep((prev) => (prev === 0 ? 1 : 0));
    }, 2000);

    return () => clearInterval(timer);
  }, [isPaused]);

  return (
    <div
      className="topbar-ticker-container"
      role="region"
      aria-label="Global Announcements"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div key={step} className="topbar-ticker-slot">
        {step === 0 && topPoll ? (
          <Link
            to={`/polls/${topPoll.id}`}
            className="topbar-ticker-link"
            title={topPoll.title}
            data-testid="topbar-hot-poll"
          >
            <span className="topbar-ticker-badge hot">
              <span className="topbar-ticker-fire" aria-hidden="true">🔥</span>
              <span>{t("nav.hotPollBadge")}</span>
            </span>
            <span className="topbar-ticker-title">{topPoll.title}</span>
            <svg
              className="topbar-ticker-arrow"
              viewBox="0 0 24 24"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </Link>
        ) : (
          <div className="topbar-ticker-ad" data-testid="topbar-ad-placeholder">
            <span className="topbar-ticker-badge ad">
              <span className="topbar-ticker-horn" aria-hidden="true">📢</span>
              <span>{locale === "zh" ? "推广" : "Notice"}</span>
            </span>
            <span className="topbar-ticker-title">{t("nav.adPlaceholder")}</span>
            <span className="topbar-ticker-ad-sub">
              {locale === "zh" ? "（欢迎咨询合作）" : "(Inquire for details)"}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
