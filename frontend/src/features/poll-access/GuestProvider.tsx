import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { setCsrfToken } from "../../lib/http";
import { ensureGuestRequest } from "./api";
import type { GuestState, GuestStatus } from "./types";

const GuestContext = createContext<GuestState | null>(null);

let guestRequest: Promise<{ csrf_token: string; expires_at: string }> | null = null;

function loadGuest(): Promise<{ csrf_token: string; expires_at: string }> {
  if (guestRequest) {
    return guestRequest;
  }
  const pending = ensureGuestRequest().finally(() => {
    if (guestRequest === pending) {
      guestRequest = null;
    }
  });
  guestRequest = pending;
  return pending;
}

export function GuestProvider({ children }: { children: ReactNode }) {
  const [guestStatus, setGuestStatus] = useState<GuestStatus>("loading");
  const [guestCsrf, setGuestCsrf] = useState<string | null>(null);
  const [guestExpiresAt, setGuestExpiresAt] = useState<string | null>(null);

  const apply = useCallback((csrf: string, expiresAt: string) => {
    setCsrfToken("guest", csrf);
    setGuestCsrf(csrf);
    setGuestExpiresAt(expiresAt);
    setGuestStatus("ready");
  }, []);

  const ensureGuest = useCallback(async () => {
    const guest = await loadGuest();
    apply(guest.csrf_token, guest.expires_at);
  }, [apply]);

  useEffect(() => {
    let cancelled = false;
    void loadGuest()
      .then((guest) => {
        if (!cancelled) {
          apply(guest.csrf_token, guest.expires_at);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCsrfToken("guest", null);
          setGuestCsrf(null);
          setGuestExpiresAt(null);
          setGuestStatus("missing");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [apply]);

  const value = useMemo(
    () => ({ guestStatus, guestCsrf, guestExpiresAt, ensureGuest }),
    [guestStatus, guestCsrf, guestExpiresAt, ensureGuest],
  );
  return <GuestContext.Provider value={value}>{children}</GuestContext.Provider>;
}

export function useGuest(): GuestState {
  const value = useContext(GuestContext);
  if (!value) {
    throw new Error("useGuest 必须放在 GuestProvider 内");
  }
  return value;
}
