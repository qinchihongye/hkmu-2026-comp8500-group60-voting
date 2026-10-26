import { screen, waitFor } from "@testing-library/react";

import { ApiCode } from "../../lib/api-codes";
import { envelope, guestOk, installFetch, renderRoute, samplePoll, sessionOf } from "../../test/fixtures";

describe("DashboardPage", () => {
  it("概览使用列表 total，不用当前页行数", async () => {
    installFetch((url) => {
      if (url.includes("/auth/me")) {
        return sessionOf("USER");
      }
      if (url.includes("/guest/context")) {
        return guestOk();
      }
      if (url.includes("/me/votes")) {
        return envelope({
          items: [
            {
              receipt_id: "11111111-1111-1111-1111-111111111111",
              poll_id: 1,
              poll_title: "只有这一行",
              submitted_at: "2026-10-24T00:00:00Z",
            },
          ],
          page: 1,
          page_size: 1,
          total: 7,
        });
      }
      if (url.includes("/polls")) {
        return envelope({ items: [samplePoll()], page: 1, page_size: 1, total: 40 });
      }
      return envelope(null, 404, ApiCode.NOT_FOUND, "资源不存在");
    });
    renderRoute("/");
    await waitFor(() => expect(screen.getByTestId("open-total")).toHaveTextContent("40"));
    await waitFor(() => expect(screen.getByTestId("named-total")).toHaveTextContent("7"));
  });
});
