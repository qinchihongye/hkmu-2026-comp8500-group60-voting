import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { ManagePollSummary } from "../../../lib/api-types";
import { renderWithProviders, samplePoll } from "../../../test/fixtures";
import { MyPollCard } from "../MyPollCard";

function createManagePoll(overrides: Partial<ManagePollSummary> = {}): ManagePollSummary {
  return {
    ...samplePoll(),
    id: 10,
    title: "Quarterly Team Retro",
    description: "Feedback and action items for next sprint.",
    identity_mode: "NAMED",
    visibility: "PUBLIC",
    vote_limit: 50,
    selection_mode: "SINGLE",
    allow_live_results: true,
    effective_status: "OPEN",
    starts_at: "2026-10-28T00:00:00Z",
    ends_at: "2026-10-30T00:00:00Z",
    ballot_count: 25,
    lifecycle: "PUBLISHED",
    version: 1,
    creator_id: 1,
    ...overrides,
  };
}

describe("MyPollCard Component", () => {
  it("草稿状态卡片：展示 DRAFT 徽章、待发布提示与全宽编辑按钮", () => {
    localStorage.setItem("voting_locale", "en");
    const draftPoll = createManagePoll({
      title: "Draft Event Planning",
      lifecycle: "DRAFT",
      effective_status: "DRAFT",
    });

    renderWithProviders(<MyPollCard poll={draftPoll} />);

    expect(screen.getByRole("link", { name: "Draft Event Planning" })).toHaveAttribute(
      "href",
      "/my-polls/10/edit",
    );
    expect(screen.getByText("DRAFT")).toBeInTheDocument();
    expect(screen.getByText("Draft not yet published")).toBeInTheDocument();

    const editBtn = screen.getByRole("link", { name: "Edit draft" });
    expect(editBtn).toHaveAttribute("href", "/my-polls/10/edit");
    expect(editBtn).toHaveClass("plaza-card-btn-full");
  });

  it("进行中投票：展示进行中状态、选票进度条与管理/查看结果双按钮", () => {
    localStorage.setItem("voting_locale", "en");
    renderWithProviders(<MyPollCard poll={createManagePoll()} />);

    expect(screen.getByRole("link", { name: "Quarterly Team Retro" })).toHaveAttribute(
      "href",
      "/my-polls/10",
    );
    expect(screen.getByText("OPEN")).toBeInTheDocument();
    expect(screen.getByText("25 / 50 · 50%")).toBeInTheDocument();

    const manageBtn = screen.getByRole("link", { name: "Manage" });
    expect(manageBtn).toHaveAttribute("href", "/my-polls/10");
    expect(manageBtn).toHaveClass("plaza-card-btn-primary");

    const resultsBtn = screen.getByRole("link", { name: "View results" });
    expect(resultsBtn).toHaveAttribute("href", "/polls/10/results");
    expect(resultsBtn).toHaveClass("plaza-card-btn-outline");
  });

  it("中文环境下正确定位文案与徽章", () => {
    localStorage.setItem("voting_locale", "zh");
    const draftPoll = createManagePoll({
      lifecycle: "DRAFT",
      effective_status: "DRAFT",
    });

    renderWithProviders(<MyPollCard poll={draftPoll} />);

    expect(screen.getAllByText("草稿").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("草稿待发布")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "编辑草稿" })).toBeInTheDocument();
  });
});
