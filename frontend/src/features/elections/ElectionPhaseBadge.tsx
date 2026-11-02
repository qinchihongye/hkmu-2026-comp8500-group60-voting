import type { ElectionPhase } from "./types";
import { normalizeElectionPhase } from "./types";
import { useI18n } from "../../i18n/LocaleProvider";
import "./ElectionPhaseBadge.css";

interface Props {
  phase: ElectionPhase;
  className?: string;
}

export function ElectionPhaseBadge({ phase, className = "" }: Props) {
  const { t } = useI18n();
  const canonical = normalizeElectionPhase(phase);

      const phaseMap: Record<
        string,
    { labelKey: string; colorClass: string }
  > = {
      UPCOMING: {
        labelKey: "election.phase.UPCOMING",
        colorClass: "badge-reg-sched",
      },
        REGISTRATION: {
          labelKey: "election.phase.REGISTRATION",
          colorClass: "badge-reg-open",
        },
          REVIEW: {
            labelKey: "election.phase.REVIEW",
            colorClass: "badge-reviewing",
          },
          VOTING: {
            labelKey: "election.phase.VOTING",
            colorClass: "badge-vote-open",
          },
          RESULTS: {
            labelKey: "election.phase.RESULTS",
            colorClass: "badge-closed",
          },
        };

  const item = phaseMap[canonical] || {
    labelKey: `election.phase.${canonical}`,
    colorClass: "badge-draft",
  };

  return (
    <span className={`election-phase-badge ${item.colorClass} ${className}`}>
      <span className="phase-dot" />
      {t(item.labelKey as any)}
    </span>
  );
}
