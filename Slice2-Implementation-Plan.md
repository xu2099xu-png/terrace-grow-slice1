# Slice 2 Implementation Plan — 葡萄种植流程

> 验收基线：`Slice 2 Acceptance Tests v1.0`（FROZEN BEFORE CODING，2026-08-08）
> Slice 1 状态：CLOSED / ACCEPTED（不得回归）
> 本文档为 schema / API contract / engine / H5 的实现草案，随实现校正。

---

## 0. 范围

只做 AC v1.0 锁定的内容：

- 葡萄作为数据驱动的新作物（DEV_FIXTURE）。
- 从"葡萄方案"到"本轮定植/建立流程完成"的持续种植流程。
- LifecycleTemplate / LifecycleStage / PlantingRecord / PlantingEvent 四个新领域模型。
- `resolveLifecycle()` 纯函数引擎（阶段日期判断，不写死在 Controller/H5）。
- `/plantings/*` API（含幂等、版本 pinning、用户隔离、治理门禁）。
- H5：Home 作物入口（葡萄+蓝莓）、开始种植确认、Current Stage 页面、Mine 我的种植。
- Playwright 2 条 golden path（不再 waiver）。
- Migration：fresh DB + Slice1→Slice2 upgrade 双路径。

**不做**：天气、定位、订阅消息、Push/Reminder、AI、病虫害识别、电商、葡萄次年日历、修剪专家系统、施肥计算器、pH 实测、季节性"现在种什么"、小程序（见 AC §2）。

---

## 1. 新领域模型（Prisma）

> 命名可调整，行为以 AC §4 为准。所有农业事实表带 governance 字段。

### LifecycleTemplate

```
id            String  @id @default(uuid())
cropId        String
varietyId     String?   // null = crop-level（variety 级优先，无则 crop-level）
startMethod   String    // 'nursery_plant' 等
version       Int
active        Boolean   @default(true)
// governance
source        String    @default("manual")
reviewStatus  String    @default("draft")
confidence    Int       @default(1)
stages        LifecycleStage[]
```

- 唯一键：`@@unique([cropId, varietyId, startMethod, version])`
- 优先级：`variety lifecycle template > crop lifecycle template`（AC-07）
- 不含"默认假品种"。

### LifecycleStage

```
id                  String  @id @default(uuid())
lifecycleTemplateId String
stageKey            String
stageName           String
order               Int
startOffset         Int     // days, relative to startDate
endOffset           Int
actions             Json    // string[] action keys
explanation         String?
// governance
source              String  @default("manual")
reviewStatus        String  @default("draft")
confidence          Int     @default(1)
```

- 阶段内容 = 农业事实，必须 governance（AC-03）。
- 唯一键：`@@unique([lifecycleTemplateId, stageKey])`

### PlantingRecord（用户数据，无 governance 过滤）

```
id                 String   @id @default(uuid())
userId             String
terraceId          String
cropId             String
varietyId          String?  // 允许 null（AC-07）
containerTypeId    String
startMethod        String
startDate          DateTime // date at 00:00
status             String   // planned | active | established | lifecycle_unavailable
lifecycleTemplateId String
lifecycleVersion   Int      // PINNED at creation（AC-15）
clientRequestId    String?  // idempotency key（AC-05）
createdAt          DateTime @default(now())
@@unique([userId, clientRequestId])
```

### PlantingEvent（用户数据）

```
id             String   @id @default(uuid())
plantingId     String
actionKey      String
eventType      String   // action_completed 等
happenedAt     DateTime @default(now())
note           String?
clientEventId  String?  // idempotency key（AC-17）
@@unique([plantingId, clientEventId])
```

### 关系

- LifecycleTemplate 1—N LifecycleStage
- PlantingRecord 1—N PlantingEvent
- PlantingRecord 引用 TerraceProfile / Crop / Variety / ContainerType（弱引用或 FK，倾向 FK 以保数据完整性；user/terrace/crop 使用现有表）

---

## 2. API 契约草案

> 前缀统一 `/api`。除公开 catalog 外全部 AuthGuard。用户隔离：planting 必须属于当前用户，否则 403/404（AC-19）。

### 2.1 推荐管线（复用，不重写）

`POST /api/recommendations/perennial`（crop_id 传 grape 即返回葡萄方案）

