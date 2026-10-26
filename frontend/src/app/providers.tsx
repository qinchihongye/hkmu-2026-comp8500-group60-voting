import { App as AntdApp, ConfigProvider } from "antd";
import enUS from "antd/locale/en_US";
import zhCN from "antd/locale/zh_CN";
import type { ReactNode } from "react";

import { AuthProvider } from "../features/auth/AuthProvider";
import { GuestProvider } from "../features/poll-access/GuestProvider";
import { LocaleProvider, useI18n } from "../i18n/LocaleProvider";

const theme = {
  token: {
    colorPrimary: "#6366f1",
    colorPrimaryHover: "#4f46e5",
    colorLink: "#6366f1",
    colorLinkHover: "#4f46e5",
    colorSuccess: "#10b981",
    colorWarning: "#f59e0b",
    colorError: "#f43f5e",
    colorText: "#111827",
    colorTextSecondary: "#4b5563",
    colorBgBase: "#ffffff",
    colorBgContainer: "rgba(255, 255, 255, 0.75)",
    colorBgLayout: "#f8fafc",
    borderRadius: 16,
    borderRadiusSM: 8,
    borderRadiusLG: 24,
    controlHeight: 44,
    fontFamily: "'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    boxShadow: "0 20px 60px rgba(0, 0, 0, 0.05)",
  },
  components: {
    Button: {
      fontWeight: 600,
      controlHeight: 44,
      borderRadius: 10,
    },
    Card: {
      borderRadiusLG: 16,
    },
    Tag: {
      borderRadiusSM: 8,
    },
  },
};

function AntdBridge({ children }: { children: ReactNode }) {
  const { locale } = useI18n();
  return (
    <ConfigProvider theme={theme} locale={locale === "zh" ? zhCN : enUS}>
      <AntdApp>
        <AuthProvider>
          <GuestProvider>{children}</GuestProvider>
        </AuthProvider>
      </AntdApp>
    </ConfigProvider>
  );
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <LocaleProvider>
      <AntdBridge>{children}</AntdBridge>
    </LocaleProvider>
  );
}
