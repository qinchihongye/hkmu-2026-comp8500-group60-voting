import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { emptyPage, guestOk, installFetch, meAnonymous, renderRoute, sessionOf } from "../../test/fixtures";

function renderAs(session: () => Response, path = "/") {
  installFetch((url) => {
    if (url.includes("/auth/me")) {
      return session();
    }
    if (url.includes("/guest/context")) {
      return guestOk();
    }
    return emptyPage(1);
  });
  renderRoute(path);
}

describe("AppLayout", () => {
  it("登录用户看到创建入口，管理员才看到监督", async () => {
    renderAs(meAnonymous);
    const anonymousNav = await screen.findByRole("navigation", { name: "Main" });
    expect(within(anonymousNav).getByRole("link", { name: "Polls" })).toBeInTheDocument();
    expect(within(anonymousNav).queryByRole("link", { name: "Create poll" })).not.toBeInTheDocument();
    cleanup();

    renderAs(() => sessionOf("USER"));
    const userNav = await screen.findByRole("navigation", { name: "Main" });
    expect(within(userNav).getByRole("link", { name: "Create poll" })).toBeInTheDocument();
    expect(within(userNav).getByRole("link", { name: "My polls" })).toBeInTheDocument();
    expect(within(userNav).getByRole("link", { name: "History" })).toBeInTheDocument();
    expect(within(userNav).queryByRole("link", { name: "Supervision" })).not.toBeInTheDocument();
    cleanup();

    renderAs(() => sessionOf("ADMIN", "管理员"));
    const adminNav = await screen.findByRole("navigation", { name: "Main" });
    expect(within(adminNav).getByRole("link", { name: "Supervision" })).toBeInTheDocument();
    expect(within(adminNav).getByRole("link", { name: "Create poll" })).toBeInTheDocument();
  });

  it("已登录把语言开关放进账户菜单，未登录顶栏不显示语言开关", async () => {
    renderAs(meAnonymous);
    expect(document.querySelector(".locale-switch")).toBeNull();
    expect(screen.queryByRole("button", { name: "Language" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Log in" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign up" })).toBeInTheDocument();
    cleanup();

    renderAs(() => sessionOf("USER"));
    const account = await screen.findByRole("button", { name: "Account menu" });
    expect(document.querySelector(".locale-switch")).toBeNull();
    const menu = screen.getByRole("menu", { name: "Account" });
    const language = within(menu).getByRole("button", { name: "Language" });
    expect(language).toHaveTextContent("English");
    expect(within(menu).queryByRole("group", { name: "Language" })).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(account);
    expect(account).toHaveAttribute("aria-expanded", "true");
    await user.click(language);
    await user.click(within(menu).getByRole("option", { name: "中文" }));
    expect(account).toHaveAttribute("aria-expanded", "true");
    expect(screen.queryByRole("option", { name: "中文" })).not.toBeInTheDocument();
    const chineseMenu = screen.getByRole("menu", { name: "用户选项" });
    expect(within(chineseMenu).getByRole("button", { name: "语言" })).toHaveTextContent("中文");
    expect(within(chineseMenu).getByRole("button", { name: "退出登录" })).toBeInTheDocument();
    expect(localStorage.getItem("voting_locale")).toBe("zh");
    cleanup();
    localStorage.clear();

    renderAs(() => sessionOf("ADMIN"));
    const adminMenu = await screen.findByRole("menu", { name: "Account" });
    const adminLanguage = within(adminMenu).getByRole("button", { name: "Language" });
    const supervision = within(adminMenu).getByRole("link", { name: "Supervision" });
    const logout = within(adminMenu).getByRole("button", { name: "Log out" });
    expect(adminLanguage.compareDocumentPosition(supervision) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(supervision.compareDocumentPosition(logout) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