### 2.2 Planting

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/plantings` | 创建种植（幂等：`client_request_id`） |
| GET | `/api/plantings/:id` | 种植详情 |
| GET | `/api/plantings/:id/now` | 当前阶段（后端唯一事实来源，AC-13） |
| POST | `/api/plantings/:id/events` | 记录事件（幂等：`client_event_id`，AC-16/17） |
| GET | `/api/users/me/plantings` | 我的种植列表 |

### 2.3 POST /api/plantings 请求体

```jsonc
{
  "terrace_id": "…",
  "crop_id": "crop-grape",
  "variety_id": "…" | null,        // null 允许（AC-07）
  "container_type_id": "…",
  "start_method": "nursery_plant",
  "start_date": "2026-01-01",
  "client_request_id": "uuid-ish"  // 幂等
}
```

**服务端约束**（从 PlanCard 安全关联，不接受任意字符串）：
- 当前用户存在 TerraceProfile（terrace_id 属于该用户）。
- 该作物推荐结果必须非 NO_MATCH（AC-06）。
- 若带 variety_id：必须是该作物 approved（或 dev+draft）variety 之一。
- 若 variety_id=null：必须存在 approved crop-level LifecycleTemplate；否则返回 `lifecycle_unavailable`（AC-07/14）。
- start_date 必须合法日期。
- 创建时 pin `lifecycleVersion`（AC-15）。

**响应**：`{ planting: {...}, created: true|false }`（幂等重放时返回同一 planting，`created=false`）。

### 2.4 GET /api/plantings/:id/now 响应（AC-13）

```jsonc
{
  "planting_id": "…",
  "status": "active",                 // planned | active | established | lifecycle_unavailable
  "as_of_date": "2026-01-01",
  "current_stage": { "stage_key": "a", "stage_name": "…", "order": 1,
                     "start_offset": 0, "end_offset": 2,
                     "actions": ["action_fixture_1"], "explanation": "…" } | null,
  "actions": ["action_fixture_1"],
  "completed_action_keys": ["…"],
  "next_stage": { … } | null,
  "lifecycle_template_id": "…",
  "lifecycle_version": 1,
  "warnings": []
}
```

- 无可用 lifecycle → `{ status: 'lifecycle_unavailable', current_stage: null, ... }`，不得空对象假成功（AC-14）。
- H5 不自行算 stage。

### 2.5 POST /api/plantings/:id/events 请求体

```jsonc
{
  "action_key": "action_fixture_1",
  "client_event_id": "uuid-ish",
  "note": "…"  // optional
}
```

- `action_key` 必须在 pinned lifecycle 中存在，否则 400（AC-18）。
- 幂等：相同 `(plantingId, clientEventId)` 只生成一条（AC-17）。
- 用户隔离：非 owner → 403（AC-19）。

---

## 3. Lifecycle Engine（纯函数）

### `resolveLifecycle(template, startDate, asOfDate, events)`

```
输入：
  template  { version, stages: [{stageKey, order, startOffset, endOffset, actions}], … }
  startDate   Date（00:00）
  asOfDate    Date（00:00）
  events      [{ actionKey }]   // 用户已完成操作

行为（AC-08~12）：
  - asOfDate < startDate            → { status: 'planned', current_stage: null }
  - startDate <= asOfDate <= end(StageA)
    → current_stage = A（含最后一天 start+2，AC-09）
  - asOfDate = start+3（StageB 首日）→ current_stage = B（AC-10）
  - asOfDate > finalStage.endOffset  → { status: 'established', current_stage: null }
    （本轮定植流程完成，AC-12）
  - completed_action_keys = events 中属于当前/全部 stages 的 actionKey（去重）

输出：
  { status, current_stage, next_stage, completed_action_keys, warnings }
```

- 日期边界判定在 engine 内，Controller/H5 不重复计算。
- 一天只属于一个 stage（`endOffset` 闭区间，下一 stage 从 `startOffset` 开始且连续）。

---

## 4. 治理门禁（复用 AgriDataService）

- LifecycleTemplate / LifecycleStage 进 `GovernanceService.hasReviewStatus` 列表，加入 `AgriDataService` 查询方法。
- approved LifecycleTemplate + draft LifecycleStage：stage 不泄漏（AC-03）。
- grape 各子实体查询全部走 `AgriDataService`（AC-02/03）。
- seed fixture 仍是 `reviewStatus='draft'`（AC §15）。

---

## 5. H5 草案

- **Home**：作物网格（葡萄、蓝莓），不再是"从蓝莓开始"唯一入口（AC-20）。
- **TerraceWizard**：复用。
- **PerennialPlan**：新增"开始种植"按钮（仅方案有效时显示），点击进入确认页（AC-21）。
- **PlantingStart（确认页）**：作物/品种（或"暂不确定"）/容器/开始日期，确认后 POST /plantings，跳转 `/plantings/:id`（AC-21）。
- **PlantingDetail（Current Stage）**：结构化展示"我种的是什么 / 当前阶段 / 现在要做什么 / 已完成 / 下一阶段 / 进度"，action 完成按钮（AC-22/23）。
- **Mine**：增加"我的种植"列表（葡萄、品种/暂不确定、当前阶段、开始日期），点击进入详情（AC-24）。

---

## 6. 测试计划

### 骨架（AC §13）

- `test:unit`（vitest src/）— lifecycle engine + 既有引擎
- `test:integration`（vitest test/）— API + governance
- `test:e2e`（node test/integration-e2e.js）
- `test:h5`（vitest h5/）
- `test:browser`（Playwright，新增）
- `test:all` — 串全部：test DB reset → migrate → seed → unit → integration → e2e → h5 → browser

### 必须先写的红测（AC §14，12 条）

1. grape 不得读 blueberry rules
2. production draft LifecycleStage 不泄漏
3. 创建 PlantingRecord
4. double submit 幂等（client_request_id）
5. NO_MATCH 不能创建 planting
6. variety=null → crop lifecycle fallback
7. stage 日期边界（AC-08~12）
8. lifecycle v1 pinning（AC-15）
9. action completion 持久化（AC-16）
10. cross-user 403（AC-19）
11. Slice1 DB → Slice2 migrate deploy（S2-AC-26）
12. Playwright happy path（S2-E2E-01）

### Migration 双路径（AC-25/26）

- fresh DB：migrate deploy → 所有表创建 → seed → 测试
- Slice1→Slice2 upgrade：在 Slice1 最终 migration 状态 + 已有 User/TerraceProfile/UserMaterialInventory 的库上执行 Slice2 migrate deploy → 成功、数据保留、新表创建、历史 migration 未修改

---

## 7. 实施顺序（按 AC §实施顺序）

`冻结 AC（已完成）` → `schema/API contract 草案（本文档）` → `测试骨架` → `AC 红测` → `migration` → `Lifecycle pure engine` → `API` → `H5` → `Playwright` → `test:all` → `clean-room + Slice1 upgrade reproduction` → `Delivery Report` → `最终审计`
