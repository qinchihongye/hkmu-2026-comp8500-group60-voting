import { Link } from "react-router-dom";

import { ModeTags, StatusTag } from "../../components/StatusTag";
import { formatHongKong } from "../../lib/time";
import type { PollSummary } from "../../lib/api-types";

export function PollCard({ poll }: { poll: PollSummary }) {
  const isOpen = poll.effective_status === "OPEN";
  const isClosed = poll.effective_status === "CLOSED";

  return (
    <article className="plaza-card" data-testid="poll-card">
      <div>
        {/* Top Badges */}
        <div className="plaza-card-top">
          <div className="plaza-card-badges">
            <StatusTag status={poll.effective_status} />
            <ModeTags identity={poll.identity_mode} visibility={poll.visibility} />
          </div>
        </div>

        {/* Title */}
        <h3 className="plaza-card-title">
          <Link to={`/polls/${poll.id}`}>{poll.title}</Link>
        </h3>
      </div>

      <div>
        {/* Schedule Info */}
        <div className="plaza-card-meta">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 14 14" />
          </svg>
          <span>
            {formatHongKong(poll.starts_at)} – {formatHongKong(poll.ends_at)}
          </span>
        </div>

        {/* Footer Actions */}
        <div className="plaza-card-footer">
          <Link
            to={isClosed ? `/polls/${poll.id}/results` : `/polls/${poll.id}`}
            className={`plaza-action-btn ${isOpen ? "primary" : "secondary"}`}
          >
            {isOpen ? "Vote Now →" : isClosed ? "View Results →" : "View Details →"}
          </Link>
        </div>
      </div>
    </article>
  );
}
