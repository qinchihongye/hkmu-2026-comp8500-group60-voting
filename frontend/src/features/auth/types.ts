import type { UserPublic } from "../../lib/api-types";

export type AuthStatus = "loading" | "authenticated" | "anonymous";

export type AuthState = {
  status: AuthStatus;
  user: UserPublic | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
};
