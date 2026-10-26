import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { emptyPollForm, PollForm } from "../features/creator/PollForm";
import { createPoll, getOwnedPoll, updatePoll } from "../features/creator/api";
import type { PollFormValue } from "../features/creator/types";
import { useFailure } from "../i18n/errors";
import { useI18n } from "../i18n/LocaleProvider";
import { isoToHongKongParts } from "../lib/time";
import type { IdentityMode, ManagePollDetail, PollWriteBody, Visibility } from "../lib/api-types";

function fromDetail(poll: ManagePollDetail): PollFormValue {
  const starts = isoToHongKongParts(poll.starts_at);
  const ends = isoToHongKongParts(poll.ends_at);
  return {
    title: poll.title,
    description: poll.description ?? "",
    identityMode: poll.identity_mode as IdentityMode,
    visibility: poll.visibility as Visibility,
    accessPassword: "",
    options: poll.options.slice().sort((left, right) => left.position - right.position).map((option) => option.label),
    startsDate: starts.date,
    startsTime: starts.time,
    endsDate: ends.date,
    endsTime: ends.time,
  };
}

export function PollEditPage() {
  const { t } = useI18n();
  const failure = useFailure("error.draftLoad");
  const { setCause } = failure;
  const params = useParams();
  const navigate = useNavigate();
  const pollId = params.id ? Number(params.id) : null;
  const [initial, setInitial] = useState<PollFormValue | null>(pollId ? null : emptyPollForm());
  const [version, setVersion] = useState<number | null>(null);
  const [frozen, setFrozen] = useState(false);

  useEffect(() => {
    if (pollId === null) {
      return;
    }
    let cancelled = false;
    void getOwnedPoll(pollId)
      .then((poll) => {
        if (cancelled) {
          return;
        }
        setInitial(fromDetail(poll));
        setVersion(poll.version);
        setFrozen(poll.lifecycle !== "DRAFT" || !poll.can_manage);
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setCause(caught);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [pollId, setCause]);

  async function save(body: PollWriteBody) {
    if (pollId === null) {
      const created = await createPoll(body);
      navigate(`/my-polls/${created.id}`);
      return;
    }
    if (version === null) {
      return;
    }
    const updated = await updatePoll(pollId, { ...body, expected_version: version });
    navigate(`/my-polls/${updated.id}`);
  }

  if (failure.message) {
    return (
      <div className="view-root view-root-narrow" style={{ paddingTop: 30 }}>
        <div className="view-card" style={{ borderLeft: "4px solid #ef4444" }}>
          <p role="alert" style={{ margin: 0, color: "#dc2626", fontWeight: 600 }}>{failure.message}</p>
        </div>
      </div>
    );
  }
  if (!initial) {
    return (
      <div className="view-root" style={{ padding: "40px 0", textAlign: "center" }}>
        <p role="status" style={{ color: "#64748b", fontWeight: 600 }}>{t("common.loading")}</p>
      </div>
    );
  }
  if (frozen) {
    return (
      <div className="view-root view-root-narrow" style={{ paddingTop: 40 }}>
        <div className="view-card" style={{ textAlign: "center", padding: "40px 24px" }}>
          <div style={{ width: 56, height: 56, borderRadius: "50%", background: "#fef3c7", color: "#d97706", display: "grid", placeItems: "center", fontSize: "1.75rem", margin: "0 auto 16px" }}>
            🔒
          </div>
          <h1 className="view-title" style={{ fontSize: "1.5rem", marginBottom: 12 }}>{t("workspace.frozenTitle")}</h1>
          <p className="view-subtitle" style={{ maxWidth: 440, margin: "0 auto 20px" }}>
            {t("workspace.frozenNote")}
          </p>
          <button
            type="button"
            className="view-btn view-btn-primary"
            onClick={() => navigate(`/my-polls/${pollId}`)}
          >
            {t("workspace.back")}
          </button>
        </div>
      </div>
    );
  }
  return <PollForm initial={initial} mode={pollId === null ? "create" : "edit"} onSubmit={save} />;
}
