import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { AuthLocaleMenu } from "../components/AuthLocaleMenu";
import { ComingSoonModal } from "../components/ComingSoonModal";
import { PolicyModal } from "../components/PolicyModal";
import { registerAccount } from "../features/auth/api";
import { I18nError, useFailure } from "../i18n/errors";
import { useI18n } from "../i18n/LocaleProvider";
import { safeNextPath } from "../lib/navigation";
import "../styles/auth.css";

function getPasswordStrength(pwd: string, isZh: boolean) {
  if (!pwd) return { score: 0, label: "", color: "" };
  let score = 0;
  if (pwd.length >= 6) score++;
  if (pwd.length >= 10) score++;
  if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) score++;
  if (/\d/.test(pwd)) score++;
  if (/[^A-Za-z0-9]/.test(pwd)) score++;
  const finalScore = Math.min(4, Math.max(1, score <= 1 ? 1 : score <= 2 ? 2 : score <= 3 ? 3 : 4));
  const labelsZh = ["", "弱", "中等", "良好", "极强"];
  const labelsEn = ["", "Weak", "Fair", "Good", "Strong"];
  const colors = ["", "#f43f5e", "#f59e0b", "#3b82f6", "#10b981"];
  return {
    score: finalScore,
    label: isZh ? labelsZh[finalScore] : labelsEn[finalScore],
    color: colors[finalScore],
  };
}

