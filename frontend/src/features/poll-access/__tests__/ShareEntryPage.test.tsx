import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { ApiCode } from "../../../lib/api-codes";
import type { PollDetail, ShareEntry } from "../../../lib/api-types";
import { envelope, fail, guestOk, installFetch, meAnonymous, renderWithProviders, samplePoll } from "../../../test/fixtures";
import { usePollAccess } from "../usePollAccess";

function share(overrides: Partial<ShareEntry>): ShareEntry {
  return {
    poll_id: 7,
    identity_mode: "ANONYMOUS",
    visibility: "PUBLIC",
    password_required: false,
    login_required: false,
    ...overrides,
  };
}

function detail(title: string, id: number, overrides: Partial<PollDetail> = {}): PollDetail {
  return samplePoll({ id, title, ...overrides });
}

function PhaseView({ code }: { code: string }) {
  const access = usePollAccess({ shareCode: code });
  return (
    <div>
      <p data-testid="phase">{access.phase}</p>
      <p data-testid="title">{access.detail?.title ?? ""}</p>
    </div>
  );
}

describe("分享入口状态", () => {
  it("四种组合分别要求登录、密码或直接显示题目", async () => {
    const entries: Record<string, ShareEntry> = {
      "named-public": share({ poll_id: 11, identity_mode: "NAMED", login_required: true }),
      "anon-public": share({ poll_id: 12, identity_mode: "ANONYMOUS" }),
      "named-private": share({
        poll_id: 13,
        identity_mode: "NAMED",
        visibility: "PRIVATE",
        password_required: true,
        login_required: true,
      }),
      "anon-private": share({ poll_id: 14, identity_mode: "ANONYMOUS", visibility: "PRIVATE", password_required: true }),
    };
    const polls: Record<number, Response> = {
      11: fail(ApiCode.UNAUTHENTICATED, "需要登录", 401),
      12: envelope(detail("公开匿名题", 12)),
      13: fail(ApiCode.POLL_NOT_FOUND, "投票不存在", 404),
      14: envelope(detail("已解锁私密题", 14, { visibility: "PRIVATE" })),
    };
    installFetch((url) => {
      if (url.includes("/auth/me")) {
        return meAnonymous();
      }
      if (url.includes("/guest/context")) {
        return guestOk();
      }
      const code = Object.keys(entries).find((item) => url.includes(`/shares/${item}`));
      if (code) {
        return envelope(entries[code]);
      }
      const pollId = Number(url.match(/\/polls\/(\d+)/)?.[1]);
      return polls[pollId] ?? fail(ApiCode.NOT_FOUND, "资源不存在", 404);
    });

    function Switcher() {
      const [code, setCode] = useState("named-public");
      return (
        <div>
          <button type="button" onClick={() => setCode("anon-public")}>
            看匿名公开
          </button>
          <button type="button" onClick={() => setCode("named-private")}>
            看记名私密
          </button>
          <button type="button" onClick={() => setCode("anon-private")}>
            看匿名私密
          </button>
          <PhaseView code={code} />
        </div>
      );
    }

    renderWithProviders(<Switcher />);
    await waitFor(() => expect(screen.getByTestId("phase")).toHaveTextContent("login_required"));
    expect(screen.getByTestId("title")).toHaveTextContent("");

    await userEvent.click(screen.getByRole("button", { name: "看匿名公开" }));
    await waitFor(() => expect(screen.getByTestId("title")).toHaveTextContent("公开匿名题"));

    await userEvent.click(screen.getByRole("button", { name: "看记名私密" }));
    await waitFor(() => expect(screen.getByTestId("phase")).toHaveTextContent("password_required"));
    expect(screen.queryByText("公开匿名题")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "看匿名私密" }));
    await waitFor(() => expect(screen.getByTestId("title")).toHaveTextContent("已解锁私密题"));
  });

  it("切场后迟到的旧响应不覆盖新标题", async () => {
    let releaseOld: ((response: Response) => void) | undefined;
    const oldPoll = new Promise<Response>((resolve) => {
      releaseOld = resolve;
    });
    const fetchMock = installFetch((url) => {
      if (url.includes("/auth/me")) {
        return meAnonymous();
      }
      if (url.includes("/guest/context")) {
        return guestOk();
      }
      if (url.includes("/shares/old")) {
        return envelope(share({ poll_id: 1 }));
      }
      if (url.includes("/shares/new")) {
        return envelope(share({ poll_id: 2 }));
      }
      if (url.includes("/polls/1")) {
        return oldPoll;
      }
      if (url.includes("/polls/2")) {
        return envelope(detail("新场次", 2));
      }
      return fail(ApiCode.NOT_FOUND, "资源不存在", 404);
    });

    function Switcher() {
      const [code, setCode] = useState("old");
      return (
        <div>
          <button type="button" onClick={() => setCode("new")}>
            切换
          </button>
          <PhaseView code={code} />
        </div>
      );
    }

    renderWithProviders(<Switcher />);
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/polls/1"))).toBe(true));
    await userEvent.click(screen.getByRole("button", { name: "切换" }));
    await waitFor(() => expect(screen.getByTestId("title")).toHaveTextContent("新场次"));
    releaseOld?.(envelope(detail("旧场次", 1)));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.getByTestId("title")).toHaveTextContent("新场次");
  });
});
