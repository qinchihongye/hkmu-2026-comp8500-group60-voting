import { Link, useParams } from "react-router-dom";

import { useI18n } from "../i18n/LocaleProvider";
import { ParticipationPanel } from "../features/polls/ParticipationPanel";
import { usePollAccess } from "../features/poll-access/usePollAccess";

export function ShareEntryPage() {
  const { t } = useI18n();
  const params = useParams();
  const shareCode = params.shareCode ?? "";
  const access = usePollAccess({ shareCode });
  return (
    <div className="view-root">
      {access.phase === "password_required" ? (
        <div style={{ padding: "12px 18px", background: "#fef3c7", borderRadius: 12, border: "1px solid #fde68a", marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ color: "#92400e", fontWeight: 600 }}>{t("access.shareBanner")}</span>
          <Link to={`/s/${shareCode}/access`} className="view-btn view-btn-primary" style={{ padding: "8px 18px", fontSize: "0.9rem", textDecoration: "none" }}>
            {t("access.enterPasscode")}
          </Link>
        </div>
      ) : null}
      <ParticipationPanel access={access} resultsHref={`/s/${shareCode}/results`} />
    </div>
  );
}
