const hongKong = "Asia/Hong_Kong";

export function hongKongParts(date: Date): { date: string; time: string } {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: hongKong,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

/** 把表单里的香港时间组成带 +08:00 的 ISO 字符串，不读取浏览器时区。 */
export function hongKongToIso(date: string, time: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
    throw new Error("时间格式不正确");
  }
  return `${date}T${time}:00+08:00`;
}

export function isoToHongKongParts(iso: string): { date: string; time: string } {
  return hongKongParts(new Date(iso));
}

export function formatHongKong(iso: string): string {
  return new Intl.DateTimeFormat("zh-HK", {
    timeZone: hongKong,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
}

/** 表单只精确到分钟。同一香港分钟算当前时间，更早的日期或时钟返回 true。 */
export function isBeforeCurrentHongKongMinute(date: string, time: string, now = new Date()): boolean {
  const current = hongKongParts(now);
  return date < current.date || (date === current.date && time < current.time);
}

export function defaultPollWindow(now = new Date()): {
  startsDate: string;
  startsTime: string;
  endsDate: string;
  endsTime: string;
} {
  const end = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  const starts = hongKongParts(now);
  const ends = hongKongParts(end);
  return {
    startsDate: starts.date,
    startsTime: starts.time,
    endsDate: ends.date,
    endsTime: ends.time,
  };
}

export function formatHongKongDateTimeParts(iso: string, locale: "en" | "zh"): { date: string; time: string } {
  const d = new Date(iso);
  const formatter = new Intl.DateTimeFormat(locale === "zh" ? "zh-HK" : "en-GB", {
    timeZone: hongKong,
    year: "numeric",
    month: locale === "zh" ? "2-digit" : "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(formatter.formatToParts(d).map((p) => [p.type, p.value]));
  const dateStr = locale === "zh"
    ? `${parts.year}-${parts.month}-${parts.day}`
    : `${parts.day} ${parts.month} ${parts.year}`;
  const timeStr = `${parts.hour}:${parts.minute}`;
  return { date: dateStr, time: timeStr };
}

export function formatDuration(startIso: string, endIso: string, locale: "en" | "zh"): string {
  const diffMs = Math.max(0, new Date(endIso).getTime() - new Date(startIso).getTime());
  const totalMinutes = Math.round(diffMs / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (locale === "zh") {
    if (days > 0 && hours > 0) return `${days}天${hours}小时`;
    if (days > 0) return `${days}天`;
    if (hours > 0 && minutes > 0) return `${hours}小时${minutes}分`;
    if (hours > 0) return `${hours}小时`;
    return `${minutes}分钟`;
  } else {
    if (days > 0 && hours > 0) return `${days}d ${hours}h`;
    if (days > 0) return `${days}d`;
    if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h`;
    return `${minutes}m`;
  }
}

