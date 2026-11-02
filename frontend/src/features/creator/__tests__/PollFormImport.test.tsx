import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "../../../test/fixtures";
import * as api from "../api";
import { emptyPollForm, PollForm } from "../PollForm";

vi.mock("../api", () => ({
  getPollTextImportCapabilities: vi.fn(),
  parsePollText: vi.fn(),
}));

const fixedNow = new Date("2026-10-26T05:34:00Z");

describe("PollForm text import settings", () => {
  it("applies explicit privacy, cap and live results without changing named identity", async () => {
    vi.mocked(api.getPollTextImportCapabilities).mockResolvedValue({
      enabled: true,
      max_text_length: 10000,
      timezone: "Asia/Hong_Kong",
    });
    vi.mocked(api.parsePollText).mockResolvedValue({
      fields: {
        title: "Friday sharing",
        options: [{ label: "React" }, { label: "Vue" }, { label: "Angular" }],
        selection_mode: "MULTIPLE",
        visibility: "PRIVATE",
        vote_limit: 50,
        allow_live_results: true,
      },
      issues: [],
      reference_time: "2026-10-26T13:34:00+08:00",
      timezone: "Asia/Hong_Kong",
    });
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(<PollForm initial={emptyPollForm(fixedNow)} mode="create" now={fixedNow} onSubmit={onSubmit} />);

    await userEvent.click(await screen.findByText(/Smart-Fast Fill|智能识别导入/i));
    await userEvent.type(document.querySelector(".poll-import-textarea") as HTMLTextAreaElement, "Private Friday sharing");
    await userEvent.click(screen.getByTestId("poll-import-btn-submit"));
    await waitFor(() => expect(screen.getByLabelText("Ballot limit")).toHaveValue("50"));
    expect(screen.getByRole("switch", { name: "Private poll" })).toBeChecked();
    expect(screen.getByRole("switch", { name: "Anonymous voting" })).not.toBeChecked();
    expect(screen.getByRole("switch", { name: "Live results" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Multiple choice" })).toBeChecked();

    await userEvent.click(screen.getByTestId("save-poll"));
    expect(onSubmit).not.toHaveBeenCalled();
    await userEvent.type(screen.getByTestId("access-password"), "secret");
    await userEvent.click(screen.getByTestId("save-poll"));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      identity_mode: "NAMED",
      visibility: "PRIVATE",
      vote_limit: 50,
      selection_mode: "MULTIPLE",
      allow_live_results: true,
      access_password: "secret",
    }));
  });
});
