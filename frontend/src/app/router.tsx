import { Route, Routes } from "react-router-dom";

import { RequireAuth } from "../features/auth/RequireAuth";
import { AppLayout } from "../layouts/AppLayout";
import { AdminAuditPage } from "../pages/AdminAuditPage";
import { AdminPollDetailPage } from "../pages/AdminPollDetailPage";
import { AdminPollsPage } from "../pages/AdminPollsPage";
import { DashboardPage } from "../pages/DashboardPage";
import { ForbiddenPage } from "../pages/ForbiddenPage";
import { LoginPage } from "../pages/LoginPage";
import { MyPollsPage } from "../pages/MyPollsPage";
import { MyVotesPage } from "../pages/MyVotesPage";
import { NotFoundPage } from "../pages/NotFoundPage";
import { PollAccessPage } from "../pages/PollAccessPage";
import { PollDetailPage } from "../pages/PollDetailPage";
import { PollEditPage } from "../pages/PollEditPage";
import { PollListPage } from "../pages/PollListPage";
import { PollResultPage } from "../pages/PollResultPage";
import { PollWorkspacePage } from "../pages/PollWorkspacePage";
import { RegisterPage } from "../pages/RegisterPage";
import { ShareEntryPage } from "../pages/ShareEntryPage";

export function AppRouter() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/polls" element={<PollListPage />} />
        <Route path="/polls/:id" element={<PollDetailPage />} />
        <Route path="/polls/:id/results" element={<PollResultPage />} />
        <Route path="/s/:shareCode" element={<ShareEntryPage />} />
        <Route path="/s/:shareCode/access" element={<PollAccessPage />} />
        <Route path="/s/:shareCode/results" element={<PollResultPage />} />
        <Route path="/my-polls" element={<RequireAuth><MyPollsPage /></RequireAuth>} />
        <Route path="/my-polls/new" element={<RequireAuth><PollEditPage /></RequireAuth>} />
        <Route path="/my-polls/:id" element={<RequireAuth><PollWorkspacePage /></RequireAuth>} />
        <Route path="/my-polls/:id/edit" element={<RequireAuth><PollEditPage /></RequireAuth>} />
        <Route path="/my-votes" element={<RequireAuth><MyVotesPage /></RequireAuth>} />
        <Route path="/admin/polls" element={<RequireAuth role="ADMIN"><AdminPollsPage /></RequireAuth>} />
        <Route path="/admin/polls/:id" element={<RequireAuth role="ADMIN"><AdminPollDetailPage /></RequireAuth>} />
        <Route path="/admin/audit" element={<RequireAuth role="ADMIN"><AdminAuditPage /></RequireAuth>} />
        <Route path="/403" element={<ForbiddenPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
