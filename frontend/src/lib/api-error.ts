import type { FieldError } from "./api-types";

export type ApiErrorKind = "api" | "network" | "parse";

export class ApiClientError extends Error {
  readonly kind: ApiErrorKind;
  readonly code: number;
  readonly httpStatus: number;
  readonly requestId: string | null;
  readonly errors: FieldError[];

  constructor(options: {
    message: string;
    kind: ApiErrorKind;
    code?: number;
    httpStatus?: number;
    requestId?: string | null;
    errors?: FieldError[];
  }) {
    super(options.message);
    this.name = "ApiClientError";
    this.kind = options.kind;
    this.code = options.code ?? 0;
    this.httpStatus = options.httpStatus ?? 0;
    this.requestId = options.requestId ?? null;
    this.errors = options.errors ?? [];
  }

  /** 把字段路径收成表单字段名到说明的映射。路径里的 body/data 外壳会被去掉。 */
  fieldErrors(): Record<string, string> {
    const mapped: Record<string, string> = {};
    for (const error of this.errors) {
      const parts = error.field.split(".").filter((part) => part !== "body" && part !== "data");
      const key = parts.join(".") || error.field;
      if (key && !(key in mapped)) {
        mapped[key] = error.message;
      }
    }
    return mapped;
  }
}

export function isApiClientError(error: unknown): error is ApiClientError {
  return error instanceof ApiClientError;
}
