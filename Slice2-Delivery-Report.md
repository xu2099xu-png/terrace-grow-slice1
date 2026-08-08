# Slice 2 Delivery Report — 葡萄种植流程

> 报告日期：2026-08-08
> 验收基线：`Slice 2 Acceptance Tests v1.0`（FROZEN BEFORE CODING）
> Slice 1 状态：CLOSED / ACCEPTED（本轮回归保持）
> 本文档记录实现与验证结果（AC v1.0 §16 Delivery Gate）。

---

## 1. 范围

按 AC v1.0 完成葡萄数据驱动作物 + "从葡萄方案到本轮定植完成"的持续种植流程：

- 葡萄 DEV_FIXTURE（crop/varieties/traits/pollination/envReq/containerReq/materialRules/soilTemplate/lifecycle）。
- LifecycleTemplate / LifecycleStage / PlantingRecord / PlantingEvent 四个新模型。
- `resolveLifecycle()` 纯函数引擎（阶段日期边界，S2-AC-08..12）。
- `/api/plantings/*` API（幂等、版本 pinning、用户隔离、治理门禁）。
- H5：Home 作物入口（葡萄+蓝莓）、开始种植确认页、Current Stage 页、Mine 我的种植。
- Playwright 2 条 golden path（不再 waiver）。
- Migration：fresh DB + Slice1→Slice2 upgrade 双路径验证。

**未做**（AC §2 排除项）：天气、定位、订阅消息、Push/Reminder、AI、病虫害识别、电商、次年日历、修剪专家系统、施肥计算器、pH 实测、季节性推荐、小程序。

---

## 2. 领域模型

| 模型 | 说明 | 治理 |
|---|---|---|
| LifecycleTemplate | crop 或 variety 级流程模板，`version`+`active`，variety 级优先 | ✅ |
| LifecycleStage | stageKey/name/order/startOffset/endOffset/actions/explanation | ✅ |
| PlantingRecord | 用户数据；保存 `lifecycleTemplateId` + **pinned `lifecycleVersion`** | ❌（用户数据） |
| PlantingEvent | 用户完成操作；`clientEventId` 幂等 | ❌（用户数据） |

优先级：`variety lifecycle template > crop lifecycle template`；无可用模板 → `lifecycle_unavailable`（不伪造流程）。

---

## 3. API 契约

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/plantings` | 创建种植（幂等 `client_request_id`；NO_MATCH 拦截；variety 校验；lifecycle pin） |
| GET | `/api/plantings/:id` | 详情（owner-only，否则 404） |
| GET | `/api/plantings/:id/now` | 当前阶段（后端唯一事实来源） |
| POST | `/api/plantings/:id/events` | 完成操作（幂等 `client_event_id`；未知 action → 400） |
| GET | `/api/users/me/plantings` | 我的种植 |

`now` 响应字段：`planting_id / status / as_of_date / current_stage / actions / completed_action_keys / next_stage / lifecycle_template_id / lifecycle_version / warnings`（stage 字段为 snake_case，符合 S2-AC-13）。

---

## 4. 验证结果（clean-room 复现）

环境：macOS / Node v22.22.2 / npm 10.9.7 / Docker PostgreSQL 16（5433）。

```
npm ci ×3                                  → ok
npm --prefix server run db:test:setup      → drop→create→migrate deploy(2 migrations)→seed 成功

npm run test:all
  ├─ test:unit        31 passed
  │    soil-engine 9 + recommend-engine 15 + lifecycle-engine 7
  ├─ test:integration 37 passed
  │    integration.spec.ts 16 + governance.spec.ts 10 + plantings.spec.ts 11
  ├─ test:e2e         "All integration tests passed!"
  ├─ test:h5          2 passed（PerennialPlan.vue NO_MATCH / MATCH）
  └─ test:browser     2 passed（Playwright S2-E2E-01 happy path, S2-E2E-02 NO_MATCH）

npm --prefix server run build              → tsc, 0 errors
npm --prefix h5 run build                  → ok

