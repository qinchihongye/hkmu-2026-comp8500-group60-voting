import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ApiCode } from "../../../lib/api-codes";
import { ApiClientError } from "../../../lib/api-error";
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
    await userEvent.click(screen.getByLabelText("面"));
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
    await userEvent.click(screen.getByLabelText("饭"));
    await userEvent.click(screen.getByTestId("vote-submit"));
    await userEvent.click(await screen.findByTestId("vote-confirm"));
    expect(await screen.findByTestId("receipt")).toHaveTextContent(receipt.receipt_id);
    expect(onCast).toHaveBeenCalledTimes(1);
  });
});
