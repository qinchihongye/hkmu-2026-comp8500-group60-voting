import type { ElectionPhase } from "./types";
import { useI18n } from "../../i18n/LocaleProvider";
import "./ElectionPhaseBadge.css";

interface Props {
  phase: ElectionPhase;
  className?: string;
}

export function ElectionPhaseBadge({ phase, className = "" }: Props) {
  const { t } = useI18n();

  const phaseMap: Record<ElectionPhase, { labelKey: string; colorClass: string }> = {
    DRAFT: { labelKey: "election.phase.DRAFT", colorClass: "badge-draft" },
    REGISTRATION_SCHEDULED: {
      labelKey: "election.phase.REGISTRATION_SCHEDULED",
      colorClass: "badge-reg-sched",
    },
    REGISTRATION_OPEN: {
      labelKey: "election.phase.REGISTRATION_OPEN",
      colorClass: "badge-reg-open",
    },
    REVIEWING: { labelKey: "election.phase.REVIEWING", colorClass: "badge-reviewing" },
    VOTING_SCHEDULED: {
      labelKey: "election.phase.VOTING_SCHEDULED",
      colorClass: "badge-vote-sched",
    },
    VOTING_OPEN: { labelKey: "election.phase.VOTING_OPEN", colorClass: "badge-vote-open" },
    CLOSED: { labelKey: "election.phase.CLOSED", colorClass: "badge-closed" },
  };

  const item = phaseMap[phase] || { labelKey: phase, colorClass: "badge-draft" };

  return (
    <span className={`election-phase-badge ${item.colorClass} ${className}`}>
      <span className="phase-dot" />
      {t(item.labelKey as any)}
    </span>
  );
}

