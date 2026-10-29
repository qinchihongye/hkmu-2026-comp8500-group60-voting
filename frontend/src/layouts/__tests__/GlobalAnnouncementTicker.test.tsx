import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as pollsApi from "../../features/polls/api";
import { renderWithProviders, samplePoll } from "../../test/fixtures";
import { GlobalAnnouncementTicker } from "../GlobalAnnouncementTicker";

describe("GlobalAnnouncementTicker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("轮播展示最热公开投票与广告位招租，点击热度投票默认进入该投票详情", async () => {
    localStorage.setItem("voting_locale", "zh");
    const mockTopPoll = {
      ...samplePoll(),
      id: 88,
      title: "2026 年度最佳技术分享议题",
      visibility: "PUBLIC",
      effective_status: "OPEN",
    };

    const getPollsSpy = vi.spyOn(pollsApi, "getPolls").mockResolvedValue({
      items: [mockTopPoll],
      total: 1,
      page: 1,
      page_size: 1,
    });

    renderWithProviders(<GlobalAnnouncementTicker />);

    expect(getPollsSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        sort_by: "popularity",
      }),
    );

    // 等待接口异步数据返回并渲染第 1 阶段（热门投票）
    await act(async () => {
      await Promise.resolve();
    });

    const hotLink = screen.getByTestId("topbar-hot-poll");
    expect(hotLink).toBeInTheDocument();
    expect(hotLink).toHaveAttribute("href", "/polls/88");
    expect(screen.getByText("热门投票")).toBeInTheDocument();
    expect(screen.getByText("2026 年度最佳技术分享议题")).toBeInTheDocument();

    // 推进 2 秒 -> 切换到“广告位招租”
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.getByTestId("topbar-ad-placeholder")).toBeInTheDocument();
    expect(screen.getByText("广告位招租")).toBeInTheDocument();

    // 再推进 2 秒 -> 循环回热门投票
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.getByTestId("topbar-hot-poll")).toBeInTheDocument();
    expect(screen.getByText("2026 年度最佳技术分享议题")).toBeInTheDocument();
  });

  it("鼠标悬停时暂停轮播计时", async () => {
    localStorage.setItem("voting_locale", "en");
    vi.spyOn(pollsApi, "getPolls").mockResolvedValue({
      items: [
        {
          ...samplePoll(),
          id: 99,
          title: "Company Hackathon Theme",
          visibility: "PUBLIC",
          effective_status: "OPEN",
        },
      ],
      total: 1,
      page: 1,
      page_size: 1,
    });

    renderWithProviders(<GlobalAnnouncementTicker />);

    await act(async () => {
      await Promise.resolve();
    });

    const container = screen.getByRole("region", { name: "Global Announcements" });
    expect(screen.getByText("Company Hackathon Theme")).toBeInTheDocument();

    // 鼠标悬停进入
    fireEvent.mouseEnter(container);

    // 推进 2 秒，应保持暂停不切换
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.getByText("Company Hackathon Theme")).toBeInTheDocument();

    // 鼠标移出，恢复计时
    fireEvent.mouseLeave(container);
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.getByText("Ad space available")).toBeInTheDocument();
  });
});

