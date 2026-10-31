import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ElectionPhaseBadge } from "../ElectionPhaseBadge";
import { LocaleProvider } from "../../../i18n/LocaleProvider";

function renderWithI18n(ui: React.ReactNode) {
  return render(<LocaleProvider>{ui}</LocaleProvider>);
}

describe("ElectionPhaseBadge", () => {
  it("renders Registration Open phase badge correctly", () => {
    renderWithI18n(<ElectionPhaseBadge phase="REGISTRATION_OPEN" />);
    expect(screen.getByText("Registration open")).toBeInTheDocument();
  });

  it("renders Voting Open phase badge correctly", () => {
    renderWithI18n(<ElectionPhaseBadge phase="VOTING_OPEN" />);
    expect(screen.getByText("Voting open")).toBeInTheDocument();
  });

  it("renders Closed phase badge correctly", () => {
    renderWithI18n(<ElectionPhaseBadge phase="CLOSED" />);
    expect(screen.getByText("Closed")).toBeInTheDocument();
  });

  it("renders Reviewing phase badge correctly", () => {
    renderWithI18n(<ElectionPhaseBadge phase="REVIEWING" />);
    expect(screen.getByText("Roster review")).toBeInTheDocument();
  });
});

