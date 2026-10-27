import type { Translate } from "../../i18n/LocaleProvider";
import type { Locale } from "../../i18n/messages";

const hongKong = "Asia/Hong_Kong";

type SchedulePoll = {
  effective_status: string;
  starts_at: string;
  ends_at: string;
};

export function pollScheduleText(
  poll: SchedulePoll,
  locale: Locale,
  t: Translate,
  now = new Date(),
): string {
  if (poll.effective_status === "CLOSED") {
    return t("polls.ended");
  }
  if (poll.effective_status === "SCHEDULED") {
    return t("polls.startsOn", { date: startDay(poll.starts_at, locale) });
  }
  return remainingText(poll.ends_at, locale, t, now);
}

function remainingText(endsAt: string, locale: Locale, t: Translate, now: Date): string {
  const totalMinutes = Math.max(0, Math.floor((new Date(endsAt).getTime() - now.getTime()) / 60000));
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  if (locale === "zh") {
    return remainingZh(days, hours, minutes, t);
  }
  return remainingEn(days, hours, minutes, t);
}

function remainingEn(days: number, hours: number, minutes: number, t: Translate): string {
  if (days > 0 && hours === 0 && minutes === 0) {
    return days === 1 ? t("polls.timeDay") : t("polls.timeDays", { days });
  }
  if (days > 0 && hours > 0 && minutes > 0) {
    return t("polls.timeDaysHoursMinutes", { days, hours: pad(hours), minutes: pad(minutes) });
  }
  if (days > 0 && hours > 0) {
    return t("polls.timeDaysHours", { days, hours: pad(hours) });
  }
  if (days > 0) {
    return t("polls.timeDaysMinutes", { days, minutes: pad(minutes) });
  }
  if (hours > 0 && minutes > 0) {
    return t("polls.timeHoursMinutes", { hours: pad(hours), minutes: pad(minutes) });
  }
  if (hours > 0) {
    return t("polls.timeHours", { hours: pad(hours) });
  }
  return t("polls.timeMinutes", { minutes });
}

function remainingZh(days: number, hours: number, minutes: number, t: Translate): string {
  if (days > 0 && hours === 0 && minutes === 0) {
    return days === 1 ? t("polls.timeDay") : t("polls.timeDays", { days });
  }
  if (days > 0 && hours > 0 && minutes > 0) {
    return t("polls.timeDaysHoursMinutes", { days, hours, minutes });
  }
  if (days > 0 && hours > 0) {
    return t("polls.timeDaysHours", { days, hours });
  }
  if (days > 0) {
    return t("polls.timeDaysMinutes", { days, minutes });
  }
  if (hours > 0 && minutes > 0) {
    return t("polls.timeHoursMinutes", { hours, minutes });
  }
  if (hours > 0) {
    return t("polls.timeHours", { hours });
  }
  return t("polls.timeMinutes", { minutes });
}

function startDay(iso: string, locale: Locale): string {
  const date = new Date(iso);
  if (locale === "zh") {
    const parts = partsOf(date, "zh-HK", { month: "numeric", day: "numeric" });
    return `${parts.month} 月 ${parts.day} 日`;
  }
  const parts = partsOf(date, "en-US", { month: "short", day: "numeric" });
  const day = Number(parts.day);
  return `${parts.month} ${day}${ordinal(day)}`;
}

function partsOf(date: Date, locale: string, options: Intl.DateTimeFormatOptions): Record<string, string> {
  return Object.fromEntries(
    new Intl.DateTimeFormat(locale, { timeZone: hongKong, ...options }).formatToParts(date).map((part) => [part.type, part.value]),
  );
}

function ordinal(day: number): string {
  const mod100 = day % 100;
  if (mod100 >= 11 && mod100 <= 13) {
    return "th";
  }
  if (day % 10 === 1) {
    return "st";
  }
  if (day % 10 === 2) {
    return "nd";
  }
  if (day % 10 === 3) {
    return "rd";
  }
  return "th";
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}
