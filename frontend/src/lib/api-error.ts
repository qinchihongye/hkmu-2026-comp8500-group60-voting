import type { ValidationIssue } from "./api-types";

export type ApiErrorKind = "api" | "network" | "parse";

export class ApiClientError extends Error {
  readonly kind: ApiErrorKind;
  readonly code: number;
  readonly httpStatus: number;
  readonly requestId: string | null;
  readonly issues: ValidationIssue[];

  constructor(options: {
    message: string;
    kind: ApiErrorKind;
    code?: number;
    httpStatus?: number;
    requestId?: string | null;
    issues?: ValidationIssue[];
  }) {
    super(options.message);
    this.name = "ApiClientError";
    this.kind = options.kind;
    this.code = options.code ?? 0;
    this.httpStatus = options.httpStatus ?? 0;
    this.requestId = options.requestId ?? null;
    this.issues = options.issues ?? [];
  }

  /** 把校验问题收成字段名到说明的映射。位置里的 body/data 外壳会被去掉。 */
  fieldErrors(): Record<string, string> {
    const errors: Record<string, string> = {};
    for (const issue of this.issues) {
      const parts = issue.loc.filter((part) => part !== "body" && part !== "data");
      const key = parts.join(".") || issue.field;
      if (key && !(key in errors)) {
        errors[key] = issue.msg;
      }
    }
    return errors;
  }
}

export function isApiClientError(error: unknown): error is ApiClientError {
  return error instanceof ApiClientError;
}
