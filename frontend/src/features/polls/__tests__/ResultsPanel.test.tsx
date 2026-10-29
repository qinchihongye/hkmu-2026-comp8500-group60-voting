import { render, screen, type RenderResult } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";

import { Providers } from "../../../app/providers";
import type { PollResults } from "../../../lib/api-types";
import { ResultsPanel } from "../ResultsPanel";

function renderPanel(ui: ReactElement): RenderResult {
  return render(
    <Providers>
      <MemoryRouter>{ui}</MemoryRouter>
    </Providers>,
  );
}

function results(overrides: Partial<PollResults> = {}): PollResults {
  return {
    poll_id: 1,
    total_votes: 1,
    total_selections: 1,
    selection_mode: "SINGLE",
    vote_limit: null,
    is_final: false,
    server_time: "2026-10-26T06:00:00Z",
    winner_option_ids: [1],
    options: [
      { option_id: 1, label: "111", count: 1, percentage: 100 },
      { option_id: 2, label: "222", count: 0, percentage: 0 },
    ],
    ...overrides,
  };
}

describe("ResultsPanel", () => {
  it("左边表格显示选项、票数与百分比三列，悬浮饼图显示提示", async () => {
    const user = userEvent.setup();
    const { container } = renderPanel(<ResultsPanel results={results()} />);

    expect(screen.getByRole("columnheader", { name: "Option" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Votes" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Percentage" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: /111/ })).toHaveTextContent("(leading)");
    expect(screen.getByRole("cell", { name: "1" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "100.00%" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "0.00%" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "111 100.00%, 222 0.00%" })).toBeInTheDocument();

    const circle = container.querySelector(".results-pie circle");
    expect(circle).not.toBeNull();
    if (circle) {
      await user.click(circle);
      expect(screen.getByTestId("pie-tooltip")).toBeInTheDocument();
      expect(screen.getByTestId("pie-tooltip")).toHaveTextContent("111");
      expect(screen.getByTestId("pie-tooltip")).toHaveTextContent("100.00%");
    }
  });

  it("多选项按百分比切分，没有有效票时不画扇区", () => {
    const { container, rerender } = renderPanel(
      <ResultsPanel
        results={results({
          total_votes: 2,
          total_selections: 2,
          winner_option_ids: [1, 2],
          options: [
            { option_id: 1, label: "甲", count: 1, percentage: 50 },
            { option_id: 2, label: "乙", count: 1, percentage: 50 },
          ],
        })}
      />,
    );
    expect(container.querySelectorAll(".results-pie path")).toHaveLength(2);

    rerender(
      <Providers>
        <MemoryRouter>
          <ResultsPanel
            results={results({
              total_votes: 0,
              total_selections: 0,
              winner_option_ids: [],
              options: [
                { option_id: 1, label: "甲", count: 0, percentage: 0 },
                { option_id: 2, label: "乙", count: 0, percentage: 0 },
              ],
            })}
          />
        </MemoryRouter>
      </Providers>,
    );
    expect(screen.getByRole("img", { name: "No valid votes" })).toBeInTheDocument();
    expect(container.querySelectorAll(".results-pie path")).toHaveLength(0);
  });

  it("百分比说明收在感叹号里，触屏点击后显示", async () => {
    const user = userEvent.setup();
    renderPanel(<ResultsPanel results={results()} />);
    const button = screen.getByRole("button", { name: "About percentages" });
    const note = document.getElementById(button.getAttribute("aria-controls") ?? "");
    expect(note).toHaveTextContent("Percentages are rounded to two decimal places and may not add up to 100%.");
    expect(note).not.toHaveClass("open");
    expect(button).toHaveAttribute("aria-expanded", "false");

    await user.click(button);
    expect(note).toHaveClass("open");
    expect(button).toHaveAttribute("aria-expanded", "true");

    await user.click(button);
    expect(note).not.toHaveClass("open");
  });

  it("同时展示选票份数和选择次数，饼图分母与选择次数一致", () => {
    renderPanel(
      <ResultsPanel
        results={results({
          total_votes: 2,
          total_selections: 3,
          selection_mode: "MULTIPLE",
          vote_limit: 10,
          winner_option_ids: [1],
          options: [
            { option_id: 1, label: "甲", count: 2, percentage: 66.67 },
            { option_id: 2, label: "乙", count: 1, percentage: 33.33 },
            { option_id: 3, label: "丙", count: 0, percentage: 0 },
          ],
        })}
      />,
    );

    expect(screen.getByText("Ballots 2")).toBeInTheDocument();
    expect(screen.getByText("Selections 3")).toBeInTheDocument();
    expect(screen.getByText("Share of selections")).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: /丙/ })).toBeInTheDocument();
    expect(screen.getByText("0.00%")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "甲 66.67%, 乙 33.33%, 丙 0.00%" })).toBeInTheDocument();
    expect(screen.queryByText("100.00%")).not.toBeInTheDocument();
    expect(screen.queryByText("50.00%")).not.toBeInTheDocument();
    expect(screen.queryByText("NaN")).not.toBeInTheDocument();
  });
});
