import { useI18n } from "../i18n/LocaleProvider";
import type { MessageKey } from "../i18n/messages";

interface StatusConfig {
  bg: string;
  color: string;
  border: string;
  key: MessageKey;
  dot?: boolean;
}

const STATUS_MAP: Record<string, StatusConfig> = {
  OPEN: { bg: "#ecfdf5", color: "#059669", border: "#a7f3d0", key: "status.open", dot: true },
  SCHEDULED: { bg: "#fffbeb", color: "#b45309", border: "#fde68a", key: "status.scheduled" },
  CLOSED: { bg: "#f1f5f9", color: "#475569", border: "#e2e8f0", key: "status.closed" },
  DRAFT: { bg: "#faf5ff", color: "#7c3aed", border: "#ddd6fe", key: "status.draft" },
};

export function StatusTag({ status }: { status: string }) {
  const { t } = useI18n();
  const conf = STATUS_MAP[status];
  const label = conf ? t(conf.key) : status;
  const colors = conf ?? { bg: "#f8fafc", color: "#64748b", border: "#e2e8f0" };

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "3px 10px",
        borderRadius: 9999,
        background: colors.bg,
        color: colors.color,
        border: `1px solid ${colors.border}`,
        fontSize: "0.72rem",
        fontWeight: 700,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        whiteSpace: "nowrap",
      }}
    >
      {conf?.dot ? (
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "currentColor",
            boxShadow: "0 0 0 2px rgba(16, 185, 129, 0.25)",
          }}
        />
      ) : null}
      <span>{label}</span>
    </span>
  );
}

export function ModeTags({ identity, visibility }: { identity: string; visibility: string }) {
  const { t } = useI18n();
  const isPrivate = visibility === "PRIVATE";
  const isAnonymous = identity === "ANONYMOUS";

  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          padding: "3px 9px",
          borderRadius: 9999,
          background: isAnonymous ? "#f5f3ff" : "#eef4ff",
          color: isAnonymous ? "#7c3aed" : "#1363df",
          border: `1px solid ${isAnonymous ? "#ddd6fe" : "#bfdbfe"}`,
          fontSize: "0.72rem",
          fontWeight: 700,
          letterSpacing: "0.03em",
          whiteSpace: "nowrap",
        }}
      >
        <span>{isAnonymous ? t("identity.anonymous") : t("identity.named")}</span>
      </span>
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          padding: "3px 9px",
          borderRadius: 9999,
          background: isPrivate ? "#fff1f2" : "#f0fdf4",
          color: isPrivate ? "#e11d48" : "#166534",
          border: `1px solid ${isPrivate ? "#fecdd3" : "#bbf7d0"}`,
          fontSize: "0.72rem",
          fontWeight: 700,
          letterSpacing: "0.03em",
          whiteSpace: "nowrap",
        }}
      >
        <span>{isPrivate ? t("visibility.private") : t("visibility.public")}</span>
      </span>
    </div>
  );
}
