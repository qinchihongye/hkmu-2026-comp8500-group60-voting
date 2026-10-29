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
    await userEvent.click(screen.getByRole("switch", { name: "Anonymous voting" }));
    await userEvent.click(screen.getByRole("switch", { name: "Private poll" }));
    expect(screen.getByTestId("access-password")).toBeInTheDocument();
    expect(screen.getByTestId("access-password")).not.toHaveAttribute("placeholder");
    await userEvent.click(screen.getByTestId("save-poll"));
    expect(await screen.findByRole("alert")).toHaveTextContent("A private poll needs a passcode");
    expect(onSubmit).not.toHaveBeenCalled();

    await userEvent.type(screen.getByTestId("access-password"), "a");
    await userEvent.click(screen.getByTestId("save-poll"));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
      identity_mode: "ANONYMOUS",
      visibility: "PRIVATE",
      access_password: "a",
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
    await userEvent.click(screen.getByRole("switch", { name: "Private poll" }));
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

  it("默认不限票数且单选，开启上限后提交整数", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(
      <PollForm initial={emptyPollForm(fixedNow)} mode="create" now={fixedNow} onSubmit={onSubmit} />,
    );
    expect(screen.getByLabelText("Ballot limit")).toHaveValue("");
    expect(screen.getByPlaceholderText("Unlimited")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Single choice" })).toBeChecked();
    expect(screen.queryByText(/This browser is the credential/)).not.toBeInTheDocument();

    await fillRequired();
    await userEvent.click(screen.getByTestId("save-poll"));
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
      vote_limit: null,
      selection_mode: "SINGLE",
      allow_live_results: false,
    });

    await userEvent.click(screen.getByRole("button", { name: "Increase ballot limit" }));
    const limit = screen.getByLabelText("Ballot limit");
    expect(limit).toHaveValue("1");
    await userEvent.clear(limit);
    await userEvent.type(limit, "250");
    await userEvent.click(screen.getByTestId("save-poll"));
    expect(onSubmit.mock.calls[1]?.[0].vote_limit).toBe(250);
  });

  it("步进停在 1 和上限，键盘可以增减，非法数字不会进入请求", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(
      <PollForm initial={emptyPollForm(fixedNow)} mode="create" now={fixedNow} onSubmit={onSubmit} />,
    );
    const limit = screen.getByLabelText("Ballot limit");
    await userEvent.click(screen.getByRole("button", { name: "Increase ballot limit" }));
    expect(limit).toHaveValue("1");
    await userEvent.click(screen.getByRole("button", { name: "Decrease ballot limit" }));
    expect(limit).toHaveValue("");
    expect(screen.getByRole("button", { name: "Decrease ballot limit" })).toBeDisabled();

    fireEvent.change(limit, { target: { value: "1" } });
    fireEvent.change(limit, { target: { value: "100000" } });
    expect(screen.getByRole("button", { name: "Increase ballot limit" })).toBeDisabled();

    fireEvent.change(limit, { target: { value: "40" } });
    limit.focus();
    await userEvent.keyboard("{ArrowUp}");
    expect(limit).toHaveValue("41");

    fireEvent.change(limit, { target: { value: "1.5" } });
    await fillRequired();
    await userEvent.click(screen.getByTestId("save-poll"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Enter a whole number from 1 to 100,000.");
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.queryByDisplayValue("NaN")).not.toBeInTheDocument();
  });

  it("英文和中文都使用各自的设置标签", () => {
    const { unmount } = renderWithProviders(
      <PollForm initial={emptyPollForm(fixedNow)} mode="create" now={fixedNow} onSubmit={vi.fn()} />,
    );
    expect(screen.getByText("Vote Limit")).toBeInTheDocument();
    expect(screen.queryByText("最高投票数")).not.toBeInTheDocument();
    expect(screen.queryByText("是否可以一人多投")).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText("Unlimited")).toBeInTheDocument();
    expect(document.body.textContent).toContain("[👤 Named]");
    expect(document.body.textContent).toContain("[🔒 Private]");
    expect(screen.getByRole("switch", { name: "Anonymous voting" })).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Private poll" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Multiple choice" })).toBeDisabled();
    expect(screen.queryByText("Vote Allowance")).not.toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Live results" })).not.toBeChecked();
    expect(screen.getByText("Voters only see the totals, not who chose each option.")).toBeInTheDocument();
    expect(screen.queryByText("实时票况")).not.toBeInTheDocument();
    unmount();

    localStorage.setItem("voting_locale", "zh");
    renderWithProviders(
      <PollForm initial={emptyPollForm(fixedNow)} mode="create" now={fixedNow} onSubmit={vi.fn()} />,
    );
    expect(screen.getByText("最高投票数")).toBeInTheDocument();
    expect(screen.queryByText("Vote Limit")).not.toBeInTheDocument();
    expect(screen.queryByText("Vote Allowance")).not.toBeInTheDocument();
    expect(screen.queryByText("(Single choice)")).not.toBeInTheDocument();
    expect(screen.queryByText("(Multiple choice)")).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText("不限")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "不记名投票" })).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "私密投票" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "单选" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "多选" })).toBeDisabled();
    expect(screen.queryByText("Anonymous voting")).not.toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "实时票况" })).not.toBeChecked();
    expect(screen.queryByText("Live results")).not.toBeInTheDocument();
  });

  it("少于三个有效选项不能多选，降回两项时只提示一次并改回单选", async () => {
    const onSubmit = vi.fn();
    const initial = emptyPollForm(fixedNow);
    initial.title = "班会";
    initial.options = ["赞成", "反对", ""];
    initial.selectionMode = "MULTIPLE";
    renderWithProviders(<PollForm initial={initial} mode="create" now={fixedNow} onSubmit={onSubmit} />);
    expect(screen.getByRole("radio", { name: "Multiple choice" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "Single choice" })).toBeChecked();
    expect(screen.getByRole("status")).toHaveTextContent("Switched to single choice");

    await userEvent.type(screen.getByLabelText("Option 3"), "弃权");
    expect(screen.getByRole("radio", { name: "Multiple choice" })).toBeEnabled();
    await userEvent.click(screen.getByRole("radio", { name: "Multiple choice" }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText("Option 3"));
    expect(screen.getByRole("radio", { name: "Single choice" })).toBeChecked();
    expect(screen.getAllByText("Switched to single choice")).toHaveLength(1);
    expect(screen.getByRole("radio", { name: "Multiple choice" })).toBeDisabled();

    await userEvent.type(screen.getByLabelText("Option 3"), "弃权");
    await userEvent.click(screen.getByRole("radio", { name: "Multiple choice" }));
    await userEvent.click(screen.getByRole("button", { name: "Remove option 3" }));
    expect(screen.getByRole("radio", { name: "Single choice" })).toBeChecked();
    expect(screen.getAllByText("Switched to single choice")).toHaveLength(1);

    await userEvent.clear(screen.getByLabelText("Option 2"));
    await userEvent.type(screen.getByLabelText("Option 2"), "赞成");
    await userEvent.click(screen.getByTestId("save-poll"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Options must be different.");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("第一次保存未完成时再次提交不会创建第二次", async () => {
    let release: (() => void) | undefined;
    const onSubmit = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const initial = emptyPollForm(fixedNow);
    initial.title = "班会";
    initial.options = ["赞成", "反对"];
    renderWithProviders(<PollForm initial={initial} mode="create" now={fixedNow} onSubmit={onSubmit} />);
    const save = screen.getByTestId("save-poll");
    await userEvent.click(save);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(save).toBeDisabled();
    await userEvent.click(save);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    release?.();
    await waitFor(() => expect(save).toBeEnabled());
  });

  async function fillRequired() {
    await userEvent.type(screen.getByLabelText("Title"), "班会");
    const options = screen.getAllByLabelText(/^Option /);
    await userEvent.type(options[0]!, "赞成");
    await userEvent.type(options[1]!, "反对");
  }
});
