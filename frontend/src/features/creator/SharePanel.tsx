import { useState } from "react";

import { useI18n } from "../../i18n/LocaleProvider";

export function SharePanel({
  shareUrl,
  requiresPassword,
  requiresLogin,
}: {
  shareUrl: string;
  requiresPassword: boolean;
  requiresLogin: boolean;
}) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const note = [
    requiresLogin ? t("share.login") : t("share.noLogin"),
    requiresPassword ? t("share.password") : t("share.noPassword"),
  ].join(" ");

  async function copy() {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
  }

  return (
    <section className="view-card">
      <div className="view-card-header">
        <div>
          <h2 className="view-card-title">{t("share.title")}</h2>
        </div>
      </div>

      <p className="view-subtitle" style={{ marginBottom: 16 }}>{note}</p>

      <div style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <label
            htmlFor="share-url-field"
            style={{ fontSize: "0.9rem", fontWeight: 700, color: "#334155" }}
          >
            {t("share.link")}
          </label>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            id="share-url-field"
            aria-label={t("share.link")}
            data-testid="share-url"
            readOnly
            value={shareUrl}
            style={{
              flex: 1,
              padding: "12px 16px",
              borderRadius: 10,
              border: "1.5px solid #cbd5e1",
              fontFamily: "ui-monospace, monospace",
              fontSize: "0.95rem",
              color: "#1e293b",
              background: "#f8fafc",
              outline: "none",
            }}
          />
            <button
              type="button"
              className="view-btn view-btn-primary"
              onClick={() => void copy()}
              style={{ whiteSpace: "nowrap", padding: "0 22px" }}
            >
              {t("share.copy")}
            </button>
          </div>
      </div>

      {copied ? (
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", background: "#ecfdf5", color: "#059669", borderRadius: 8, fontWeight: 700, fontSize: "0.88rem", marginBottom: 12 }}>
          <span>{t("common.copied")}</span>
        </div>
      ) : null}

      <p className="view-subtitle" style={{ fontSize: "0.85rem", margin: 0 }}>
        {t("share.manual")}
      </p>
    </section>
  );
}
