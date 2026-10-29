import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ApiCode } from "../../lib/api-codes";
import type { ManagePollDetail } from "../../lib/api-types";
import { envelope, fail, guestOk, installFetch, renderRoute, sessionOf } from "../../test/fixtures";

function detail(overrides: Partial<ManagePollDetail> = {}): ManagePollDetail {
  return {
    id: 9,
    title: "班会",
    identity_mode: "NAMED",
    visibility: "PUBLIC",
    vote_limit: 80,
    selection_mode: "MULTIPLE",
    allow_live_results: false,
    starts_at: "2026-10-26T05:34:00Z",
    ends_at: "2026-10-26T07:34:00Z",
    effective_status: "DRAFT",
    created_at: "2026-10-26T01:00:00Z",
    description: "说明",
    options: [
      { id: 1, label: "甲", position: 0 },
      { id: 2, label: "乙", position: 1 },
      { id: 3, label: "丙", position: 2 },
    ],
    lifecycle: "DRAFT",
    version: 3,
    creator_id: 2,
    closed_at: null,
    has_access_password: false,
    server_time: "2026-10-26T05:34:00Z",
    can_manage: true,
    can_view_results: true,
    ...overrides,
  };
}

function install(poll: ManagePollDetail) {
  return installFetch((url, init) => {
    if (url.includes("/auth/me")) {
      return sessionOf("USER");
    }
    if (url.includes("/guest/context")) {
      return guestOk();
    }
    if (url.includes(`/me/polls/${poll.id}`) && (init?.method === undefined || init.method === "GET")) {
      return envelope(poll);
    }
    if (init?.method === "PATCH" && url.includes(`/polls/${poll.id}`)) {
      return envelope({ ...poll, version: poll.version + 1 });
    }
    return fail(ApiCode.NOT_FOUND, "资源不存在", 404);
  });
}

describe("PollEditPage", () => {
  it("草稿回填上限和选择方式，保存时不丢掉", async () => {
    const fetchMock = install(detail());
    renderRoute("/my-polls/9/edit");
    expect(await screen.findByLabelText("Ballot limit")).toHaveValue("80");
    expect(screen.getByRole("radio", { name: "Multiple choice" })).toBeChecked();
    const limit = screen.getByLabelText("Ballot limit");
    await userEvent.clear(limit);
    await userEvent.type(limit, "90");
    await userEvent.click(screen.getByTestId("save-poll"));
    await waitFor(() => {
      const saved = fetchMock.mock.calls.find((call) => call[1]?.method === "PATCH");
      expect(saved).toBeTruthy();
    });
    const saved = fetchMock.mock.calls.find((call) => call[1]?.method === "PATCH");
    const body = JSON.parse(String(saved?.[1]?.body)) as { data: Record<string, unknown> };
    expect(body.data.vote_limit).toBe(90);
    expect(body.data.selection_mode).toBe("MULTIPLE");
    expect(body.data.expected_version).toBe(3);
    expect(body.data.options).toEqual([{ label: "甲" }, { label: "乙" }, { label: "丙" }]);
  });

  it("无上限草稿保存后仍然是 null", async () => {
    const fetchMock = install(detail({
      vote_limit: null,
      selection_mode: "SINGLE",
      options: [
        { id: 1, label: "甲", position: 0 },
        { id: 2, label: "乙", position: 1 },
      ],
    }));
    renderRoute("/my-polls/9/edit");
    expect(await screen.findByLabelText("Ballot limit")).toHaveValue("");
    expect(screen.getByRole("radio", { name: "Single choice" })).toBeChecked();
    await userEvent.click(screen.getByTestId("save-poll"));
    await waitFor(() => {
      const saved = fetchMock.mock.calls.find((call) => call[1]?.method === "PATCH");
      expect(saved).toBeTruthy();
    });
    const saved = fetchMock.mock.calls.find((call) => call[1]?.method === "PATCH");
    const body = JSON.parse(String(saved?.[1]?.body)) as { data: Record<string, unknown> };
    expect(body.data.vote_limit).toBeNull();
    expect(body.data.selection_mode).toBe("SINGLE");
  });

  it("已发布的投票只展示设置，不能编辑", async () => {
    install(detail({ lifecycle: "PUBLISHED", effective_status: "OPEN", vote_limit: 100 }));
    renderRoute("/my-polls/9/edit");
    expect(await screen.findByRole("heading", { name: "Published polls cannot be edited" })).toBeInTheDocument();
    expect(screen.getByText("100")).toBeInTheDocument();
    expect(screen.getByText("Multiple choice")).toBeInTheDocument();
    expect(screen.queryByTestId("save-poll")).not.toBeInTheDocument();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Ballot limit")).not.toBeInTheDocument();
  });
});
