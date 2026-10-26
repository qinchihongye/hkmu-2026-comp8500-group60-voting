import { fireEvent, screen } from "@testing-library/react";

import { ApiCode } from "../../lib/api-codes";
import { envelope, guestOk, installFetch, renderRoute } from "../../test/fixtures";

describe("Password Visibility Toggle", () => {
  it("LoginPage 支持通过眼睛按钮切换密码的显示与隐藏", async () => {
    installFetch((url) => {
      if (url.includes("/guest/context")) {
        return guestOk();
      }
      return envelope(null, 401, ApiCode.UNAUTHENTICATED, "未登录");
    });

    renderRoute("/login");

    const passwordInput = screen.getByLabelText("Password") as HTMLInputElement;
    expect(passwordInput.type).toBe("password");

    const toggleButton = screen.getByTitle("Show password");
    expect(toggleButton).toBeInTheDocument();

    // Click to show password
    fireEvent.click(toggleButton);
    expect(passwordInput.type).toBe("text");
    expect(screen.getByTitle("Hide password")).toBeInTheDocument();

    // Click to hide password again
    fireEvent.click(screen.getByTitle("Hide password"));
    expect(passwordInput.type).toBe("password");
    expect(screen.getByTitle("Show password")).toBeInTheDocument();
  });

  it("RegisterPage 支持通过眼睛按钮切换密码的显示与隐藏", async () => {
    installFetch((url) => {
      if (url.includes("/guest/context")) {
        return guestOk();
      }
      return envelope(null, 401, ApiCode.UNAUTHENTICATED, "未登录");
    });

    renderRoute("/register");

    const passwordInput = screen.getByLabelText("Password") as HTMLInputElement;
    expect(passwordInput.type).toBe("password");

    const toggleButton = screen.getByTitle("Show password");
    expect(toggleButton).toBeInTheDocument();

    // Click to show password
    fireEvent.click(toggleButton);
    expect(passwordInput.type).toBe("text");
    expect(screen.getByTitle("Hide password")).toBeInTheDocument();

    // Click to hide password again
    fireEvent.click(screen.getByTitle("Hide password"));
    expect(passwordInput.type).toBe("password");
  });

  it("点击社交登录按钮显示 Coming Soon 弹窗，点击 Got It 或关闭按钮可关闭", async () => {
    installFetch((url) => {
      if (url.includes("/guest/context")) {
        return guestOk();
      }
      return envelope(null, 401, ApiCode.UNAUTHENTICATED, "未登录");
    });

    renderRoute("/login");

    // Modal is initially not in document
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    // Click Google social icon button
    const googleBtn = screen.getByTitle("Google");
    fireEvent.click(googleBtn);

    // Modal is visible
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Coming Soon" })).toBeInTheDocument();
    expect(
      screen.getByText("Social login is not available yet. We're working on bringing this feature to you soon.")
    ).toBeInTheDocument();

    // Click "Got It" button to close
    const gotItBtn = screen.getByRole("button", { name: "Got It" });
    fireEvent.click(gotItBtn);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
