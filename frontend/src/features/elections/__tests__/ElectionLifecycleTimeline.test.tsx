import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { LocaleProvider } from "../../../i18n/LocaleProvider";
import { ElectionLifecycleTimeline, getLifecycleActiveIndex } from "../ElectionLifecycleTimeline";

describe("ElectionLifecycleTimeline Component", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("getLifecycleActiveIndex correctly maps phases to stage indices 0-4", () => {
    // Canonical 5 phases
    expect(getLifecycleActiveIndex("UPCOMING")).toBe(0);
    expect(getLifecycleActiveIndex("REGISTRATION")).toBe(1);
    expect(getLifecycleActiveIndex("REVIEW")).toBe(2);
    expect(getLifecycleActiveIndex("VOTING")).toBe(3);
    expect(getLifecycleActiveIndex("RESULTS")).toBe(4);

    // Legacy aliases
    expect(getLifecycleActiveIndex("DRAFT")).toBe(0);
    expect(getLifecycleActiveIndex("REGISTRATION_SCHEDULED")).toBe(0);
    expect(getLifecycleActiveIndex("REGISTRATION_OPEN")).toBe(1);
    expect(getLifecycleActiveIndex("REVIEWING")).toBe(2);
    expect(getLifecycleActiveIndex("VOTING_SCHEDULED")).toBe(2);
    expect(getLifecycleActiveIndex("VOTING_OPEN")).toBe(3);
    expect(getLifecycleActiveIndex("CLOSED")).toBe(4);
  });

    it("renders 5 lifecycle stages in VOTING with correct active/completed/pending states", () => {
      localStorage.setItem("voting_locale", "zh");
      render(
        <LocaleProvider initialLocale="zh">
          <ElectionLifecycleTimeline phase="VOTING" />
        </LocaleProvider>
      );

      // 5 standard Chinese phase names
      expect(screen.getByText("即将开放")).toBeInTheDocument();
      expect(screen.getByText("资格登记")).toBeInTheDocument();
      expect(screen.getByText("名册审核")).toBeInTheDocument();
      expect(screen.getByText("正式投票")).toBeInTheDocument();
      expect(screen.getByText("结果公示")).toBeInTheDocument();

      const progressbar = screen.getByRole("progressbar");
      expect(progressbar).toHaveAttribute("aria-valuenow", "4");

      const steps = progressbar.querySelectorAll(".timeline-step");
      expect(steps).toHaveLength(5);

      // Step 0, 1, 2 should be completed
      expect(steps[0]).toHaveClass("step-completed");
      expect(steps[1]).toHaveClass("step-completed");
      expect(steps[2]).toHaveClass("step-completed");

      // Step 3 (正式投票) should be active
      expect(steps[3]).toHaveClass("step-active");

      // Step 4 (结果公示) should be pending
      expect(steps[4]).toHaveClass("step-pending");
    });

      it("renders REGISTRATION with step 2 as active", () => {
        localStorage.setItem("voting_locale", "zh");
        render(
          <LocaleProvider initialLocale="zh">
            <ElectionLifecycleTimeline phase="REGISTRATION" />
          </LocaleProvider>
        );

        const progressbar = screen.getByRole("progressbar");
        expect(progressbar).toHaveAttribute("aria-valuenow", "2");

        const steps = progressbar.querySelectorAll(".timeline-step");
        expect(steps[0]).toHaveClass("step-completed");
        expect(steps[1]).toHaveClass("step-active");
        expect(steps[2]).toHaveClass("step-pending");
        expect(steps[3]).toHaveClass("step-pending");
        expect(steps[4]).toHaveClass("step-pending");
      });

      it("renders in English locale properly", () => {
        localStorage.setItem("voting_locale", "en");
        render(
          <LocaleProvider initialLocale="en">
            <ElectionLifecycleTimeline phase="RESULTS" />
          </LocaleProvider>
        );

        expect(screen.getByText("Upcoming")).toBeInTheDocument();
        expect(screen.getByText("Registration")).toBeInTheDocument();
        expect(screen.getByText("Roster Review")).toBeInTheDocument();
        expect(screen.getByText("Official Voting")).toBeInTheDocument();
        expect(screen.getByText("Results Notice")).toBeInTheDocument();

        const progressbar = screen.getByRole("progressbar");
        expect(progressbar).toHaveAttribute("aria-valuenow", "5");
      });
    });
