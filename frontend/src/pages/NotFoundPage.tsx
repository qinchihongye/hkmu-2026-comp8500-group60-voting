import { Link } from "react-router-dom";

import { useI18n } from "../i18n/LocaleProvider";

export function NotFoundPage() {
  const { t } = useI18n();
  return (
    <div className="view-root view-root-narrow" style={{ paddingTop: 60 }}>
      <section className="view-card" style={{ textAlign: "center", padding: "48px 32px" }}>
        <div style={{ width: 64, height: 64, borderRadius: "50%", background: "#eff6ff", color: "#1363df", display: "grid", placeItems: "center", fontSize: "2rem", margin: "0 auto 16px" }}>
          🔍
        </div>
        <h1 className="view-title" style={{ fontSize: "1.75rem", margin: "12px 0 8px 0" }}>{t("missing.title")}</h1>
        <p className="view-subtitle" style={{ maxWidth: 440, margin: "0 auto 24px" }}>
          {t("missing.note")}
        </p>
        <Link to="/public-polls" className="view-btn view-btn-primary" style={{ textDecoration: "none" }}>
          {t("missing.action")}
        </Link>
      </section>
    </div>
  );
}
