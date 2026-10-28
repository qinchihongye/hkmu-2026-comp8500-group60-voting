import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { ApiCode } from "../../../lib/api-codes";
import { ApiClientError } from "../../../lib/api-error";
import type { PollDetail } from "../../../lib/api-types";
import { renderWithProviders, samplePoll } from "../../../test/fixtures";
import { BallotForm } from "../BallotForm";

const receipt = { receipt_id: "11111111-1111-1111-1111-111111111111", poll_id: 7, submitted_at: "2026-10-24T02:00:00Z" };

describe("BallotForm", () => {
  it("访客凭据未就绪时不能提交，匿名投票不要求登录", async () => {
    const onCast = vi.fn();
    renderWithProviders(
      <BallotForm poll={samplePoll()} guestReady={false} onCast={onCast} onRecover={vi.fn()} />,
    );
    expect(screen.getByText(/not strictly one person, one vote/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Sign in to vote" })).not.toBeInTheDocument();
    expect(screen.getByTestId("vote-submit")).toBeDisabled();
    await userEvent.click(screen.getByTestId("vote-submit"));
    expect(onCast).not.toHaveBeenCalled();
  });

  it("网络未知时用原上下文查询，不自动再次提交", async () => {
    const onCast = vi.fn().mockRejectedValue(new ApiClientError({ kind: "network", message: "网络连接中断，提交结果还不能确定" }));
    const onRecover = vi.fn().mockResolvedValue(samplePoll({ has_voted: false, receipt: null }));
    renderWithProviders(<BallotForm poll={samplePoll()} guestReady onCast={onCast} onRecover={onRecover} />);
    await userEvent.click(screen.getByRole("radio", { name: "面" }));
    await userEvent.click(screen.getByTestId("vote-submit"));
    await userEvent.click(await screen.findByTestId("vote-confirm"));
    expect(await screen.findByTestId("unknown-status")).toHaveTextContent("No record found yet.");
    expect(onCast).toHaveBeenCalledTimes(1);
    expect(onRecover).toHaveBeenCalledTimes(1);
  });

  it("查到原回执时展示回执，重复提交码也不自动再投", async () => {
    const onCast = vi.fn().mockRejectedValue(
      new ApiClientError({ kind: "api", code: ApiCode.SUBMISSION_STATUS_UNKNOWN, httpStatus: 503, message: "提交结果待确认" }),
    );
    const onRecover = vi.fn().mockResolvedValue(samplePoll({ has_voted: true, receipt }));
    renderWithProviders(<BallotForm poll={samplePoll()} guestReady onCast={onCast} onRecover={onRecover} />);
    await userEvent.click(screen.getByRole("radio", { name: "饭" }));
    await userEvent.click(screen.getByTestId("vote-submit"));
    await userEvent.click(await screen.findByTestId("vote-confirm"));
    expect(await screen.findByTestId("receipt")).toHaveTextContent(receipt.receipt_id);
    expect(onCast).toHaveBeenCalledTimes(1);
    expect(onCast).toHaveBeenCalledWith([2]);
  });

  it("单选互斥，换一场后清空，多选可取消并按选项顺序只提交一次", async () => {
    const multiple = samplePoll({
      id: 8,
      selection_mode: "MULTIPLE",
      options: [
        { id: 1, label: "甲", position: 0 },
        { id: 2, label: "乙", position: 1 },
        { id: 3, label: "丙", position: 2 },
      ],
    });
    const onCast = vi.fn().mockResolvedValue(receipt);
    function Harness() {
      const [poll, setPoll] = useState<PollDetail>(samplePoll());
      return (
        <>
          <button type="button" onClick={() => setPoll(multiple)}>
            switch poll
          </button>
          <BallotForm poll={poll} guestReady onCast={onCast} onRecover={vi.fn()} />
        </>
      );
    }
    renderWithProviders(<Harness />);
    expect(screen.getByRole("radio", { name: "面" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "面" }));
    await userEvent.click(screen.getByRole("radio", { name: "饭" }));
    expect(screen.getByRole("radio", { name: "面" })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: "饭" })).toBeChecked();

    await userEvent.click(screen.getByRole("button", { name: "switch poll" }));
    expect(screen.getByRole("checkbox", { name: "甲" })).not.toBeChecked();
    expect(screen.getByTestId("vote-submit")).toBeDisabled();
    await userEvent.click(screen.getByRole("checkbox", { name: "丙" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "甲" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "乙" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "乙" }));
    await userEvent.click(screen.getByTestId("vote-submit"));
    const items = await screen.findAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual(["甲", "丙"]);
    await userEvent.click(screen.getByTestId("vote-confirm"));
    expect(onCast).toHaveBeenCalledTimes(1);
    expect(onCast).toHaveBeenCalledWith([1, 3]);
  });

  it("忙碌或不能投票时不能提交", async () => {
    let resolveCast: (value: typeof receipt) => void = () => undefined;
    const onCast = vi.fn(
      () =>
        new Promise<typeof receipt>((resolve) => {
          resolveCast = resolve;
        }),
    );
    renderWithProviders(<BallotForm poll={samplePoll()} guestReady onCast={onCast} onRecover={vi.fn()} />);
    await userEvent.click(screen.getByRole("radio", { name: "面" }));
    await userEvent.click(screen.getByTestId("vote-submit"));
    await userEvent.click(await screen.findByTestId("vote-confirm"));
    expect(screen.getByTestId("vote-confirm")).toBeDisabled();
    expect(screen.getByRole("radio", { name: "饭" })).toBeDisabled();
    resolveCast(receipt);
    expect(await screen.findByTestId("receipt")).toBeInTheDocument();
    expect(onCast).toHaveBeenCalledTimes(1);
    expect(onCast).toHaveBeenCalledWith([1]);

    cleanup();
    renderWithProviders(
      <BallotForm poll={samplePoll({ can_vote: false })} guestReady onCast={onCast} onRecover={vi.fn()} />,
    );
    const option = screen.getByRole("radio", { name: "面" });
    expect(option).toBeDisabled();
    expect(option).not.toBeChecked();
    expect(screen.getByTestId("vote-submit")).toBeDisabled();
    await userEvent.click(option.closest(".ballot-option-tile") as HTMLElement);
    expect(option).not.toBeChecked();
    expect(screen.getByTestId("vote-submit")).toBeDisabled();
    expect(onCast).toHaveBeenCalledTimes(1);
  });

  it("多选点击文字、卡片、复选框和空格都只切换一次", async () => {
    const user = userEvent.setup();
    const onCast = vi.fn().mockResolvedValue(receipt);
    renderWithProviders(
      <BallotForm
        poll={samplePoll({
          id: 9,
          selection_mode: "MULTIPLE",
          options: [
            { id: 1, label: "甲", position: 0 },
            { id: 2, label: "乙", position: 1 },
            { id: 3, label: "丙", position: 2 },
          ],
        })}
        guestReady
        onCast={onCast}
        onRecover={vi.fn()}
      />,
    );
    const first = screen.getByRole("checkbox", { name: "甲" });
    const second = screen.getByRole("checkbox", { name: "乙" });
    const third = screen.getByRole("checkbox", { name: "丙" });

    await user.click(screen.getByText("甲"));
    expect(first).toBeChecked();
    await user.click(screen.getByText("甲"));
    expect(first).not.toBeChecked();

    const letter = screen.getByText("甲").closest(".ballot-option-tile")?.querySelector(".ballot-option-letter");
    await user.click(letter as HTMLElement);
    expect(first).toBeChecked();

    await user.click(second);
    expect(second).toBeChecked();
    await user.click(second);
    expect(second).not.toBeChecked();

    third.focus();
    await user.keyboard(" ");
    expect(third).toBeChecked();
    await user.keyboard(" ");
    expect(third).not.toBeChecked();

    await user.click(screen.getByText("丙"));
    await user.click(screen.getByTestId("vote-submit"));
    await user.click(await screen.findByTestId("vote-confirm"));
    expect(onCast).toHaveBeenCalledTimes(1);
    expect(onCast).toHaveBeenCalledWith([1, 3]);
  });
});
