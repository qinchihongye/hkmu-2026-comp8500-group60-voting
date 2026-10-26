import { useCallback, useState } from "react";

import { ApiCode } from "../lib/api-codes";
import { isApiClientError } from "../lib/api-error";
import { useI18n, type Translate } from "./LocaleProvider";
import type { MessageKey } from "./messages";

const API_ERROR_KEYS: Record<number, MessageKey> = {
  [ApiCode.UNAUTHENTICATED]: "error.unauthenticated",
  [ApiCode.INVALID_CREDENTIALS]: "error.invalidCredentials",
  [ApiCode.FORBIDDEN]: "error.forbidden",
  [ApiCode.CSRF_FAILED]: "error.csrf",
  [ApiCode.RESULTS_NOT_AVAILABLE]: "error.resultsHidden",
  [ApiCode.POLL_PASSWORD_INVALID]: "error.passwordInvalid",
  [ApiCode.POLL_ACCESS_REQUIRED]: "error.accessRequired",
  [ApiCode.NOT_FOUND]: "error.notFound",
  [ApiCode.POLL_NOT_FOUND]: "error.pollNotFound",
  [ApiCode.METHOD_NOT_ALLOWED]: "error.method",
  [ApiCode.ALREADY_VOTED]: "error.alreadyVoted",
  [ApiCode.POLL_NOT_OPEN]: "error.pollNotOpen",
  [ApiCode.POLL_IMMUTABLE]: "error.immutable",
  [ApiCode.STALE_POLL_VERSION]: "error.stale",
  [ApiCode.USERNAME_TAKEN]: "error.usernameTaken",
  [ApiCode.UNSUPPORTED_MEDIA_TYPE]: "error.media",
  [ApiCode.VALIDATION_ERROR]: "error.validation",
  [ApiCode.INVALID_OPTION]: "error.invalidOption",
  [ApiCode.TOO_MANY_ATTEMPTS]: "error.tooMany",
  [ApiCode.INTERNAL_ERROR]: "error.internal",
  [ApiCode.SERVICE_UNAVAILABLE]: "error.unavailable",
  [ApiCode.SUBMISSION_STATUS_UNKNOWN]: "error.submissionUnknown",
};

export class I18nError extends Error {
  readonly key: MessageKey;

  constructor(key: MessageKey) {
    super(key);
    this.name = "I18nError";
    this.key = key;
  }
}

/** 按错误码显示当前语言。字段级原文和未知码保留服务器说明。 */
export function explain(error: unknown, fallback: MessageKey, t: Translate): string {
  if (error instanceof I18nError) {
    return t(error.key);
  }
  if (isApiClientError(error)) {
    const field = Object.values(error.fieldErrors())[0];
    if (field) {
      return field;
    }
    if (error.kind === "network") {
      return t("error.network");
    }
    if (error.kind === "parse") {
      return t("error.parse");
    }
    const key = API_ERROR_KEYS[error.code];
    if (key) {
      return t(key);
    }
    if (error.message) {
      return error.message;
    }
  }
  return t(fallback);
}

export function useFailure(fallback: MessageKey) {
  const { t } = useI18n();
  const [cause, setCause] = useState<unknown>(null);
  const clear = useCallback(() => setCause(null), []);
  return {
    message: cause == null ? null : explain(cause, fallback, t),
    setCause,
    clear,
  };
}
