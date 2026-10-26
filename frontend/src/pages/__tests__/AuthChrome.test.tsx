import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ApiCode } from "../../lib/api-codes";
import { envelope, guestOk, installFetch, renderRoute } from "../../test/fixtures";

function renderAuth(path: "/login" | "/register") {
  installFetch((url) => {
    if (url.includes("/guest/context")) {
      return guestOk();
    }
    return envelope(null, 401, ApiCode.UNAUTHENTICATED, "未登录");
  });
  renderRoute(path);
}

describe("AuthChrome", () => {
  it("登录页把语言放在右上角，访客按钮放在登录右边", async () => {
    renderAuth("/login");
    expect(
      screen.getByText(
        "Sign in to your account to participate in transparent voting, track tamper-proof ballots, and shape your community with trust!",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("BROWSE POLLS")).not.toBeInTheDocument();
    expect(localStorage.getItem("voting_locale")).toBeNull();

    const trigger = screen.getByRole("button", { name: "Language" });
    expect(trigger).toHaveTextContent("English");
    const actions = document.querySelector(".auth-actions");
    expect(actions).not.toBeNull();
    const login = within(actions as HTMLElement).getByRole("button", { name: "Log in" });
    const guest = within(actions as HTMLElement).getByRole("link", { name: "Continue as guest" });
    expect(login.compareDocumentPosition(guest) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const user = userEvent.setup();
    await user.click(trigger);
    await user.click(screen.getByRole("option", { name: "中文" }));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "语言" })).toHaveTextContent("中文");
    expect(screen.getByText("登录账户，参与透明投票，追踪防篡改的选票，与社区一起建立信任。")).toBeInTheDocument();
    expect(localStorage.getItem("voting_locale")).toBe("zh");
  });

  it("注册页使用同一套语言菜单和访客按钮", () => {
    renderAuth("/register");
    expect(
      screen.getByText(
        "Create your account to unlock verified voting, review audit trails, and shape your organization with fair decisions!",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("CREATE HERE")).not.toBeInTheDocument();
    const actions = document.querySelector(".auth-actions");
    expect(within(actions as HTMLElement).getByRole("button", { name: "Sign up" })).toBeInTheDocument();
    expect(within(actions as HTMLElement).getByRole("link", { name: "Continue as guest" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Language" })).toHaveTextContent("English");
  });
});