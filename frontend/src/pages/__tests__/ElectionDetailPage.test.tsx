import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import * as electionApi from "../../features/elections/api";
import { renderRoute } from "../../test/fixtures";

describe("ElectionDetailPage voter guidance", () => {
  it("explains why a visitor cannot vote and localizes the registration status", async () => {
    localStorage.setItem("voting_locale", "en");
    vi.spyOn(electionApi, "getPublicElection").mockResolvedValue({
      id: 3,
      title: "Faculty election",
      description: "Choose a representative",
      phase: "VOTING",
      lifecycle: "PUBLISHED",
      registration_starts_at: "2026-10-20T00:00:00Z",
      registration_ends_at: "2026-10-22T00:00:00Z",
      starts_at: "2026-10-23T00:00:00Z",
      ends_at: "2026-11-20T00:00:00Z",
      allow_live_results: false,
      candidates: [],
      my_registration_status: null,
      has_voted: false,
    });

    renderRoute("/elections/3");
    expect(await screen.findByText("Not registered")).toBeInTheDocument();
    expect(screen.getByText("Sign in to check your voter eligibility.")).toBeInTheDocument();
    expect(within(document.querySelector(".detail-voter-panel") as HTMLElement).getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href", "/login?next=%2Felections%2F3",
    );
  });
});
