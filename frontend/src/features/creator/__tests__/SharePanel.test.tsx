import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "../../../test/fixtures";
import { SharePanel } from "../SharePanel";

describe("SharePanel", () => {
  it("复制的链接不含访问密码", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    renderWithProviders(
      <SharePanel
        shareUrl="http://localhost:5173/s/share-code"
        requiresPassword
        requiresLogin
      />,
    );
    const field = screen.getByLabelText("Link");
    expect(field).toHaveValue("http://localhost:5173/s/share-code");
    expect(screen.queryByText("access-pass1")).not.toBeInTheDocument();
    expect(screen.getByText(/The link does not contain it/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Copy link" }));
    expect(writeText).toHaveBeenCalledWith("http://localhost:5173/s/share-code");
  });
});
