import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ApiCode } from "../../../lib/api-codes";
import { envelope, fail, guestOk, installFetch, meAnonymous, renderWithProviders, samplePoll } from "../../../test/fixtures";
import { usePollAccess } from "../usePollAccess";

function Probe() {
  const access = usePollAccess({ pollId: 7 });
  return (
    <div>
      <p data-testid="phase">{access.phase}</p>
      <button type="button" onClick={() => access.markUnknown()}>
        mark
      </button>
      <button type="button" onClick={() => access.reload()}>
        reload
      </button>
      {access.phase === "submission_unknown" ? <button type="button">Check again</button> : null}
    </div>
  );
}

describe("usePollAccess", () => {
  it("重新读取后，未查到记录时仍保留未知状态和再次查询", async () => {
    let guests = 0;
    let reads = 0;
    installFetch((url) => {
      if (url.includes("/auth/me")) {
        return meAnonymous();
      }
      if (url.includes("/guest/context")) {
        guests += 1;
        return guestOk();
      }
      if (url.includes("/polls/7")) {
        reads += 1;
        return envelope(samplePoll({ has_voted: false, receipt: null, can_vote: false }));
      }
      return fail(ApiCode.NOT_FOUND, "资源不存在", 404);
    });
    renderWithProviders(<Probe />);
    await waitFor(() => expect(screen.getByTestId("phase")).toHaveTextContent("ready"));
    await userEvent.click(screen.getByRole("button", { name: "mark" }));
    expect(screen.getByTestId("phase")).toHaveTextContent("submission_unknown");
    expect(screen.getByRole("button", { name: "Check again" })).toBeInTheDocument();
    const readsBefore = reads;
    const guestsBefore = guests;
    await userEvent.click(screen.getByRole("button", { name: "reload" }));
    await waitFor(() => expect(reads).toBeGreaterThan(readsBefore));
    expect(screen.getByTestId("phase")).toHaveTextContent("submission_unknown");
    expect(screen.getByRole("button", { name: "Check again" })).toBeInTheDocument();
    expect(guests).toBe(guestsBefore);
  });
});
