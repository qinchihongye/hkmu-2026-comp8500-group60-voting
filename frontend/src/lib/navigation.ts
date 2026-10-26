/** 登录成功后只接受站内相对路径，拒绝协议相对和外站地址。 */
export function safeNextPath(value: string | null): string {
  if (value === null || value === "") {
    return "/";
  }
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\") || value.includes("://")) {
    return "/";
  }
  return value;
}
