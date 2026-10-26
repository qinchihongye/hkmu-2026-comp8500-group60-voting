import { useParams } from "react-router-dom";

import { useI18n } from "../i18n/LocaleProvider";
import { ParticipationPanel } from "../features/polls/ParticipationPanel";
import { usePollAccess } from "../features/poll-access/usePollAccess";

export function PollDetailPage() {
  const { t } = useI18n();
  const params = useParams();
  const pollId = Number(params.id);
  const access = usePollAccess({ pollId: Number.isInteger(pollId) ? pollId : undefined });
  if (!Number.isInteger(pollId)) {
    return <p>{t("error.invalidPollId")}</p>;
  }
  return <ParticipationPanel access={access} resultsHref={`/polls/${pollId}/results`} />;
}