export function RegisterPage() {
  const { locale, t } = useI18n();
  const failure = useFailure("error.registerFailed");
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get("next") ? safeNextPath(params.get("next")) : null;
  const loginTarget = next ? `/login?next=${encodeURIComponent(next)}` : "/login";
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showSocialModal, setShowSocialModal] = useState(false);
  const [agree, setAgree] = useState(true);
  const [busy, setBusy] = useState(false);
  const [policyModal, setPolicyModal] = useState<{ open: boolean; title: string }>({ open: false, title: "" });
  const strength = getPasswordStrength(password, locale === "zh");

  async function submit() {
    if (!agree) {
      failure.setCause(new I18nError("error.agree"));
      return;
    }
    setBusy(true);
    failure.clear();
    try {
      await registerAccount({ username, display_name: displayName, password });
      navigate(next ? `${loginTarget}&registered=1` : "/login?registered=1", { replace: true });
    } catch (caught) {
      failure.setCause(caught);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      {/* Top Right Header Action: Skip as Guest */}
      <header className="auth-skip-header">
        <AuthLocaleMenu />
      </header>

      <div className="auth-container">
        {/* ================= LEFT SECTION: Cobalt Blue with Organic Scallop Wave ================= */}
        <section className="auth-hero-section">
          {/* Wave Divider SVG */}
          <svg
            className="auth-hero-wave"
            viewBox="0 0 100 800"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {/* Layer 1: Deep Sky Blue */}
            <path
              d="M 100 0 L 100 800 L 20 800 C 45 740, 45 660, 15 600 C 50 540, 50 460, 20 400 C 55 340, 55 260, 25 200 C 60 140, 60 60, 30 0 Z"
              fill="#3b82f6"
              opacity="0.4"
            />
            {/* Layer 2: Light Sky Blue */}
            <path
              d="M 100 0 L 100 800 L 40 800 C 65 730, 65 650, 35 590 C 70 530, 70 450, 40 390 C 75 330, 75 250, 45 190 C 80 130, 80 50, 50 0 Z"
              fill="#93c5fd"
              opacity="0.75"
            />
            {/* Layer 3: Pure White (flows into right background) */}
            <path
              d="M 100 0 L 100 800 L 60 800 C 85 720, 85 640, 55 580 C 90 520, 90 440, 60 380 C 95 320, 95 240, 65 180 C 100 120, 100 40, 70 0 Z"
              fill="#ffffff"
            />
          </svg>

          {/* Mobile Horizontal Cloud Scallop Wave (only rendered on mobile) */}
          <svg
            className="auth-mobile-wave"
            viewBox="0 0 375 64"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {/* Layer 1: Deep Sky Blue Cloud */}
            <path
              d="M 0 64 L 375 64 L 375 32 Q 355 16 330 22 Q 300 8 265 18 Q 235 4 195 14 Q 160 4 125 16 Q 95 8 65 20 Q 35 14 0 30 Z"
              fill="#2563eb"
              opacity="0.4"
            />
            {/* Layer 2: Soft Sky Blue Cloud */}
            <path
              d="M 0 64 L 375 64 L 375 40 Q 350 24 320 30 Q 285 14 245 24 Q 210 10 170 22 Q 130 12 95 26 Q 55 18 0 38 Z"
              fill="#93c5fd"
              opacity="0.75"
            />
            {/* Layer 3: Solid Pure White Cloud */}
            <path
              d="M 0 64 L 375 64 L 375 48 Q 345 30 310 38 Q 275 20 230 32 Q 190 16 145 30 Q 105 20 65 34 Q 30 26 0 46 Z"
              fill="#ffffff"
            />
          </svg>

          {/* Center Brand Badge & Description */}
          <div className="auth-hero-center">
            <div className="auth-hero-top">{t("auth.welcome")}</div>
            <div className="auth-brand-badge">
              <img className="auth-brand-icon" src="/favicon.png" alt="" />
            </div>
            <div className="auth-brand-title">VoteMaster</div>
            <p className="auth-brand-desc">{t("auth.registerPitch")}</p>
          </div>
        </section>

        {/* ================= RIGHT SECTION: Pure White Minimalist Form ================= */}
        <section className="auth-form-section">
          <div className="auth-form-container">
            <h2 className="auth-form-heading">{t("auth.registerTitle")}</h2>

            <form
              className="auth-form"
              onSubmit={(event) => {
                event.preventDefault();
                void submit();
              }}
            >
              {/* Full Name Field */}
              <div className="auth-field">
                <label htmlFor="reg-display-name" className="auth-field-label">
                  {t("auth.displayName")}
                </label>
                <input
                  id="reg-display-name"
                  value={displayName}
                  placeholder={t("auth.displayNameHint")}
                  className="auth-field-input"
                  onChange={(event) => setDisplayName(event.target.value)}
                />
              </div>

              {/* Username / Email Field */}
              <div className="auth-field">
                <label htmlFor="reg-username" className="auth-field-label">
                  {t("auth.username")}
                </label>
                <input
                  id="reg-username"
                  value={username}
                  autoComplete="username"
                  placeholder={t("auth.usernameHint")}
                  className="auth-field-input"
                  onChange={(event) => setUsername(event.target.value)}
                />
              </div>

              {/* Password Field */}
              <div className="auth-field">
                <label htmlFor="reg-password" className="auth-field-label">
                  {t("auth.password")}
                </label>
                <div className="auth-password-wrapper">
                  <input
                    id="reg-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder={t("auth.passwordRule")}
                    className="auth-field-input auth-password-input"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                  <button
                    type="button"
                    className="auth-password-toggle"
                    aria-label={showPassword ? t("common.hidePassword") : t("common.showPassword")}
                    title={showPassword ? t("common.hidePassword") : t("common.showPassword")}
                    onClick={() => setShowPassword((prev) => !prev)}
                  >
                    {showPassword ? (
                      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                        <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                        <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
                        <line x1="2" y1="2" x2="22" y2="22" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
                {password.length > 0 && (
                  <div className="auth-password-strength" aria-live="polite">
                    <div className="auth-strength-bars">
                      <div className={`auth-strength-bar ${strength.score >= 1 ? `active level-${strength.score}` : ""}`} />
                      <div className={`auth-strength-bar ${strength.score >= 2 ? `active level-${strength.score}` : ""}`} />
                      <div className={`auth-strength-bar ${strength.score >= 3 ? `active level-${strength.score}` : ""}`} />
                      <div className={`auth-strength-bar ${strength.score >= 4 ? `active level-${strength.score}` : ""}`} />
                    </div>
                    <span className="auth-strength-label" style={{ color: strength.color }}>
                      {strength.label}
                    </span>
                  </div>
                )}
              </div>

              {/* Checkbox: Terms and Conditions */}
              <div className="auth-checkbox-row">
                <input
                  id="reg-agree"
                  type="checkbox"
                  checked={agree}
                  onChange={(e) => setAgree(e.target.checked)}
                />
                <label htmlFor="reg-agree" className="auth-checkbox-label">
                  {locale === "zh" ? (
                    <>
                      我已阅读并同意
                      <button
                        type="button"
                        className="auth-policy-link"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setPolicyModal({ open: true, title: "服务协议" });
                        }}
                      >
                        《服务协议》
                      </button>
                      与
                      <button
                        type="button"
                        className="auth-policy-link"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setPolicyModal({ open: true, title: "隐私政策" });
                        }}
                      >
                        《隐私政策》
                      </button>
                    </>
                  ) : (
                    <>
                      I agree to the{" "}
                      <button
                        type="button"
                        className="auth-policy-link"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setPolicyModal({ open: true, title: "Terms of Service" });
                        }}
                      >
                        Terms of Service
                      </button>{" "}
                      and{" "}
                      <button
                        type="button"
                        className="auth-policy-link"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setPolicyModal({ open: true, title: "Privacy Policy" });
                        }}
                      >
                        Privacy Policy
                      </button>
                    </>
                  )}
                </label>
              </div>

              {failure.message ? (
                <div
                  role="alert"
                  style={{
                    padding: "10px 14px",
                    background: "rgba(244, 63, 94, 0.1)",
                    border: "1px solid rgba(244, 63, 94, 0.3)",
                    borderRadius: 8,
                    color: "#e11d48",
                    fontSize: "0.88rem",
                    fontWeight: 500,
                  }}
                >
                  ⚠️ {failure.message}
                </div>
              ) : null}

              <div className="auth-actions">
                <button type="submit" disabled={busy} className="auth-primary-btn">
                  {busy ? t("auth.creating") : t("nav.signUp")}
                </button>
                <Link to="/overview" className="auth-guest-btn">
                  {t("auth.guest")}
                </Link>
              </div>
            </form>

            {/* Social Divider */}
            <div className="auth-social-divider">
              <span>{t("auth.signUpWith")}</span>
            </div>

            {/* Social Icons Row */}
            <div className="auth-social-row">
              {/* Facebook */}
              <button
                type="button"
                className="auth-social-icon-btn"
                title="Facebook"
                onClick={() => setShowSocialModal(true)}
              >
                <svg viewBox="0 0 24 24" width="20" height="20" fill="#1877F2">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                </svg>
              </button>
              {/* X */}
              <button
                type="button"
                className="auth-social-icon-btn"
                title="X"
                onClick={() => setShowSocialModal(true)}
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="#0f172a">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </button>
              {/* Google */}
              <button
                type="button"
                className="auth-social-icon-btn"
                title="Google"
                onClick={() => setShowSocialModal(true)}
              >
                <svg viewBox="0 0 24 24" width="20" height="20">
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="#EA4335"
                  />
                </svg>
              </button>
              {/* Apple */}
              <button
                type="button"
                className="auth-social-icon-btn"
                title="Apple"
                onClick={() => setShowSocialModal(true)}
              >
                <svg viewBox="0 0 24 24" width="20" height="20" fill="#0f172a">
                  <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.05 2.25.82 2.98.82.74 0 1.94-.92 3.44-.79 1.15.04 2.23.47 3.02 1.25-2.6 1.56-2.14 4.88.54 5.92-.68 1.9-1.63 4.1-2.98 5.77zm-3.72-13.8c-.28-2.26 1.4-4.22 3.65-4.48.33 2.4-1.66 4.41-3.65 4.48z" />
                </svg>
              </button>
            </div>

            {/* Bottom Link */}
            <div className="auth-footer-prompt">
              <span>{t("auth.hasAccount")}</span>
              <Link to={loginTarget}>{t("nav.signIn")}</Link>
            </div>
          </div>
        </section>
      </div>

      {/* Coming Soon Modal for Social Login */}
      <ComingSoonModal
        open={showSocialModal}
        onClose={() => setShowSocialModal(false)}
      />

      {/* Terms of Service & Privacy Policy Modal */}
      <PolicyModal
        open={policyModal.open}
        title={policyModal.title}
        onClose={() => setPolicyModal({ open: false, title: "" })}
      />
    </div>
  );
}
