import { useI18n } from "../../i18n/LocaleProvider";
import type { ElectionPhase } from "./types";
import { normalizeElectionPhase } from "./types";
import "./ElectionLifecycleTimeline.css";

interface Props {
  phase: ElectionPhase;
}

export function getLifecycleActiveIndex(phase: ElectionPhase): number {
      const canonical = normalizeElectionPhase(phase);
      switch (canonical) {
        case "UPCOMING":
          return 0;
        case "REGISTRATION":
          return 1;
        case "REVIEW":
          return 2;
        case "VOTING":
          return 3;
        case "RESULTS":
          return 4;
        default:
          return 0;
      }
  }

  export function ElectionLifecycleTimeline({ phase }: Props) {
    const { t } = useI18n();
    const activeIndex = getLifecycleActiveIndex(phase);

    const steps = [
      {
        key: "upcoming",
        label: t("election.lifecycle.upcoming"),
        icon: (
          // Calendar / Clock Icon
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
        ),
      },
      {
        key: "registration",
        label: t("election.lifecycle.registration"),
        icon: (
          // User ID Badge Icon
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="8.5" cy="7" r="4" />
            <polyline points="17 11 19 13 23 9" />
          </svg>
        ),
      },
      {
        key: "review",
        label: t("election.lifecycle.review"),
        icon: (
          // Shield Lock / Audit Check Icon
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <polyline points="9 12 11 14 15 10" />
          </svg>
        ),
      },
      {
        key: "voting",
        label: t("election.lifecycle.voting"),
        icon: (
          // Ballot Box Icon (Exact Match to User Reference)
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
            <path d="M4 14v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" />
          </svg>
        ),
      },
      {
        key: "closed",
        label: t("election.lifecycle.closed"),
        icon: (
          // Trophy / Proclamation Icon
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
            <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
            <path d="M4 22h16" />
            <path d="M10 14.66V17c0 .55-.45 1-1 1H7" />
            <path d="M14 14.66V17c0 .55.45 1 1 1h2" />
            <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
          </svg>
        ),
      },
    ];

    return (
      <div
        className="election-timeline-wrapper"
        role="progressbar"
        aria-label="Election lifecycle timeline"
        aria-valuenow={activeIndex + 1}
        aria-valuemin={1}
        aria-valuemax={5}
      >
        {/* Connector line segments */}
        <div className="timeline-connector" aria-hidden="true">
          {[0, 1, 2, 3].map((segIdx) => {
            let segClass = "connector-pending";
            if (segIdx + 1 < activeIndex) {
              segClass = "connector-done";
            } else if (segIdx + 1 === activeIndex) {
              segClass = "connector-active";
            }
            return <div key={segIdx} className={`connector-segment ${segClass}`} />;
          })}
        </div>

        {/* Step nodes */}
        <div className="timeline-steps-track">
          {steps.map((step, idx) => {
            let stateClass = "step-pending";
            if (idx < activeIndex) {
              stateClass = "step-completed";
            } else if (idx === activeIndex) {
              stateClass = "step-active";
            }

            return (
              <div key={step.key} className={`timeline-step ${stateClass}`}>
                <div className="step-circle" title={step.label}>
                  {step.icon}
                </div>
                <span className="step-pill">{step.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

