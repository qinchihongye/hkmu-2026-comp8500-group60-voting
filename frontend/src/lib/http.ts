import { ApiCode } from "./api-codes";
import { ApiClientError } from "./api-error";
import type { Envelope, FieldError } from "./api-types";

export type CsrfSource = "none" | "auth" | "guest";

export type ApiRequest = {
  method?: "GET" | "POST" | "PATCH";
  path: string;
  query?: Record<string, string | number | boolean | null | undefined>;
  data?: unknown;
  csrfSource?: CsrfSource;
  signal?: AbortSignal;
  /** 注销这类成功响应的 data 就是 null。其他接口缺少 data 时视为解析失败。 */
  allowNull?: boolean;
};

const csrfTokens: Record<"auth" | "guest", string | null> = {
  auth: null,
  guest: null,
};

let retryDelayMs = 200;
const maxGetRetries = 2;

export function setCsrfToken(source: "auth" | "guest", token: string | null): void {
  csrfTokens[source] = token;
}

export function getCsrfToken(source: "auth" | "guest"): string | null {
  return csrfTokens[source];
}

export function setRetryDelayMs(delayMs: number): void {
  retryDelayMs = delayMs;
}

function sleep(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (delayMs <= 0) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, delayMs);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(abortError(signal));
      },
      { once: true },
    );
  });
}

function abortError(signal: AbortSignal): Error {
  if (signal.reason instanceof Error) {
    return signal.reason;
  }
  return new DOMException("请求已取消", "AbortError");
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function buildUrl(path: string, query: ApiRequest["query"]): string {
  const url = new URL(path, "http://localhost");
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null || value === "") {
      continue;
    }
    url.searchParams.set(key, String(value));
  }
  return `${url.pathname}${url.search}`;
}

function isEnvelope(value: unknown): value is Envelope<unknown> {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.code === "number" &&
    typeof record.msg === "string" &&
    "data" in record &&
    typeof record.request_id === "string"
  );
}

function fieldErrorsFrom(data: unknown): FieldError[] {
  if (typeof data !== "object" || data === null || !("errors" in data)) {
    return [];
  }
  const errors = (data as { errors?: unknown }).errors;
  if (!Array.isArray(errors)) {
    return [];
  }
  return errors.filter((item): item is FieldError => {
    if (typeof item !== "object" || item === null) {
      return false;
    }
    const record = item as Record<string, unknown>;
    return typeof record.field === "string" && typeof record.message === "string";
  });
}

function retryable(error: unknown): boolean {
  return (
    error instanceof ApiClientError &&
    (error.kind === "network" || error.code === ApiCode.SERVICE_UNAVAILABLE)
  );
}

async function once<T>(request: ApiRequest, method: "GET" | "POST" | "PATCH"): Promise<T> {
  if (request.signal?.aborted) {
    throw abortError(request.signal);
  }
  const headers: Record<string, string> = { Accept: "application/json" };
  const csrfSource = request.csrfSource ?? "none";
  if (csrfSource === "auth" || csrfSource === "guest") {
    const token = csrfTokens[csrfSource];
    if (token) {
      headers["X-CSRF-Token"] = token;
    }
  }
  const init: RequestInit = {
    method,
    credentials: "include",
    headers,
    signal: request.signal,
  };
  if (method !== "GET") {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify({ data: request.data ?? {} });
  }
  let response: Response;
  try {
    response = await fetch(buildUrl(request.path, request.query), init);
  } catch (error) {
    if (isAbort(error)) {
      throw error;
    }
    throw new ApiClientError({
      kind: "network",
      message: "网络连接中断，提交结果还不能确定",
    });
  }
  let text: string;
  try {
    text = await response.text();
  } catch (error) {
    if (isAbort(error)) {
      throw error;
    }
    // 响应头已经到达，但正文中断。写请求的结果仍不确定，不能当成确定失败后自动重投。
    throw new ApiClientError({
      kind: "network",
      httpStatus: response.status,
      message: "网络连接中断，提交结果还不能确定",
    });
  }
  let payload: unknown;
  try {
    payload = text === "" ? null : JSON.parse(text);
  } catch {
    throw new ApiClientError({
      kind: "parse",
      httpStatus: response.status,
      message: "服务返回了无法识别的内容",
    });
  }
  if (!isEnvelope(payload)) {
    throw new ApiClientError({
      kind: "parse",
      httpStatus: response.status,
      message: "服务返回了无法识别的内容",
    });
  }
  if (payload.code !== ApiCode.OK) {
    throw new ApiClientError({
      kind: "api",
      code: payload.code,
      httpStatus: response.status,
      requestId: payload.request_id,
      message: payload.msg,
      errors: fieldErrorsFrom(payload.data),
    });
  }
  if (payload.data === null) {
    if (request.allowNull) {
      return null as T;
    }
    throw new ApiClientError({
      kind: "parse",
      httpStatus: response.status,
      requestId: payload.request_id,
      message: "响应缺少数据",
    });
  }
  return payload.data as T;
}

/** 统一请求。POST/PATCH 只包一层 data，GET 不带 JSON body，写操作不自动重试。 */
export async function apiClient<T>(request: ApiRequest): Promise<T> {
  const method = request.method ?? "GET";
  const attempts = method === "GET" ? maxGetRetries + 1 : 1;
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await once<T>(request, method);
    } catch (error) {
      lastError = error;
      if (isAbort(error)) {
        throw error;
      }
      const canRetry = method === "GET" && retryable(error) && attempt < attempts - 1;
      if (!canRetry) {
        throw error;
      }
      await sleep(retryDelayMs, request.signal);
    }
  }
  throw lastError;
}
