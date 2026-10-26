import { ApiCode } from "../api-codes";
import { ApiClientError } from "../api-error";
import { apiClient, getCsrfToken, setCsrfToken, setRetryDelayMs } from "../http";
import { safeNextPath } from "../navigation";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function ok(data: unknown, status = 200): Response {
  return json({ code: 0, msg: "ok", data, request_id: "req-1" }, status);
}

describe("apiClient", () => {
  beforeEach(() => {
    setRetryDelayMs(0);
    setCsrfToken("auth", null);
    setCsrfToken("guest", null);
  });

  it("只给 POST 包一层 data，GET 不带 body", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => ok({ id: 1 }, 201));
    vi.stubGlobal("fetch", fetchMock);
    await apiClient({ method: "POST", path: "/api/v1/auth/register", data: { username: "ada" }, csrfSource: "none" });
    const postInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(postInit.method).toBe("POST");
    expect(JSON.parse(String(postInit.body))).toEqual({ data: { username: "ada" } });
    expect(String(postInit.body)).not.toContain("request_id");
    expect(new Headers(postInit.headers).get("Idempotency-Key")).toBeNull();

    fetchMock.mockResolvedValueOnce(ok({ items: [], page: 1, page_size: 12, total: 0 }));
    await apiClient({ path: "/api/v1/polls", query: { page: 1, q: "", status: undefined } });
    const getCall = fetchMock.mock.calls[1];
    expect(getCall?.[0]).toBe("/api/v1/polls?page=1");
    expect((getCall?.[1] as RequestInit).body).toBeUndefined();
  });

  it("注销接受 data 为 null，并带上账户 CSRF", async () => {
    setCsrfToken("auth", "auth-token");
    setCsrfToken("guest", "guest-token");
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      json({ code: 0, msg: "ok", data: null, request_id: "req-logout" }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      apiClient({ method: "POST", path: "/api/v1/auth/logout", data: {}, csrfSource: "auth", allowNull: true }),
    ).resolves.toBeNull();
    const headers = new Headers((fetchMock.mock.calls[0]?.[1] as RequestInit).headers);
    expect(headers.get("X-CSRF-Token")).toBe("auth-token");
    expect(getCsrfToken("guest")).toBe("guest-token");
  });

  it("失败进入 ApiClientError，字段错误可以映射", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        json(
          {
            code: ApiCode.VALIDATION_ERROR,
            msg: "请求参数不合法",
            data: { issues: [{ field: "title", loc: ["body", "data", "title"], msg: "标题太短" }] },
            request_id: "req-422",
          },
          422,
        ),
      ),
    );
    const error = await apiClient({ method: "POST", path: "/api/v1/polls", data: { title: "" } }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiClientError);
    expect(error).toMatchObject({ code: ApiCode.VALIDATION_ERROR, requestId: "req-422" });
    expect((error as ApiClientError).fieldErrors()).toEqual({ title: "标题太短" });
  });

  it("网络和非 JSON 响应可以识别，写请求不重试", async () => {
    const writeMock = vi.fn(async () => {
      throw new TypeError("offline");
    });
    vi.stubGlobal("fetch", writeMock);
    await expect(apiClient({ method: "POST", path: "/api/v1/polls/1/votes", data: { option_id: 1 } })).rejects.toMatchObject({
      kind: "network",
    });
    expect(writeMock).toHaveBeenCalledTimes(1);

    vi.stubGlobal("fetch", vi.fn(async () => new Response("upstream", { status: 502 })));
    await expect(apiClient({ path: "/api/v1/polls" })).rejects.toMatchObject({ kind: "parse" });
  });

  it("安全 GET 最多重试两次，业务 404 不重试", async () => {
    let attempts = 0;
    const fetchMock = vi.fn(async () => {
      attempts += 1;
      if (attempts < 3) {
        throw new TypeError("offline");
      }
      return ok({ status: "live" });
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(apiClient({ path: "/api/v1/health/live" })).resolves.toEqual({ status: "live" });
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const missing = vi.fn(async () =>
      json({ code: ApiCode.POLL_NOT_FOUND, msg: "投票不存在", data: null, request_id: "req-404" }, 404),
    );
    vi.stubGlobal("fetch", missing);
    await expect(apiClient({ path: "/api/v1/polls/9" })).rejects.toMatchObject({ code: ApiCode.POLL_NOT_FOUND });
    expect(missing).toHaveBeenCalledTimes(1);
  });

  it("访客 CSRF 与账户 CSRF 按来源分开", async () => {
    setCsrfToken("auth", "auth-token");
    setCsrfToken("guest", "guest-token");
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      ok({ receipt_id: "r", poll_id: 1, submitted_at: "2026-10-24T00:00:00Z" }, 201),
    );
    vi.stubGlobal("fetch", fetchMock);
    await apiClient({ method: "POST", path: "/api/v1/polls/1/votes", data: { option_id: 2 }, csrfSource: "guest" });
    expect(new Headers((fetchMock.mock.calls[0]?.[1] as RequestInit).headers).get("X-CSRF-Token")).toBe("guest-token");
  });
});

describe("safeNextPath", () => {
  it("只接受站内相对路径", () => {
    expect(safeNextPath("/s/abc")).toBe("/s/abc");
    expect(safeNextPath("https://evil.example/s/abc")).toBe("/");
    expect(safeNextPath("//evil.example")).toBe("/");
    expect(safeNextPath(null)).toBe("/");
  });
});
