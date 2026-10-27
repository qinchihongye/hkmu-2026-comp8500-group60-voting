import { translate } from "../../../i18n/messages";
import { pollScheduleText } from "../scheduleLabel";

const now = new Date("2026-10-27T12:00:00Z");

function label(status: string, startsAt: string, endsAt: string, locale: "en" | "zh"): string {
  return pollScheduleText(
    { effective_status: status, starts_at: startsAt, ends_at: endsAt },
    locale,
    (key, vars) => translate(locale, key, vars),
    now,
  );
}

describe("pollScheduleText", () => {
  it("用剩余时间代替起止时刻", () => {
    expect(label("OPEN", "2026-10-27T10:00:00Z", "2026-10-28T16:22:00Z", "en")).toBe("1d 04h 22m");
    expect(label("OPEN", "2026-10-27T10:00:00Z", "2026-10-28T16:22:00Z", "zh")).toBe("剩余 1 天 4 小时 22 分");
    expect(label("OPEN", "2026-10-27T10:00:00Z", "2026-11-06T12:00:00Z", "en")).toBe("10 days left");
    expect(label("OPEN", "2026-10-27T10:00:00Z", "2026-10-27T20:15:00Z", "en")).toBe("08h 15m left");
    expect(label("OPEN", "2026-10-27T10:00:00Z", "2026-10-27T20:15:00Z", "zh")).toBe("剩余 8 小时 15 分");
  });

  it("未开始只写开始日期，已结束不写时间范围", () => {
    expect(label("SCHEDULED", "2026-11-01T00:00:00+08:00", "2026-11-02T00:00:00+08:00", "en")).toBe("Starts Nov 1st");
    expect(label("SCHEDULED", "2026-10-29T20:57:00+08:00", "2026-10-30T20:57:00+08:00", "zh")).toBe("10 月 29 日开始");
    expect(label("CLOSED", "2026-10-20T00:00:00Z", "2026-10-21T00:00:00Z", "en")).toBe("Ended");
    expect(label("CLOSED", "2026-10-20T00:00:00Z", "2026-10-21T00:00:00Z", "zh")).toBe("已结束");
  });
});
