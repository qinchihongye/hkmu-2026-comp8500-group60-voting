import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { PageState } from "../../components/PageState";
import { useAuth } from "./AuthProvider";

export function RequireAuth({ children, role }: { children: ReactNode; role?: "ADMIN" }) {
  const auth = useAuth();
  const location = useLocation();
  if (auth.status === "loading") {
    return <PageState loading />;
  }
  if (auth.status !== "authenticated" || !auth.user) {
    const next = `${location.pathname}${location.search}`;
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
  }
  if (role && auth.user.role !== role) {
    return <Navigate to="/403" replace />;
  }
  return children;
}
