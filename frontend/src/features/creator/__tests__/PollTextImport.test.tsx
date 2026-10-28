import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PollTextImport } from "../PollTextImport";
import * as api from "../api";
import { LocaleProvider } from "../../../i18n/LocaleProvider";

vi.mock("../api", () => ({
  getPollTextImportCapabilities: vi.fn(),
  parsePollText: vi.fn(),
}));

function renderWithI18n(ui: React.ReactElement) {
  return render(<LocaleProvider>{ui}</LocaleProvider>);
}

describe("PollTextImport", () => {
  it("当功能未开启 (enabled=false) 时，不渲染任何 DOM", async () => {
    vi.mocked(api.getPollTextImportCapabilities).mockResolvedValueOnce({
      enabled: false,
      max_text_length: 10000,
      timezone: "Asia/Hong_Kong",
    });

    const onApply = vi.fn();
    const { container } = renderWithI18n(<PollTextImport onApply={onApply} />);

    await waitFor(() => {
      expect(api.getPollTextImportCapabilities).toHaveBeenCalled();
    });
    expect(container.firstChild).toBeNull();
  });

  it("当功能开启 (enabled=true) 时，正常展示卡片与折叠交互", async () => {
    vi.mocked(api.getPollTextImportCapabilities).mockResolvedValueOnce({
      enabled: true,
      max_text_length: 10000,
      timezone: "Asia/Hong_Kong",
    });

    const onApply = vi.fn();
    renderWithI18n(<PollTextImport onApply={onApply} />);

    expect(await screen.findByText(/Import from text|智能文本识别导入/)).toBeInTheDocument();
    expect(screen.getByText(/Expand ▼|展开 ▼/)).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).toBeNull();

    await userEvent.click(screen.getByText(/Import from text|智能文本识别导入/));
    expect(screen.getByText(/Collapse ▲|收起 ▲/)).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("输入内容后点击清空，文本域被重置", async () => {
    vi.mocked(api.getPollTextImportCapabilities).mockResolvedValueOnce({
      enabled: true,
      max_text_length: 10000,
      timezone: "Asia/Hong_Kong",
    });

    const onApply = vi.fn();
    renderWithI18n(<PollTextImport onApply={onApply} />);

    await userEvent.click(await screen.findByText(/Import from text|智能文本识别导入/));
    const textarea = screen.getByRole("textbox");
    await userEvent.type(textarea, "周五技术分享：\n1. React\n2. Vue");
    expect(textarea).toHaveValue("周五技术分享：\n1. React\n2. Vue");

    await userEvent.click(screen.getByRole("button", { name: /Clear|清空/ }));
    expect(textarea).toHaveValue("");
  });

  it("点击识别并自动填充，成功调用接口并回调 onApply", async () => {
    vi.mocked(api.getPollTextImportCapabilities).mockResolvedValueOnce({
      enabled: true,
      max_text_length: 10000,
      timezone: "Asia/Hong_Kong",
    });
    vi.mocked(api.parsePollText).mockResolvedValueOnce({
      fields: {
        title: "周五技术分享",
        description: "本周技术研讨",
        options: [{ label: "React" }, { label: "Vue" }, { label: "Angular" }],
        selection_mode: "SINGLE",
      },
      issues: [],
      reference_time: "2026-10-28T21:00:00+08:00",
      timezone: "Asia/Hong_Kong",
    });

    const onApply = vi.fn();
    renderWithI18n(<PollTextImport onApply={onApply} />);

    await userEvent.click(await screen.findByText(/Import from text|智能文本识别导入/));
    const textarea = screen.getByRole("textbox");
    await userEvent.type(textarea, "周五技术分享：\n1. React\n2. Vue\n3. Angular");

    await userEvent.click(screen.getByRole("button", { name: /Parse & Auto-fill|识别并自动填充/ }));

    await waitFor(() => {
      expect(onApply).toHaveBeenCalledWith(
        {
          title: "周五技术分享",
          description: "本周技术研讨",
          options: [{ label: "React" }, { label: "Vue" }, { label: "Angular" }],
          selection_mode: "SINGLE",
        },
        [],
      );
    });

    expect(screen.getByText(/Successfully parsed and auto-filled|已成功识别并自动填入表单/)).toBeInTheDocument();
  });
});
