import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { emptyPage, guestOk, installFetch, meAnonymous, renderRoute, sessionOf } from "../../test/fixtures";

function renderAs(session: () => Response, path = "/overview") {
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
    renderAs(meAnonymous, "/overview");
    const anonymousNav = await screen.findByRole("navigation", { name: "Main" });
    expect(within(anonymousNav).getByRole("link", { name: "Overview" })).toBeInTheDocument();
    expect(within(anonymousNav).queryByRole("link", { name: "Polls" })).not.toBeInTheDocument();
    expect(within(anonymousNav).queryByRole("link", { name: "Create poll" })).not.toBeInTheDocument();
    cleanup();

    renderAs(() => sessionOf("USER"));
    const userNav = await screen.findByRole("navigation", { name: "Main" });
    expect(within(userNav).getByRole("link", { name: "Overview" })).toHaveAttribute("href", "/overview");
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

  it("顶栏独立展示语言切换按钮，支持英语、简体中文和繁体中文切换", async () => {
    renderAs(meAnonymous, "/overview");
    const langBtn = await screen.findByRole("button", { name: "Language" });
    expect(langBtn).toBeInTheDocument();
    expect(langBtn).toHaveTextContent("En");
    expect(screen.getByRole("link", { name: "Log in" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign up" })).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(langBtn);
    expect(screen.getByRole("option", { name: /English/i })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /简体中文/i })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /繁体中文/i })).toBeInTheDocument();

    await user.click(screen.getByRole("option", { name: /简体中文/i }));
    expect(langBtn).toHaveTextContent("简");
    expect(localStorage.getItem("voting_locale")).toBe("zh");

    await user.click(langBtn);
    await user.click(screen.getByRole("option", { name: /繁体中文/i }));
    expect(langBtn).toHaveTextContent("繁");
    expect(localStorage.getItem("voting_locale")).toBe("zh-TW");

    cleanup();
    localStorage.clear();
  });
});
