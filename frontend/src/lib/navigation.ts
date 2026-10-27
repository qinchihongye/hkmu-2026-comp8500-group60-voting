/** 登录成功后的站内落点。根路径只负责进入登录页。 */
const DEFAULT_NEXT_PATH = "/overview";

/** 登录成功后只接受站内相对路径，拒绝协议相对和外站地址。 */
export function safeNextPath(value: string | null): string {
  if (value === null || value === "" || value === "/") {
    return DEFAULT_NEXT_PATH;
  }
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\") || value.includes("://")) {
    return DEFAULT_NEXT_PATH;
  }
  return value;
}
