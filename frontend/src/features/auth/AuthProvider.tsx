import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { ApiCode } from "../../lib/api-codes";
import { isApiClientError } from "../../lib/api-error";
import { setCsrfToken } from "../../lib/http";
import { currentSession, loginAccount, logoutAccount } from "./api";
import type { AuthState } from "./types";
import type { UserPublic } from "../../lib/api-types";

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthState["status"]>("loading");
  const [user, setUser] = useState<UserPublic | null>(null);

  const applySession = useCallback((nextUser: UserPublic | null, csrf: string | null) => {
    setCsrfToken("auth", csrf);
    setUser(nextUser);
    setStatus(nextUser ? "authenticated" : "anonymous");
  }, []);

  const refreshSession = useCallback(async () => {
    try {
      const session = await currentSession();
      applySession(session.user, session.csrf_token);
    } catch (error) {
      if (isApiClientError(error) && error.code === ApiCode.UNAUTHENTICATED) {
        applySession(null, null);
        return;
      }
      applySession(null, null);
    }
  }, [applySession]);

  useEffect(() => {
    let cancelled = false;
    void currentSession()
      .then((session) => {
        if (!cancelled) {
          applySession(session.user, session.csrf_token);
        }
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        if (isApiClientError(error) && error.code !== ApiCode.UNAUTHENTICATED) {
          applySession(null, null);
          return;
        }
        applySession(null, null);
      });
    return () => {
      cancelled = true;
    };
  }, [applySession]);

  const login = useCallback(
    async (username: string, password: string) => {
      const session = await loginAccount({ username, password });
      applySession(session.user, session.csrf_token);
    },
    [applySession],
  );

  const logout = useCallback(async () => {
    await logoutAccount();
    applySession(null, null);
  }, [applySession]);

  const value = useMemo(
    () => ({ status, user, login, logout, refreshSession }),
    [status, user, login, logout, refreshSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth 必须放在 AuthProvider 内");
  }
  return value;
}
