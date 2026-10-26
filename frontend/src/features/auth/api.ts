import { apiClient } from "../../lib/http";
import type { SessionPublic, UserPublic } from "../../lib/api-types";

export type RegisterBody = {
  username: string;
  display_name: string;
  password: string;
};

export type LoginBody = {
  username: string;
  password: string;
};

export function registerAccount(body: RegisterBody): Promise<UserPublic> {
  return apiClient({ method: "POST", path: "/api/v1/auth/register", data: body, csrfSource: "none" });
}

export function loginAccount(body: LoginBody): Promise<SessionPublic> {
  return apiClient({ method: "POST", path: "/api/v1/auth/login", data: body, csrfSource: "none" });
}

export function currentSession(): Promise<SessionPublic> {
  return apiClient({ path: "/api/v1/auth/me" });
}

export function logoutAccount(): Promise<null> {
  return apiClient({
    method: "POST",
    path: "/api/v1/auth/logout",
    data: {},
    csrfSource: "auth",
    allowNull: true,
  });
}
