import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "../../../test/fixtures";
import { SharePanel } from "../SharePanel";

describe("SharePanel", () => {
  it("分开复制链接和访问密码，邀请文字按三段排列", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    renderWithProviders(
      <SharePanel
        shareUrl="http://localhost:5173/s/share-code"
        requiresPassword
        requiresLogin
        accessPassword="access-pass1"
      />,
    );
    const field = screen.getByLabelText("Poll link");
    expect(field).toHaveValue("http://localhost:5173/s/share-code");
    expect(screen.getByRole("img", { name: "QR code" })).toBeInTheDocument();
    const logo = document.querySelector(".share-qr-box image");
    expect(logo?.getAttribute("href")).toBe("/favicon.png");
    expect(document.querySelector(".share-qr-box text")).toBeNull();
    expect(screen.getByText("Access passcode: access-pass1")).toBeInTheDocument();
    expect(screen.getByText(/The link does not contain it/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Copy link" }));
    await userEvent.click(screen.getByRole("button", { name: "Copy access passcode" }));
    await userEvent.click(screen.getByRole("button", { name: "Copy invitation text" }));
    expect(writeText).toHaveBeenNthCalledWith(1, "http://localhost:5173/s/share-code");
    expect(writeText).toHaveBeenNthCalledWith(2, "access-pass1");
    expect(writeText).toHaveBeenNthCalledWith(
      3,
      [
        "http://localhost:5173/s/share-code",
        "Participants must sign in. They also need the access passcode. The link does not contain it.",
        "password: access-pass1",
      ].join("\n\n"),
    );
    expect(document.querySelector(".share-qr-box")?.innerHTML).not.toContain("access-pass1");
  });

  it("非安全地址点击后仍能复制，输入框保持只读", async () => {
    Object.defineProperty(window, "isSecureContext", { configurable: true, value: false });
    const execCommand = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, "execCommand", { configurable: true, value: execCommand });
    renderWithProviders(
      <SharePanel
        shareUrl="http://203.0.113.10:8188/s/share-code"
        requiresPassword={false}
        requiresLogin={false}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Copy link" }));

    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(screen.getByText("Copied")).toBeInTheDocument();
    expect(screen.getByLabelText("Poll link")).toHaveProperty("readOnly", true);
    execCommand.mockRestore();
  });
});
