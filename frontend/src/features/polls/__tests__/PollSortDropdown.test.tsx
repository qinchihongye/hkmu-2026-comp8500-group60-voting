import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { LocaleProvider } from "../../../i18n/LocaleProvider";
import { PollSortDropdown } from "../PollSortDropdown";

function renderWithProviders(ui: React.ReactElement) {
  return render(<LocaleProvider>{ui}</LocaleProvider>);
}

describe("PollSortDropdown", () => {
  it("渲染当前排序项并在点击时展开下拉菜单", async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();

    renderWithProviders(<PollSortDropdown value="created_at" onChange={handleChange} />);

    // 默认展示“最新发布”
    expect(screen.getByRole("button", { name: /Sort by: Recently created/i })).toBeInTheDocument();
    expect(screen.getByText("Recently created")).toBeInTheDocument();

    // 点击按钮展开菜单
    await user.click(screen.getByRole("button", { name: /Sort by: Recently created/i }));

    // 菜单选项出现
    expect(screen.getByRole("menuitemradio", { name: /Most popular/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: /Closing soon/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: /Recently created/i })).toBeInTheDocument();
    expect(screen.queryByRole("menuitemradio", { name: /Start time/i })).not.toBeInTheDocument();

    // 点击选择“Most popular”
    await user.click(screen.getByRole("menuitemradio", { name: /Most popular/i }));
    expect(handleChange).toHaveBeenCalledWith("popularity");

    // 菜单自动收起
    expect(screen.queryByRole("menuitemradio", { name: /Most popular/i })).not.toBeInTheDocument();
  });

  it("按 Escape 键或点击外部可关闭下拉菜单", async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();

    renderWithProviders(
      <div>
        <div data-testid="outside">Outside area</div>
        <PollSortDropdown value="ends_at" onChange={handleChange} />
      </div>,
    );

    const btn = screen.getByRole("button", { name: /Sort by: Closing soon/i });
    await user.click(btn);
    expect(screen.getByRole("menuitemradio", { name: /Closing soon/i })).toBeInTheDocument();

    // 按 Escape 键关闭
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menuitemradio", { name: /Closing soon/i })).not.toBeInTheDocument();

    // 再次打开并点击外部关闭
    await user.click(btn);
    expect(screen.getByRole("menuitemradio", { name: /Closing soon/i })).toBeInTheDocument();
    await user.click(screen.getByTestId("outside"));
    expect(screen.queryByRole("menuitemradio", { name: /Closing soon/i })).not.toBeInTheDocument();
  });
});

