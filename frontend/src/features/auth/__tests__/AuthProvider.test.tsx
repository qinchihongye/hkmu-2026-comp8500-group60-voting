import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { getCsrfToken } from "../../../lib/http";
import { emptyPage, guestOk, installFetch, meAnonymous, renderRoute, sessionOf } from "../../../test/fixtures";

describe("AuthProvider", () => {
  it("公开广场在会话 401 时仍可访问，且不把令牌写入 localStorage", async () => {
    installFetch((url) => {
      if (url.includes("/auth/me")) {
        return meAnonymous();
      }
      if (url.includes("/guest/context")) {
        return guestOk();
      }
      if (url.includes("/polls")) {
        return emptyPage(3);
      }
      return meAnonymous();
    });
    renderRoute("/");
    expect(await screen.findByText("The public poll list shows published public polls only.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Log in" })).not.toBeInTheDocument();
    expect(localStorage.length).toBe(0);
    expect(getCsrfToken("guest")).toBe("guest-csrf");
  });

  it("登录和注销不改写访客 CSRF", async () => {
    installFetch((url, init) => {
      if (url.includes("/auth/login")) {
        expect(new Headers(init?.headers).get("X-CSRF-Token")).toBeNull();
        expect(JSON.parse(String(init?.body))).toEqual({ data: { username: "demo_user", password: "password-ada-1" } });
        return sessionOf("USER", "演示用户");
      }
      if (url.includes("/auth/logout")) {
        expect(new Headers(init?.headers).get("X-CSRF-Token")).toBe("auth-csrf");
        return new Response(JSON.stringify({ code: 0, msg: "ok", data: null, request_id: "req-out" }), { status: 200 });
      }
      if (url.includes("/auth/me")) {
        return meAnonymous();
      }
      if (url.includes("/guest/context")) {
        return guestOk();
      }
      return emptyPage(0);
    });
    renderRoute("/login");
    await screen.findByRole("heading", { name: "Log in" });
    await userEvent.type(screen.getByLabelText("Username"), "demo_user");
    await userEvent.type(screen.getByLabelText("Password"), "password-ada-1");
    await userEvent.click(screen.getByRole("button", { name: "Log in" }));
    expect(await screen.findByText("演示用户")).toBeInTheDocument();
    expect(localStorage.length).toBe(0);
    expect(getCsrfToken("guest")).toBe("guest-csrf");
    await userEvent.click(screen.getByRole("button", { name: "Account menu" }));
    await userEvent.click(screen.getByRole("button", { name: "Log out" }));
    await waitFor(() => expect(getCsrfToken("auth")).toBeNull());
    expect(getCsrfToken("guest")).toBe("guest-csrf");
  });
});
