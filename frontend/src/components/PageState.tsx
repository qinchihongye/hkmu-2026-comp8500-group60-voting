import { Alert, Spin } from "antd";
import type { ReactNode } from "react";

import { useI18n } from "../i18n/LocaleProvider";

export function PageState({
  loading = false,
  error,
  empty,
  children,
}: {
  loading?: boolean;
  error?: string | null;
  empty?: ReactNode | string | null;
  children?: ReactNode;
}) {
  const { t } = useI18n();
  if (loading) {
    return (
      <div className="glass-card" style={{ padding: 28 }} role="status">
        <Spin description={t("common.loading")}>
          <span className="muted">{t("common.loading")}</span>
        </Spin>
      </div>
    );
  }
  if (error) {
    return <Alert type="error" showIcon title={error} />;
  }
  if (empty) {
    if (typeof empty === "string") {
      return <Alert type="info" showIcon title={empty} />;
    }
    return <>{empty}</>;
  }
  return children;
}
