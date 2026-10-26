import { useCallback, useEffect, useRef, useState } from "react";

import { explain, I18nError } from "../../i18n/errors";
import { useI18n } from "../../i18n/LocaleProvider";
import { ApiCode } from "../../lib/api-codes";
import { isApiClientError } from "../../lib/api-error";
import type { PollDetail, ShareEntry } from "../../lib/api-types";
import { useAuth } from "../auth/AuthProvider";
import { getPoll } from "../polls/api";
import { deriveAccessState } from "./access-state";
import { resolveShare } from "./api";
import { useGuest } from "./GuestProvider";
import type { AccessPhase } from "./types";

export type PollAccessView = {
  phase: AccessPhase;
  entry: ShareEntry | null;
  detail: PollDetail | null;
  error: string | null;
  accountExpired: boolean;
  grantExpired: boolean;
  reload: () => void;
  markUnknown: () => void;
  clearUnknown: () => void;
};

export function usePollAccess(options: { pollId?: number; shareCode?: string }): PollAccessView {
  const auth = useAuth();
  const guest = useGuest();
  const { t } = useI18n();
  const [entry, setEntry] = useState<ShareEntry | null>(null);
  const [detail, setDetail] = useState<PollDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorCause, setErrorCause] = useState<unknown>(null);
  const [accountExpired, setAccountExpired] = useState(false);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [grantExpired, setGrantExpired] = useState(false);
  const [submissionUnknown, setSubmissionUnknown] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const ticketRef = useRef(0);
  const queryKey = `${options.pollId ?? ""}:${options.shareCode ?? ""}:${reloadKey}:${auth.status}:${guest.guestStatus}`;
  const [seenKey, setSeenKey] = useState(queryKey);
  if (seenKey !== queryKey) {
    setSeenKey(queryKey);
    setLoading(true);
    setErrorCause(null);
    setDetail(null);
    setEntry(null);
    setAccountExpired(false);
    setNeedsLogin(false);
    setGrantExpired(false);
  }

  const reload = useCallback(() => {
    setReloadKey((value) => value + 1);
  }, []);

  useEffect(() => {
    if (auth.status === "loading" || guest.guestStatus === "loading") {
      return;
    }
    const ticket = ticketRef.current + 1;
    ticketRef.current = ticket;
    const controller = new AbortController();

    void (async () => {
      try {
        let nextEntry: ShareEntry | null = null;
        let pollId = options.pollId;
        if (options.shareCode) {
          nextEntry = await resolveShare(options.shareCode, controller.signal);
          pollId = nextEntry.poll_id;
        }
        if (ticket !== ticketRef.current) {
          return;
        }
        if (pollId === undefined) {
          setErrorCause(new I18nError("error.missingPollId"));
          setLoading(false);
          return;
        }
        try {
          const nextDetail = await getPoll(pollId, controller.signal);
          if (ticket !== ticketRef.current) {
            return;
          }
          setEntry(nextEntry);
          setDetail(nextDetail);
          setSubmissionUnknown(false);
        } catch (error) {
          if (ticket !== ticketRef.current || controller.signal.aborted) {
            return;
          }
          setEntry(nextEntry);
          if (isApiClientError(error) && error.code === ApiCode.UNAUTHENTICATED) {
            setNeedsLogin(true);
            setAccountExpired(auth.status === "authenticated");
            setDetail(null);
          } else if (
            isApiClientError(error) &&
            (error.code === ApiCode.POLL_NOT_FOUND || error.code === ApiCode.POLL_ACCESS_REQUIRED)
          ) {
            setGrantExpired(Boolean(nextEntry?.password_required));
            setDetail(null);
            if (!nextEntry?.password_required) {
              setErrorCause(error);
            }
          } else if (isApiClientError(error)) {
            setErrorCause(error);
          } else {
            setErrorCause(new I18nError("error.pollLoad"));
          }
        }
      } catch (error) {
        if (ticket !== ticketRef.current || controller.signal.aborted) {
          return;
        }
        setErrorCause(isApiClientError(error) ? error : new I18nError("error.shareLoad"));
      } finally {
        if (ticket === ticketRef.current) {
          setLoading(false);
        }
      }
    })();

    return () => {
      controller.abort();
    };
  }, [options.pollId, options.shareCode, reloadKey, auth.status, guest.guestStatus]);

  const phase = deriveAccessState({
    loading: loading || auth.status === "loading",
    authenticated: auth.status === "authenticated",
    loginRequired: needsLogin || (entry?.login_required ?? false) || detail?.identity_mode === "NAMED",
    passwordRequired: entry?.password_required ?? false,
    accountExpired,
    grantExpired,
    submissionUnknown,
    hasVoted: Boolean(detail?.has_voted),
    hasDetail: detail !== null,
  });

  const error = errorCause == null ? null : explain(errorCause, "error.pollLoad", t);

  return {
    phase,
    entry,
    detail,
    error,
    accountExpired,
    grantExpired,
    reload,
    markUnknown: () => setSubmissionUnknown(true),
    clearUnknown: () => setSubmissionUnknown(false),
  };
}
