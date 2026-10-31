import { render, screen } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { ElectionCard } from "../ElectionCard";
import type { ElectionSummary } from "../types";
import { LocaleProvider } from "../../../i18n/LocaleProvider";

function renderCard(election: ElectionSummary) {
  return render(
    <BrowserRouter>
      <LocaleProvider>
        <ElectionCard election={election} />
      </LocaleProvider>
    </BrowserRouter>
  );
}

describe("ElectionCard", () => {
  const baseElection: ElectionSummary = {
    id: 1,
    title: "Faculty Senate Election",
    description: "Annual senate election for committee co-chairs.",
    phase: "REGISTRATION_OPEN",
    registration_starts_at: "2026-10-01T00:00:00Z",
    registration_ends_at: "2026-10-10T00:00:00Z",
    starts_at: "2026-10-15T00:00:00Z",
    ends_at: "2026-10-20T00:00:00Z",
    allow_live_results: true,
    candidate_count: 3,
    my_registration_status: null,
    has_voted: false,
  };

  it("renders registration open with register button for unregistered user", () => {
    renderCard(baseElection);
    expect(screen.getByText("Faculty Senate Election")).toBeInTheDocument();
    expect(screen.getByText("Official Election")).toBeInTheDocument();
    expect(screen.getByText("Register to vote")).toBeInTheDocument();
  });

  it("renders registered status if user is already registered", () => {
    renderCard({
      ...baseElection,
      my_registration_status: "APPROVED",
    });
    expect(screen.getByText("Registered")).toBeInTheDocument();
    expect(screen.getByText("Approved")).toBeInTheDocument();
  });

  it("renders secret ballot button when voting is open for approved voter", () => {
    renderCard({
      ...baseElection,
      phase: "VOTING_OPEN",
      my_registration_status: "APPROVED",
      has_voted: false,
    });
    expect(screen.getByText("Cast secret ballot")).toBeInTheDocument();
  });

  it("renders view results button when election is closed", () => {
    renderCard({
      ...baseElection,
      phase: "CLOSED",
    });
    expect(screen.getByText("View results")).toBeInTheDocument();
  });
});

