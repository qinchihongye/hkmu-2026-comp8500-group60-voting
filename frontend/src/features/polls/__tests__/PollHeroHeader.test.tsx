import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LocaleProvider } from "../../../i18n/LocaleProvider";
import { PollHeroHeader } from "../PollHeroHeader";

function renderWithI18n(ui: React.ReactElement, initialLocale?: "en" | "zh") {
  if (initialLocale) {
    localStorage.setItem("voting_locale", initialLocale);
  }
  return render(<LocaleProvider>{ui}</LocaleProvider>);
}

describe("PollHeroHeader", () => {
  it("renders title, tags, version, and schedule widget for closed poll", () => {
    renderWithI18n(
      <PollHeroHeader
        title="今晚去哪吃？"
        description="选择周五聚餐地点"
        status="CLOSED"
        identityMode="NAMED"
        visibility="PUBLIC"
        startsAt="2026-10-29T18:50:00+08:00"
        endsAt="2026-10-29T20:49:00+08:00"
        version={2}
        hasAccessPassword={true}
      />,
      "en",
    );

    expect(screen.getByRole("heading", { name: "今晚去哪吃？" })).toBeInTheDocument();
    expect(screen.getByText("选择周五聚餐地点")).toBeInTheDocument();
    expect(screen.getByText("v2")).toBeInTheDocument();
    expect(screen.getByText(/Passcode is set/i)).toBeInTheDocument();

    const widget = screen.getByTestId("poll-schedule-widget");
    expect(widget).toBeInTheDocument();
    expect(screen.getByText("Starts")).toBeInTheDocument();
    expect(screen.getByText("Ends")).toBeInTheDocument();
    expect(screen.getByText("18:50")).toBeInTheDocument();
    expect(screen.getByText("20:49")).toBeInTheDocument();
    expect(screen.getByText("1h 59m")).toBeInTheDocument();
    expect(screen.getByText("Ended")).toBeInTheDocument();
  });

  it("renders open status with active pulse indicator and remaining time", () => {
    const futureEnd = new Date(Date.now() + 3600000 * 5).toISOString();
    renderWithI18n(
      <PollHeroHeader
        title="Active Poll"
        status="OPEN"
        identityMode="ANONYMOUS"
        visibility="PRIVATE"
        startsAt="2026-10-29T10:00:00+08:00"
        endsAt={futureEnd}
      />,
      "en",
    );

    expect(screen.getByRole("heading", { name: "Active Poll" })).toBeInTheDocument();
    expect(screen.getByText("Anonymous")).toBeInTheDocument();
    expect(screen.getByText("Private")).toBeInTheDocument();
    expect(screen.queryByText(/v\d+/)).not.toBeInTheDocument();
  });
});
