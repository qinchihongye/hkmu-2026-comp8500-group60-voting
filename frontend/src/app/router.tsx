import { Navigate, Route, Routes } from "react-router-dom";

import { RequireAuth } from "../features/auth/RequireAuth";
import { AppLayout } from "../layouts/AppLayout";
import { AdminAuditPage } from "../pages/AdminAuditPage";
import { AdminElectionCreatePage } from "../pages/AdminElectionCreatePage";
import { AdminElectionDetailPage } from "../pages/AdminElectionDetailPage";
import { AdminElectionRegistrationsPage } from "../pages/AdminElectionRegistrationsPage";
import { AdminElectionsPage } from "../pages/AdminElectionsPage";
import { AdminPollDetailPage } from "../pages/AdminPollDetailPage";
import { AdminPollsPage } from "../pages/AdminPollsPage";
import { DashboardPage } from "../pages/DashboardPage";
import { ElectionBallotPage } from "../pages/ElectionBallotPage";
import { ElectionDetailPage } from "../pages/ElectionDetailPage";
import { ElectionRegisterPage } from "../pages/ElectionRegisterPage";
import { ElectionResultPage } from "../pages/ElectionResultPage";
import { ElectionsPage } from "../pages/ElectionsPage";
import { ForbiddenPage } from "../pages/ForbiddenPage";
import { LoginPage } from "../pages/LoginPage";
import { MyElectionRegistrationsPage } from "../pages/MyElectionRegistrationsPage";
import { MyPollsPage } from "../pages/MyPollsPage";
import { MyVotesPage } from "../pages/MyVotesPage";
import { NotFoundPage } from "../pages/NotFoundPage";
import { PollAccessPage } from "../pages/PollAccessPage";
import { PollDetailPage } from "../pages/PollDetailPage";
import { PollEditPage } from "../pages/PollEditPage";
import { PollResultPage } from "../pages/PollResultPage";
import { PollWorkspacePage } from "../pages/PollWorkspacePage";
import { RegisterPage } from "../pages/RegisterPage";
import { ShareEntryPage } from "../pages/ShareEntryPage";

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route element={<AppLayout />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/overview" element={<DashboardPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/public-polls" element={<Navigate to="/overview" replace />} />
        <Route path="/polls/:id" element={<PollDetailPage />} />
        <Route path="/polls/:id/results" element={<PollResultPage />} />
        <Route path="/s/:shareCode" element={<ShareEntryPage />} />
        <Route path="/s/:shareCode/access" element={<PollAccessPage />} />
        <Route path="/s/:shareCode/results" element={<PollResultPage />} />
        <Route path="/elections" element={<ElectionsPage />} />
        <Route path="/elections/:id" element={<ElectionDetailPage />} />
        <Route path="/elections/:id/register" element={<RequireAuth><ElectionRegisterPage /></RequireAuth>} />
        <Route path="/elections/:id/vote" element={<RequireAuth><ElectionBallotPage /></RequireAuth>} />
        <Route path="/elections/:id/results" element={<ElectionResultPage />} />
        <Route path="/my-election-registrations" element={<RequireAuth><MyElectionRegistrationsPage /></RequireAuth>} />
        <Route path="/my-polls" element={<RequireAuth><MyPollsPage /></RequireAuth>} />
        <Route path="/my-polls/new" element={<RequireAuth><PollEditPage /></RequireAuth>} />
        <Route path="/my-polls/:id" element={<RequireAuth><PollWorkspacePage /></RequireAuth>} />
        <Route path="/my-polls/:id/edit" element={<RequireAuth><PollEditPage /></RequireAuth>} />
        <Route path="/my-votes" element={<RequireAuth><MyVotesPage /></RequireAuth>} />
        <Route path="/admin/polls" element={<RequireAuth role="ADMIN"><AdminPollsPage /></RequireAuth>} />
        <Route path="/admin/polls/:id" element={<RequireAuth role="ADMIN"><AdminPollDetailPage /></RequireAuth>} />
        <Route path="/admin/elections" element={<RequireAuth role="ADMIN"><AdminElectionsPage /></RequireAuth>} />
        <Route path="/admin/elections/new" element={<RequireAuth role="ADMIN"><AdminElectionCreatePage /></RequireAuth>} />
        <Route path="/admin/elections/:id" element={<RequireAuth role="ADMIN"><AdminElectionDetailPage /></RequireAuth>} />
        <Route path="/admin/elections/:id/registrations" element={<RequireAuth role="ADMIN"><AdminElectionRegistrationsPage /></RequireAuth>} />
        <Route path="/admin/audit" element={<RequireAuth role="ADMIN"><AdminAuditPage /></RequireAuth>} />
        <Route path="/403" element={<ForbiddenPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
