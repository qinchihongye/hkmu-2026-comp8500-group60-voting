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
