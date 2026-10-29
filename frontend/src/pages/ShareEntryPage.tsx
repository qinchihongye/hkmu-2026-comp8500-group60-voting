import { useParams } from "react-router-dom";

import { ParticipationPanel } from "../features/polls/ParticipationPanel";
import { usePollAccess } from "../features/poll-access/usePollAccess";

export function ShareEntryPage() {
  const params = useParams();
  const shareCode = params.shareCode ?? "";
  const access = usePollAccess({ shareCode });
  return (
    <div className="view-root">
      <ParticipationPanel access={access} resultsHref={`/s/${shareCode}/results`} />
    </div>
  );
}