fresh DB migrate deploy                    → 30 tables（2 migrations）
Slice1→Slice2 upgrade DB migrate deploy    → 26→30 tables，用户数据保留
```

### AC 覆盖

| AC | 验证 |
|----|------|
| S2-AC-01 Slice1 回归 | `integration.spec.ts` 16 例全部通过（蓝莓推荐/日照四态/rainExposed/配土/容器/授粉/替代/治理/inventory/migration） |
| S2-AC-02 数据驱动葡萄 | `crop-grape` 推荐只含 var-grape-*；静态检查 `server/src` 无 `crop-grape`/`crop-blueberry` 硬编码 |
| S2-AC-03 葡萄治理门禁 | `governance.spec.ts` AC-03：approved LifecycleTemplate + draft LifecycleStage → 不泄漏，`lifecycle_unavailable` |
| S2-AC-04 创建 PlantingRecord | `plantings.spec.ts` AC-04/04b：字段完整（含 lifecycle pin）、variety 级优先 |
| S2-AC-05 幂等创建 | AC-05：同 `client_request_id` 两次请求只 1 条记录 |
| S2-AC-06 NO_MATCH 拦截 | AC-06：POST 400；H5 无"开始种植"按钮（E2E-02） |
| S2-AC-07 variety=null | AC-07：crop-level lifecycle fallback，不伪造品种 |
| S2-AC-08..12 阶段边界 | `lifecycle-engine.spec.ts` 7 例（start/末天/次日/开始前/完成/幂等/空模板） |
| S2-AC-13 now 契约 | AC-13：结构化字段 + snake_case stage |
| S2-AC-14 无 lifecycle 安全失败 | `lifecycle_unavailable`，不空对象假成功 |
| S2-AC-15 版本 pinning | AC-15：v2 升级后老 planting 仍 v1（stage_a），新 planting 用 v2 |
| S2-AC-16/17 事件持久化+幂等 | AC-16/17：完成 action → completed_action_keys，刷新保留；幂等 |
| S2-AC-18 伪造 action 400 | AC-18：`made_up_action` → 400 |
| S2-AC-19 用户隔离 | AC-19：跨用户 GET/now/events 均 404 |
| S2-AC-20 葡萄入口 | Home 作物网格（葡萄+蓝莓），蓝莓入口保留 |
| S2-AC-21 开始种植确认 | PlantingStart 确认作物/品种/容器/日期 |
| S2-AC-22 Current Stage | PlantingDetail 结构化展示（阶段/操作/已完成/下一步/进度） |
| S2-AC-23 完成即时反馈 | E2E-01：完成 action → 刷新后仍 completed |
| S2-AC-24 我的种植 | Mine 列表（葡萄/品种/阶段/开始日期） |
| S2-E2E-01/02 | Playwright 2 条真实浏览器路径通过 |
| S2-AC-25/26 migration | fresh DB + Slice1→Slice2 upgrade 双路径通过，数据保留 |

---

## 5. 关键修复（实现中发现）

1. **Vant 组件从未注册**（Slice 1 遗留 P0 UI bug）：`h5/src/main.ts` 缺 `app.use(Vant)`，导致所有 Vant 组件（van-field/van-button 等）只渲染文本不渲染真实 DOM 且交互失效。修复后 `van-field` 正常渲染、点击事件生效。这是 Slice 1 在浏览器 E2E 缺失时未被发现的问题，本轮 Playwright 强制暴露并修复。
2. **TerraceWizard step=1 的 nextStep 无递增分支**（Slice 1 遗留）：第 1 步点"下一步"不会进入第 2 步。修复 `nextStep` 增加 `step 1→2`。
3. **now 契约字段命名**：`resolveLifecycle` 返回 camelCase，按 S2-AC-13 契约映射为 snake_case。
4. **lifecycle 最新版本选择**：`getLifecycleTemplate` 增加 `orderBy: { version: 'desc' }`，新 planting 选最高 active 版本（配合 pinning）。
5. **container 契约**：POST /plantings 不盲信客户端 `container_type_id`，校验推荐引擎实际接受的 `selected_type_id`，不匹配 400；写入 `PlantingRecord` 使用服务端确认值。
6. **并发幂等**：`createPlanting` / `completeAction` 捕获 Prisma `P2002` 唯一冲突后重读，解决并发竞态（`Promise.all` 同 `client_request_id` / `client_event_id` 双发）。
7. **action 只能完成当前 stage**：`completeAction` 通过 `resolveLifecycle` 获取 `current_stage`，仅允许当前 stage 的 action；提前完成未来 stage 返回 400。
8. **Mine 后端化**：GET `/users/me/plantings` 返回服务端推导的 summary（`crop_name` / `variety_name` / `current_stage_name` / `status`），前端删除 `cropId === 'crop-grape' ? '葡萄' : '蓝莓'` 硬编码。
9. **PlantingStart 数据来自后端**：确认页显示真实 crop / variety / container 名称，API 加载失败时禁止提交（`loadError` + `canSubmit`）。
10. **LifecycleTemplate NULLS NOT DISTINCT**：PostgreSQL 默认 unique index 对 `NULL` 视为不同值，导致 crop-level 同 version 允许多条。自定义 migration `20260808130300_slice2_lifecycle_nulls_not_distinct` 添加 `NULLS NOT DISTINCT` 约束。
11. **Asia/Shanghai calendar day**：`lifecycle-engine.dayDiff` 统一按 `Asia/Shanghai` 日历日计算（`Intl.DateTimeFormat`），避免 UTC 跨天偏差导致中国用户阶段切换晚一天。
12. **Playwright refresh 断言**：E2E-01 改用确定性 fixture action 中文标签定位，断言 reload 后 `已完成` 状态仍在，去掉 `if (button exists)` 弱断言。

---

## 6. 已知局限 / 备注

- **浏览器 E2E 不再 waiver**：Playwright 2 条 golden path 已通过（`e2e/planting.spec.ts`）。
- **Playwright 服务编排**：`scripts/browser-e2e-server.sh` 单进程拉起后端（dist）+ H5 dev；Playwright webServer 单入口探测后端 API（本机 IPv4 127.0.0.1）。
- **lifecycle stage offsets 为测试 fixture**（AC §15）：`0-2 / 3-5` 等仅用于日期边界验证，非真实农业知识；所有数据 `reviewStatus='draft'`，production 不读取。
- **Delivery Gate 检查**：仓库不含 `.env`（gitignore）、`node_modules`、`dist`、`.DS_Store`；无本机绝对路径泄漏（提交内容见 §7）。

---

## 7. 交付 commit

本报告 §1–§6 对应 git commit SHA：**`3be043ed6536f0c2bb6eb81afd26b0277c7b1f7b`**（`Slice 2: grape planting flow — ...`，2026-08-08）。

## 8. 审计收口修复（2026-08-08 第二轮）

针对 8 项阻断契约的修复对应 commit SHA：**见最终 main HEAD**（提交信息前缀 `Slice 2: closure — ...`）。

主要修复：
- container 契约、并发幂等、当前 stage action 限制、Mine 后端化、PlantingStart 真实数据、NULLS NOT DISTINCT、Asia/Shanghai 日历日、Playwright 确定性断言。
- 新增 `test/slice2-gate.spec.ts` 7 项自动化验证，覆盖上述全部修复点。
- 最终 `test:all` 全绿（unit 33 + integration 44 + e2e + h5 2 + browser 2）。
- fresh DB + Slice1→Slice2 upgrade 双路径仍通过。

---