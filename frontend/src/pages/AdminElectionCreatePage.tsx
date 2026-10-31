import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createAdminElection } from "../features/elections/api";
import type { ElectionCandidateItem } from "../features/elections/types";
import { useI18n } from "../i18n/LocaleProvider";
import "./AdminElectionCreatePage.css";

export function AdminElectionCreatePage() {
  const { t } = useI18n();
  const navigate = useNavigate();

  const now = new Date();
  const defaultRegStart = new Date(now.getTime() + 10 * 60 * 1000).toISOString().slice(0, 16);
  const defaultRegEnd = new Date(now.getTime() + 2 * 24 * 3600 * 1000).toISOString().slice(0, 16);
  const defaultVoteStart = new Date(now.getTime() + 3 * 24 * 3600 * 1000).toISOString().slice(0, 16);
  const defaultVoteEnd = new Date(now.getTime() + 5 * 24 * 3600 * 1000).toISOString().slice(0, 16);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [regStart, setRegStart] = useState(defaultRegStart);
  const [regEnd, setRegEnd] = useState(defaultRegEnd);
  const [voteStart, setVoteStart] = useState(defaultVoteStart);
  const [voteEnd, setVoteEnd] = useState(defaultVoteEnd);
  const [allowLiveResults, setAllowLiveResults] = useState(false);
  const [candidates, setCandidates] = useState<ElectionCandidateItem[]>([
    { candidate_code: "C_1", name: "", statement: "" },
    { candidate_code: "C_2", name: "", statement: "" },
  ]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCandidateChange = (
    index: number,
    field: keyof ElectionCandidateItem,
    val: string
  ) => {
    const updated = [...candidates];
    updated[index] = { ...updated[index], [field]: val };
    setCandidates(updated);
  };

  const handleAddCandidate = () => {
    const nextCode = `C_${candidates.length + 1}`;
    setCandidates([...candidates, { candidate_code: nextCode, name: "", statement: "" }]);
  };

  const handleRemoveCandidate = (index: number) => {
    if (candidates.length <= 2) {
      alert("At least 2 candidates required");
      return;
    }
    setCandidates(candidates.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError("Title is required");
      return;
    }

    for (const c of candidates) {
      if (!c.candidate_code.trim() || !c.name.trim()) {
        setError("All candidates must have a valid code and name");
        return;
      }
    }

    try {
      setLoading(true);
      const payload = {
        title: title.trim(),
        description: description.trim(),
        registration_starts_at: new Date(regStart).toISOString(),
        registration_ends_at: new Date(regEnd).toISOString(),
        starts_at: new Date(voteStart).toISOString(),
        ends_at: new Date(voteEnd).toISOString(),
        allow_live_results: allowLiveResults,
        candidates: candidates.map((c) => ({
          candidate_code: c.candidate_code.trim(),
          name: c.name.trim(),
          statement: c.statement?.trim() || null,
        })),
      };
      const created = await createAdminElection(payload);
      navigate(`/admin/elections/${created.id}`);
    } catch (err: any) {
      setError(err.message || t("error.validation"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="view-root">
      <div className="view-scroll-frame">
        <div className="admin-election-create-page">
          <div className="admin-breadcrumb">
            <Link to="/admin/elections" className="back-link">
              &larr; {t("election.admin.title")}
            </Link>
          </div>

          <div className="create-form-card">
            <header className="create-header">
              <h1 className="create-title">{t("election.admin.createNew")}</h1>
              <p className="create-subtitle">{t("election.subtitle")}</p>
            </header>

            {error ? <div className="create-error-banner">{error}</div> : null}

            <form className="create-form" onSubmit={handleSubmit}>
              {/* Basic Info */}
              <div className="form-group">
                <label className="form-label" htmlFor="electionTitle">
                  {t("common.searchTitle")} *
                </label>
                <input
                  id="electionTitle"
                  type="text"
                  className="form-input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. 2026 Academic Council Co-Chair Election"
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="electionDesc">
                  {t("form.description")}
                </label>
                <textarea
                  id="electionDesc"
                  className="form-textarea"
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe the election context, governance scope, or eligibility guidelines..."
                />
              </div>

              {/* Time Windows */}
              <div className="form-row-grid">
                <div className="form-group">
                  <label className="form-label">{t("election.admin.registrationWindow")} (Start) *</label>
                  <input
                    type="datetime-local"
                    className="form-input"
                    value={regStart}
                    onChange={(e) => setRegStart(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">{t("election.admin.registrationWindow")} (End) *</label>
                  <input
                    type="datetime-local"
                    className="form-input"
                    value={regEnd}
                    onChange={(e) => setRegEnd(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="form-row-grid">
                <div className="form-group">
                  <label className="form-label">{t("election.admin.votingWindow")} (Start) *</label>
                  <input
                    type="datetime-local"
                    className="form-input"
                    value={voteStart}
                    onChange={(e) => setVoteStart(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">{t("election.admin.votingWindow")} (End) *</label>
                  <input
                    type="datetime-local"
                    className="form-input"
                    value={voteEnd}
                    onChange={(e) => setVoteEnd(e.target.value)}
                    required
                  />
                </div>
              </div>

              {/* Live results toggle */}
              <div className="live-results-toggle-box">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={allowLiveResults}
                    onChange={(e) => setAllowLiveResults(e.target.checked)}
                  />
                  <span className="toggle-title">{t("election.admin.allowLiveResults")}</span>
                </label>
                <p className="toggle-hint">{t("election.admin.allowLiveResultsHint")}</p>
              </div>

              {/* Candidate Editor */}
              <section className="candidates-editor-section">
                <div className="section-header-row">
                  <h2 className="section-title">{t("election.admin.candidatesTitle")}</h2>
                  <button
                    type="button"
                    className="btn-add-candidate"
                    onClick={handleAddCandidate}
                  >
                    + {t("election.admin.addCandidate")}
                  </button>
                </div>

                <div className="candidates-inputs-list">
                  {candidates.map((cand, idx) => (
                    <div key={idx} className="candidate-input-row">
                      <div className="input-field col-code">
                        <label>{t("election.admin.candidateCode")}</label>
                        <input
                          type="text"
                          className="form-input"
                          value={cand.candidate_code}
                          onChange={(e) =>
                            handleCandidateChange(idx, "candidate_code", e.target.value)
                          }
                          required
                        />
                      </div>
                      <div className="input-field col-name">
                        <label>{t("election.admin.candidateName")}</label>
                        <input
                          type="text"
                          className="form-input"
                          value={cand.name}
                          onChange={(e) => handleCandidateChange(idx, "name", e.target.value)}
                          placeholder="Full Name"
                          required
                        />
                      </div>
                      <div className="input-field col-statement">
                        <label>{t("election.admin.candidateStatement")}</label>
                        <input
                          type="text"
                          className="form-input"
                          value={cand.statement || ""}
                          onChange={(e) =>
                            handleCandidateChange(idx, "statement", e.target.value)
                          }
                          placeholder="Brief bio or platform..."
                        />
                      </div>
                      <button
                        type="button"
                        className="btn-remove-cand"
                        title={t("election.admin.removeCandidate")}
                        onClick={() => handleRemoveCandidate(idx)}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </section>

              <div className="create-submit-row">
                <button type="submit" className="btn-submit-create" disabled={loading}>
                  {loading ? t("common.saving") : t("action.create")}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
