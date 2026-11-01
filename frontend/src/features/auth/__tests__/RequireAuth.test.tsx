import { screen } from "@testing-library/react";

import { emptyPage, guestOk, installFetch, meAnonymous, renderRoute, sessionOf } from "../../../test/fixtures";

function routeFetch(session: () => Response) {
  installFetch((url) => {
    if (url.includes("/auth/me")) {
      return session();
    }
    if (url.includes("/guest/context")) {
      return guestOk();
    }
    return emptyPage(0);
  });
}

describe("RequireAuth", () => {
  it("普通用户不能进管理员页，但可以进自己的创建页", async () => {
    routeFetch(() => sessionOf("USER"));
    renderRoute("/admin/polls");
    expect(await screen.findByRole("heading", { name: "You cannot view this page" })).toBeInTheDocument();
  });

  it("普通用户访问 /admin/elections 及子路由被拒绝并重定向到 403", async () => {
    routeFetch(() => sessionOf("USER"));
    renderRoute("/admin/elections");
    expect(await screen.findByRole("heading", { name: "You cannot view this page" })).toBeInTheDocument();
  });

  it("普通用户访问 /admin/elections/1/registrations 被拒绝并重定向到 403", async () => {
    routeFetch(() => sessionOf("USER"));
    renderRoute("/admin/elections/1/registrations");
    expect(await screen.findByRole("heading", { name: "You cannot view this page" })).toBeInTheDocument();
  });

  it("匿名用户访问 /admin/elections 重定向到登录页", async () => {
    routeFetch(meAnonymous);
    renderRoute("/admin/elections");
    expect(await screen.findByRole("heading", { name: "Log in" })).toBeInTheDocument();
  });

  it("普通用户可以打开我创建的", async () => {
    routeFetch(() => sessionOf("USER"));
    renderRoute("/my-polls");
    expect(await screen.findByRole("heading", { name: "My polls" })).toBeInTheDocument();
  });

  it("匿名访问创建页时去登录", async () => {
    routeFetch(meAnonymous);
    renderRoute("/my-polls");
    expect(await screen.findByRole("heading", { name: "Log in" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "My polls" })).not.toBeInTheDocument();
  });
});
