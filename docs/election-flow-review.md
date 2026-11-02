# 选举流程代码审查

* 审查日期：2026-11-02。范围：当前选举后端流程、相关前端页面及类型检查。本文记录已发现的问题与建议处理顺序；未修改业务代码。

## 当前流程

* 管理员创建选举草稿并发布。发布后，系统按时间和名册状态计算 `UPCOMING → REGISTRATION → REVIEW → VOTING → RESULTS` 五个阶段。选民在登记期提交身份信息；本地规则自动判断，需复核的登记由管理员处理。登记结束且无待审记录后，管理员冻结名册，系统给获批选民发放一次性投票凭证。投票期内，合资格选民选择候选人并提交选票。到达结束时间、管理员提前关闭或达到获胜票数阈值后，进入结果阶段；未投票的合资格选民计为弃权。

  ```mermaid
  flowchart LR
      A[创建草稿] --> B[发布]
      B --> C[身份登记]
      C --> D[自动审核与人工复核]
      D --> E[冻结名册并发放凭证]
      E --> F[提交选票]
      F --> G[结束或达到阈值]
      G --> H[结果与弃权统计]
  ```

## 发现的问题

* **高优先级：未发布草稿可能提前暴露结果数据。** [阶段计算](../backend/src/main/python/algorithms/election_module/election_service.py#L51) 对草稿返回 `UPCOMING`，但[结果服务](../backend/src/main/python/algorithms/election_module/election_result_service.py#L76) 又把 `now >= ends_at` 视为已结束，并允许任何访问者读取候选人票数及选举标题。建议在结果接口先检查 `lifecycle`，草稿只允许管理员访问；公开结果必须以已发布或已关闭为前提。

* **高优先级：投票提交与阈值关闭不在同一事务。** [提交接口](../backend/src/main/python/api/election/election_post.py#L67) 先调用 `cast_ballot()`，再调用 `check_and_trigger_threshold()`。两次操作之间并发提交可能使票数超过阈值；第二次操作失败时，选票可能已经入库，但客户端收到失败响应。建议在锁定选举记录的同一事务中完成资格校验、写票、票数判断与关闭，并针对并发提交测试。

* **高优先级：登记与冻结名册存在边界竞争。** [登记服务](../backend/src/main/python/algorithms/election_module/eligibility_service.py#L78) 检查冻结状态后继续登记；[冻结服务](../backend/src/main/python/algorithms/election_module/roster_service.py#L47) 锁定选举和配置并发放凭证。两者没有共同的序列化锁；登记请求可能在截止前通过检查，却在冻结后提交，形成获批但无凭证的记录。这是静态并发推导，尚未用交错事务测试复现。建议登记也锁定相同的选举／配置行，在锁内重新检查时间与冻结状态。

* **高优先级：前端类型检查未通过。** `npm run typecheck` 报 **7 处错误**：[登记审核页](../frontend/src/pages/AdminElectionRegistrationsPage.tsx#L48) 使用了 `ElectionDetail` 未声明的 `roster_frozen_at`、`eligible_voter_count`；[管理列表](../frontend/src/pages/AdminElectionsPage.tsx#L331) 使用了 `ElectionSummary` 未声明的 `lifecycle`；[时间线测试](../frontend/src/features/elections/__tests__/ElectionLifecycleTimeline.test.tsx#L33) 给 `LocaleProvider` 传了不存在的 `initialLocale`。应先核对后端响应，再补齐类型或改用实际字段，并修正测试 Provider 用法。

* **中优先级：结果页仍按旧阶段判断关闭。** [结果页](../frontend/src/pages/ElectionResultPage.tsx#L97) 判断 `phase === "CLOSED"`，当前后端结束阶段为 `RESULTS`。因此结束提示和弃权标签可能显示错误。应改为当前阶段枚举，并检查同页所有依赖 `isClosed` 的文案。

* **中优先级：获胜阈值未进入结果响应。** [结果服务](../backend/src/main/python/algorithms/election_module/election_result_service.py#L249) 构造响应时未传 `winning_threshold`，而前端结果页用它显示达到阈值的获胜说明。应从选举配置传入该字段，并验证达到阈值后的结果展示。

* **体验问题：重复登记状态显示不准确。** [登记页](../frontend/src/pages/ElectionRegisterPage.tsx#L68) 将“已登记”冲突直接显示为 `APPROVED`，实际登记也可能待复核或被拒绝。应查询本人登记状态后展示真实结果。

* **体验问题：创建页默认时间有时区偏移。** [创建页](../frontend/src/pages/AdminElectionCreatePage.tsx#L14) 用 UTC 的 `toISOString().slice(0, 16)` 初始化本地日期时间输入；香港时区会偏移 8 小时。应按浏览器本地时间构造输入值，再在提交时转换为 API 所需格式。

## 验证与处理顺序

* 已运行前端 `npm run typecheck`，结果为失败，共 7 处 TypeScript 错误。前次审查运行的 18 个阶段／资格规则单元测试通过；本次未重新运行后端测试，也未运行依赖测试数据库的集成测试。并发问题与草稿结果暴露仍需补充对应的接口和交错事务测试。
* 建议先处理草稿访问控制、投票与阈值事务、名册冻结并发，再恢复前端类型检查；随后修正结果页、阈值提示和两项体验问题。
