import { Link, useLocation } from "react-router-dom";

import { ModeTags, StatusTag } from "../../components/StatusTag";
import { useI18n } from "../../i18n/LocaleProvider";
import { formatHongKong } from "../../lib/time";
import { useGuest } from "../poll-access/GuestProvider";
import type { PollAccessView } from "../poll-access/usePollAccess";
import { castVote, getPoll } from "./api";
import { BallotForm } from "./BallotForm";

export function ParticipationPanel({
  access,
  resultsHref,
}: {
  access: PollAccessView;
  resultsHref: string;
}) {
  const { t } = useI18n();
  const guest = useGuest();
  const location = useLocation();
  const detail = access.detail;
  const next = `${location.pathname}${location.search}`;
  if (access.phase === "access_loading") {
    return (
      <div className="view-root" style={{ padding: "40px 0", textAlign: "center" }}>
        <p role="status" style={{ color: "#64748b", fontWeight: 600 }}>{t("access.loading")}</p>
      </div>
    );
  }
  if (access.error && access.phase !== "password_required" && access.phase !== "login_required") {
    return (
      <div className="view-root view-root-narrow" style={{ paddingTop: 30 }}>
        <div className="view-card" style={{ borderLeft: "4px solid #ef4444" }}>
          <h2 style={{ margin: "0 0 8px 0", color: "#dc2626" }}>{t("access.loadFailed")}</h2>
          <p role="alert" style={{ margin: 0, color: "#64748b" }}>{access.error}</p>
        </div>
      </div>
    );
  }
  if (access.phase === "login_required") {
    return (
      <div className="view-root view-root-narrow" style={{ paddingTop: 40 }}>
        <div className="view-card" style={{ textAlign: "center", padding: "40px 28px" }}>
          <div style={{ width: 56, height: 56, borderRadius: "50%", background: "#eff6ff", color: "#1363df", display: "grid", placeItems: "center", fontSize: "1.75rem", margin: "0 auto 16px" }}>
            👤
          </div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 800, margin: "0 0 10px 0", color: "#0f172a" }}>{t("access.signInTitle")}</h1>
          <p className="view-subtitle" style={{ maxWidth: 460, margin: "0 auto 24px" }}>
            {access.accountExpired ? t("access.sessionExpired") : t("access.namedLogin")}
          </p>
          <Link to={`/login?next=${encodeURIComponent(next)}`} className="view-btn view-btn-primary" style={{ padding: "12px 28px", textDecoration: "none" }}>
            {t("access.signInReturn")}
          </Link>
        </div>
      </div>
    );
  }
  if (access.phase === "password_required") {
    return (
      <div className="view-root view-root-narrow" style={{ paddingTop: 40 }}>
        <div className="view-card" style={{ textAlign: "center", padding: "40px 28px" }}>
          <div style={{ width: 56, height: 56, borderRadius: "50%", background: "#fef3c7", color: "#d97706", display: "grid", placeItems: "center", fontSize: "1.75rem", margin: "0 auto 16px" }}>
            🔒
          </div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 800, margin: "0 0 10px 0", color: "#0f172a" }}>{t("access.passcodeTitle")}</h1>
          <p className="view-subtitle" style={{ maxWidth: 460, margin: "0 auto 20px" }}>
            {access.grantExpired ? t("access.grantExpired") : t("access.locked")}
          </p>
          {access.entry ? (
            <div style={{ display: "inline-flex", justifyContent: "center", marginBottom: 20 }}>
              <ModeTags identity={access.entry.identity_mode} visibility={access.entry.visibility} />
            </div>
          ) : null}
        </div>
      </div>
    );
  }
  if (!detail) {
    return (
      <div className="view-root view-root-narrow" style={{ paddingTop: 30 }}>
        <div className="view-card">
          <p role="alert" style={{ margin: 0, color: "#64748b" }}>{access.error ?? t("error.pollLoad")}</p>
        </div>
      </div>
    );
  }
  const loginHref =
    detail.identity_mode === "NAMED" && access.phase !== "voted" && access.phase !== "ready"
      ? `/login?next=${encodeURIComponent(next)}`
      : undefined;
  return (
    <div className="view-root">
      <header className="view-header">
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <StatusTag status={detail.effective_status} />
          <ModeTags identity={detail.identity_mode} visibility={detail.visibility} />
        </div>
        <h1 className="view-title">{detail.title}</h1>
        {detail.description ? <p className="view-subtitle">{detail.description}</p> : null}
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 14, marginTop: 12 }}>
          <span style={{ fontSize: "0.88rem", color: "#64748b", display: "flex", alignItems: "center", gap: 6 }}>
            {formatHongKong(detail.starts_at)} {t("common.to")} {formatHongKong(detail.ends_at)} ({t("common.hkt")})
          </span>
          {detail.effective_status === "SCHEDULED" ? (
            <span style={{ fontSize: "0.88rem", color: "#d97706", fontWeight: 600 }}>{t("access.notStarted")}</span>
          ) : null}
          {detail.effective_status === "CLOSED" ? (
            <span style={{ fontSize: "0.88rem", color: "#dc2626", fontWeight: 600 }}>{t("access.ended")}</span>
          ) : null}
        </div>
      </header>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 20 }}>
        {detail.can_view_results ? (
          <Link to={resultsHref} className="view-btn view-btn-secondary" style={{ textDecoration: "none" }}>
            {t("access.viewResults")}
          </Link>
        ) : null}
        {detail.can_manage ? (
          <Link to={`/my-polls/${detail.id}`} className="view-btn view-btn-secondary" style={{ textDecoration: "none" }}>
            {t("access.workspace")}
          </Link>
        ) : null}
      </div>

      {access.phase === "submission_unknown" ? <p data-testid="unknown-status">{t("access.notFound")}</p> : null}
      <BallotForm
        poll={detail}
        guestReady={guest.guestStatus === "ready"}
        loginHref={loginHref}
        onCast={(optionId) => castVote(detail.id, optionId)}
        onRecover={async () => {
          try {
            const next = await getPoll(detail.id);
            access.reload();
            return next;
          } catch {
            access.markUnknown();
            return null;
          }
        }}
      />
    </div>
  );
}
