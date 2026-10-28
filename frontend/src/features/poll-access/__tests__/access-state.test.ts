import { deriveAccessState } from "../access-state";

const base = {
  loading: false,
  authenticated: false,
  loginRequired: false,
  passwordRequired: false,
  accountExpired: false,
  grantExpired: false,
  submissionUnknown: false,
  hasVoted: false,
  hasDetail: false,
};

describe("deriveAccessState", () => {
  it("把账户失效和密码授权失效分成两种状态", () => {
    expect(deriveAccessState({ ...base, accountExpired: true, loginRequired: true })).toBe("login_required");
    expect(deriveAccessState({ ...base, grantExpired: true, passwordRequired: true })).toBe("password_required");
    expect(deriveAccessState({ ...base, accountExpired: true, grantExpired: true })).toBe("login_required");
  });

  it("未解锁私密场次不进入可投票状态", () => {
    expect(deriveAccessState({ ...base, passwordRequired: true })).toBe("password_required");
    expect(
      deriveAccessState({ ...base, passwordRequired: true, loginRequired: true }),
    ).toBe("login_required");
    expect(deriveAccessState({ ...base, hasDetail: true })).toBe("ready");
    expect(deriveAccessState({ ...base, hasDetail: true, hasVoted: true })).toBe("voted");
    expect(deriveAccessState({ ...base, submissionUnknown: true })).toBe("submission_unknown");
  });

  it("请求结束后没有详情时是失败，不是继续加载", () => {
    expect(deriveAccessState(base)).toBe("access_failed");
    expect(deriveAccessState({ ...base, loading: true })).toBe("access_loading");
  });
});
