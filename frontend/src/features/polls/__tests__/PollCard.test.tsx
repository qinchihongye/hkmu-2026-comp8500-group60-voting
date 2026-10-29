import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { PollSummary } from "../../../lib/api-types";
import { renderWithProviders, samplePoll } from "../../../test/fixtures";
import { PollCard } from "../PollCard";

function createPoll(overrides: Partial<PollSummary> = {}): PollSummary {
  return {
    ...samplePoll(),
    id: 1,
    title: "Community Park Expansion",
    description: "Choose the improvement for our park.",
    identity_mode: "NAMED",
    visibility: "PUBLIC",
    vote_limit: 20,
    selection_mode: "SINGLE",
    allow_live_results: true,
    effective_status: "OPEN",
    starts_at: "2026-10-28T00:00:00Z",
    ends_at: "2026-10-30T00:00:00Z",
    ballot_count: 12,
    ...overrides,
  };
}

describe("PollCard Display Rules", () => {
  it("卡片1 (进行中，有上限，允许实时结果)：展示选票进度蓝色条与双按钮", () => {
    localStorage.setItem("voting_locale", "en");
    renderWithProviders(<PollCard poll={createPoll()} />);

    expect(screen.getByRole("link", { name: "Community Park Expansion" })).toBeInTheDocument();
    expect(screen.getByText("OPEN")).toBeInTheDocument();
    expect(screen.getByText("Named")).toBeInTheDocument();
    expect(screen.getByText("Public")).toBeInTheDocument();
    expect(screen.getByText("Single choice")).toBeInTheDocument();

    // 进度为蓝色选票进度 12 / 20 · 60%
    expect(screen.getByText("Ballots received")).toBeInTheDocument();
    expect(screen.getByText("12 / 20 · 60%")).toBeInTheDocument();
    const progressFill = screen.getByRole("progressbar");
    expect(progressFill).toHaveClass("plaza-progress-fill-blue");
    expect(progressFill).toHaveStyle({ width: "60%" });

    // 按钮：View poll 为主按钮，View results 为次级按钮
    expect(screen.getByRole("link", { name: "View poll" })).toHaveClass("plaza-card-btn-primary");
    expect(screen.getByRole("link", { name: "View results" })).toHaveClass("plaza-card-btn-outline");
  });

  it("卡片2 (进行中，无上限，关闭实时结果)：展示时间进度紫色条与结束后公布按钮", () => {
    localStorage.setItem("voting_locale", "en");
    const poll = createPoll({
      title: "Campus Activity Preferences",
      description: "Select the activities you would join.",
      identity_mode: "ANONYMOUS",
      visibility: "PUBLIC",
      vote_limit: null,
      selection_mode: "MULTIPLE",
      allow_live_results: false,
    });
    renderWithProviders(<PollCard poll={poll} />);

    expect(screen.getByText("Anonymous")).toBeInTheDocument();
    expect(screen.getByText("Public")).toBeInTheDocument();
    expect(screen.getByText("Multiple choice")).toBeInTheDocument();

    // 紫色时间进度
    expect(screen.getByText("Time elapsed")).toBeInTheDocument();
    const progressFill = screen.getByRole("progressbar");
    expect(progressFill).toHaveClass("plaza-progress-fill-purple");

    // 按钮：View poll 轮廓按钮 + 结束后公布不可点击按钮
    expect(screen.getByRole("link", { name: "View poll" })).toHaveClass("plaza-card-btn-outline");
    const mutedBtn = screen.getByRole("button", { name: "Results after closing" });
    expect(mutedBtn).toBeDisabled();
    expect(mutedBtn).toHaveClass("plaza-card-btn-muted");
  });

  it("卡片3 (进行中，私密投票，有上限)：展示私密锁图标与私密访问按钮", () => {
    localStorage.setItem("voting_locale", "en");
    const poll = createPoll({
      title: "Team Workshop Topics",
      description: "Choose our next workshop topics.",
      identity_mode: "NAMED",
      visibility: "PRIVATE",
      vote_limit: 20,
      ballot_count: 8,
      selection_mode: "MULTIPLE",
      allow_live_results: false,
    });
    renderWithProviders(<PollCard poll={poll} />);

    expect(screen.getByText("Private")).toBeInTheDocument();
    expect(screen.getByText("8 / 20 · 40%")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View poll" })).toHaveAttribute("href", "/polls/1");

    const mutedBtn = screen.getByRole("button", { name: "Private access" });
    expect(mutedBtn).toBeDisabled();
    expect(mutedBtn).toHaveClass("plaza-card-btn-muted");
  });

  it("卡片4 (未开始/SCHEDULED)：展示 SCHEDULED 状态、开始时间与空进度条", () => {
    localStorage.setItem("voting_locale", "en");
    const poll = createPoll({
      title: "Quarterly Goal Review",
      description: "Set priorities for the next quarter.",
      effective_status: "SCHEDULED",
      starts_at: "2026-11-01T01:00:00Z",
      ends_at: "2026-11-05T01:00:00Z",
      vote_limit: null,
    });
    renderWithProviders(<PollCard poll={poll} />);

    expect(screen.getByText("SCHEDULED")).toBeInTheDocument();
    expect(screen.getByText("Not started")).toBeInTheDocument();
    const progressFill = screen.getByRole("progressbar");
    expect(progressFill).toHaveStyle({ width: "0%" });

    const viewDetails = screen.getByRole("link", { name: "View details" });
    expect(viewDetails).toBeInTheDocument();
    expect(viewDetails).toHaveClass("plaza-card-btn-full");
  });

  it("卡片5 (达上限结束)：展示 Ballot cap reached 与 100% 选票进度", () => {
    localStorage.setItem("voting_locale", "en");
    const poll = createPoll({
      title: "Design Workshop Booking",
      effective_status: "CLOSED",
      vote_limit: 20,
      ballot_count: 20,
      close_reason: "BALLOT_CAP_REACHED",
    });
    renderWithProviders(<PollCard poll={poll} />);

    expect(screen.getByText("CLOSED")).toBeInTheDocument();
    expect(screen.getByText("Ballot cap reached")).toBeInTheDocument();
    expect(screen.getByText("20 / 20 · 100%")).toBeInTheDocument();

    const progressFill = screen.getByRole("progressbar");
    expect(progressFill).toHaveClass("plaza-progress-fill-blue");
    expect(progressFill).toHaveStyle({ width: "100%" });

    const viewResults = screen.getByRole("link", { name: "View results" });
    expect(viewResults).toBeInTheDocument();
    expect(viewResults).toHaveClass("plaza-card-btn-full");
  });

  it("卡片6 (提前关闭)：展示 Closed early 与冻结在关闭时刻的时间进度", () => {
    localStorage.setItem("voting_locale", "en");
    const poll = createPoll({
      title: "Team Retrospective",
      effective_status: "CLOSED",
      vote_limit: null,
      starts_at: "2026-10-20T00:00:00Z",
      ends_at: "2026-10-30T00:00:00Z",
      closed_at: "2026-10-23T12:00:00Z", // 经过 3.5 天 / 10 天 = 35%
      close_reason: "CLOSED_EARLY",
    });
    renderWithProviders(<PollCard poll={poll} />);

    expect(screen.getByText("CLOSED")).toBeInTheDocument();
    expect(screen.getByText("Closed early")).toBeInTheDocument();
    expect(screen.getByText("Time elapsed at closing")).toBeInTheDocument();
    expect(screen.getByText("35%")).toBeInTheDocument();

    const progressFill = screen.getByRole("progressbar");
    expect(progressFill).toHaveClass("plaza-progress-fill-purple");
    expect(progressFill).toHaveStyle({ width: "35%" });

    expect(screen.getByRole("link", { name: "View results" })).toHaveClass("plaza-card-btn-full");
  });

  it("中文模式下正确展示本地化文案", () => {
    localStorage.setItem("voting_locale", "zh");
    const poll = createPoll({
      effective_status: "OPEN",
      vote_limit: 20,
      ballot_count: 12,
    });
    renderWithProviders(<PollCard poll={poll} />);

    expect(screen.getByText("进行中")).toBeInTheDocument();
    expect(screen.getByText("记名")).toBeInTheDocument();
    expect(screen.getByText("公开")).toBeInTheDocument();
    expect(screen.getByText("单选")).toBeInTheDocument();
    expect(screen.getByText("已收选票")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "查看投票" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "查看结果" })).toBeInTheDocument();
  });
});

