import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "../../../test/fixtures";
import { emptyPollForm, PollForm } from "../PollForm";

const fixedNow = new Date("2026-10-26T05:34:00Z");

describe("PollForm", () => {
  it("私密投票必须填密码，记名方式和公开性可以独立选择", async () => {
    const onSubmit = vi.fn();
    renderWithProviders(
      <PollForm initial={emptyPollForm(fixedNow)} mode="create" now={fixedNow} onSubmit={onSubmit} />,
    );
    await userEvent.type(screen.getByLabelText("Title"), "班会");
    const options = screen.getAllByLabelText(/^Option /);
    await userEvent.type(options[0]!, "赞成");
    await userEvent.type(options[1]!, "反对");
    await userEvent.click(screen.getByLabelText("Anonymous"));
    await userEvent.click(screen.getByLabelText("Private"));
    expect(screen.getByTestId("access-password")).toBeInTheDocument();
    await userEvent.click(screen.getByTestId("save-poll"));
    expect(await screen.findByRole("alert")).toHaveTextContent("A private poll needs a passcode");
    expect(onSubmit).not.toHaveBeenCalled();

    await userEvent.type(screen.getByTestId("access-password"), "access-pass1");
    await userEvent.click(screen.getByTestId("save-poll"));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
      identity_mode: "ANONYMOUS",
      visibility: "PRIVATE",
      access_password: "access-pass1",
    });
    expect(String(onSubmit.mock.calls[0]?.[0].starts_at)).toContain("+08:00");
  });

  it("改回公开后不再提交访问密码", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const initial = emptyPollForm(fixedNow);
    initial.title = "班会";
    initial.options = ["赞成", "反对"];
    initial.visibility = "PRIVATE";
    initial.accessPassword = "access-pass1";
    renderWithProviders(<PollForm initial={initial} mode="create" now={fixedNow} onSubmit={onSubmit} />);
    await userEvent.click(screen.getByLabelText("Public"));
    expect(screen.queryByTestId("access-password")).not.toBeInTheDocument();
    await userEvent.click(screen.getByTestId("save-poll"));
    expect(onSubmit.mock.calls[0]?.[0].access_password).toBeNull();
    expect(onSubmit.mock.calls[0]?.[0].visibility).toBe("PUBLIC");
  });

  it("创建时开始时间默认是当前香港分钟，更早不能保存", async () => {
    const onSubmit = vi.fn();
    const initial = emptyPollForm(fixedNow);
    expect(initial).toMatchObject({
      startsDate: "2026-10-26",
      startsTime: "13:34",
      endsDate: "2026-10-26",
      endsTime: "15:34",
    });

    renderWithProviders(<PollForm initial={initial} mode="create" now={fixedNow} onSubmit={onSubmit} />);
    expect(screen.getByLabelText("Start date")).toHaveAttribute("min", "2026-10-26");
    expect(screen.getByLabelText("Start time")).toHaveAttribute("min", "13:34");
    expect(screen.getByLabelText("Start time")).toHaveValue("13:34");

    await userEvent.type(screen.getByLabelText("Title"), "班会");
    const options = screen.getAllByLabelText(/^Option /);
    await userEvent.type(options[0]!, "赞成");
    await userEvent.type(options[1]!, "反对");
    fireEvent.change(screen.getByLabelText("Start time"), { target: { value: "12:34" } });
    await userEvent.click(screen.getByTestId("save-poll"));
    expect(await screen.findByRole("alert")).toHaveTextContent("The start time cannot be earlier than the current time");
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Start time"), { target: { value: "13:34" } });
    await userEvent.click(screen.getByTestId("save-poll"));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0]?.[0].starts_at).toBe("2026-10-26T13:34:00+08:00");
  });

  it("改完分钟后关闭时间选择，只改小时时保持打开", async () => {
    renderWithProviders(<PollForm initial={emptyPollForm(fixedNow)} mode="create" now={fixedNow} onSubmit={vi.fn()} />);
    const input = screen.getByLabelText("End time");
    input.focus();
    fireEvent.change(input, { target: { value: "16:34" } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(input).toHaveFocus();
    expect(input).toHaveValue("16:34");

    fireEvent.change(input, { target: { value: "16:35" } });
    await waitFor(() => expect(input).not.toHaveFocus());
    expect(input).toHaveValue("16:35");
  });

  it("编辑草稿仍可以保留已经过去的开始时间", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const initial = emptyPollForm(new Date("2026-10-24T08:00:00Z"));
    initial.title = "班会";
    initial.options = ["赞成", "反对"];
    renderWithProviders(<PollForm initial={initial} mode="edit" now={fixedNow} onSubmit={onSubmit} />);
    expect(screen.getByLabelText("Start time")).not.toHaveAttribute("min");
    await userEvent.click(screen.getByTestId("save-poll"));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0]?.[0].starts_at).toBe("2026-10-24T16:00:00+08:00");
  });
});
