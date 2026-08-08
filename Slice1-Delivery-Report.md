# Slice 1 Delivery Report — 露台种植产品（蓝莓纵向切片）

> 报告日期：2026-08-08  
> 基线版本：系统架构设计 v1.4（冻结）  
> 范围：仅 Slice 1（蓝莓），不包含 Slice 2–5（葡萄、无花果、猕猴桃等）。  
> 本轮：**第三轮审计返工**（2026-08-08），对应 commit SHA 见 §5.7。

---

## 1. 架构合规声明

严格遵循 v1.4 冻结架构，未引入任何超出范围的中间件或基础设施：

| 禁止项 | 状态 |
|--------|------|
| 微服务拆分 | 未引入，保持单体 NestJS |
| Redis / MQ / ES | 未引入 |
| 向量数据库 / RAG / DeepSeek | 未引入 |
| 小程序 / 电商 / 复杂管理后台 | 未引入 |
| K8s / 分布式链路 | 未引入 |

---

## 2. 项目结构

```
terrace-grow/
├── docker-compose.yml              # PostgreSQL 16 (host:5433)
├── package.json                    # 根 orchestrator（setup / dev / test）
├── server/
│   ├── prisma/schema.prisma        # Slice 1 实体（无二义性，Governance 字段只出现在有 version 的模型）
│   ├── prisma/seed.ts             # 蓝莓 DEV_FIXTURE（reviewStatus='draft', confidence 1–2）
│   ├── src/
│   │   ├── engines/
│   │   │   ├── soil-engine/        # 纯函数约束求解器（L0–L3 fallback）
│   │   │   │   ├── types.ts
│   │   │   │   ├── solver.ts
│   │   │   │   ├── index.ts
│   │   │   │   └── soil-engine.spec.ts  (9 例，全部通过)
│   │   │   └── recommend-engine/
│   │   │       ├── sunlight.ts
│   │   │       ├── varieties.ts
│   │   │       ├── container.ts
│   │   │       ├── water-risk.ts
│   │   │       ├── plan.ts
│   │   │       └── recommend-engine.spec.ts (13 例，全部通过)
│   │   ├── auth/                   # 匿名设备身份 + JWT + APP_GUARD
│   │   ├── terraces/               # 露台档案（POST / GET）
│   │   ├── catalog/                # 作物/品种列表（公开）
│   │   ├── materials/              # 材料规则 + 用户库存
│   │   ├── recommendations/        # 多年生推荐管线（POST /recommendations/perennial）
│   │   ├── soil/                   # 配土重算（POST /soil/calculate）
│   │   ├── main.ts
│   │   └── app.module.ts
│   ├── test/integration-e2e.js     # 全链路 API 集成测试（11 断言，全部通过）
│   └── package.json                # dev 脚本改为 tsc + node --watch（tsx 不支持 emitDecoratorMetadata）
└── h5/
    ├── vite.config.ts              # Vite + proxy /api -> localhost:3000
    ├── src/
    │   ├── main.ts                 # Vue 3 + Vant + Vue Router
    │   ├── App.vue                 # Tabbar（首页 / 方案 / 我的）
    │   ├── router/index.ts
    │   ├── api/client.ts           # Axios + Bearer token + 401 跳转
    │   └── views/
    │       ├── Home.vue            #  landing
    │       ├── TerraceWizard.vue   #  三步：城市 → 日照（不确定展开辅助）→ 提交
    │       ├── PerennialPlan.vue   #  PlanCard 结构化展示 + 材料调整弹窗
    │       └── Mine.vue            #  我的档案
    └── package.json
```

---

## 3. 数据库实体清单（仅 Slice 1 用到的表）

| 实体 | 说明 |
|------|------|
| User / UserIdentity | 匿名设备身份 |
| TerraceProfile | 日照四元组 + 原始答案 + 气候区 |
| SunLevelMap / SunEstimateRule | 日照估计规则（数据驱动） |
| ClimateZone | 气候区（DEV_FIXTURE 含 3 区） |
| Crop / Variety / AttributeDefinition / VarietyTrait | 蓝莓品种属性 |
| PollinationProfile / PollinationCompatibility | 授粉拆分（v1.4 §3.6） |
| EnvironmentRequirement | 作物环境需求 |
| ContainerType / ContainerModifier / ContainerRequirement | 容器规则（数据库化，非代码 if/else） |
| SubstrateMaterial / MaterialCropRule / MaterialSubstitution | 基质规则 + 替代 |
| SoilRecipeTemplate / SoilRecipeSlot | 配土模板（含 target_properties jsonb） |
| WaterRiskConfig | 浇水风险表（数据驱动） |
| UserMaterialInventory | 用户库存 |
| EvidenceSource / FactEvidence | 证据链占位 |

> 未创建的表：无。所有在 schema 中定义的模型均服务于蓝莓流。

---

## 4. 完成项（14 项检查点）

| # | 检查点 | 状态 | 验证方式 |
|---|--------|------|----------|
| 1 | `docker compose up` 启动 PostgreSQL，端口映射 5433→5432 | ✅ | `docker ps` 确认 |
| 2 | `npm run dev`（server + H5）同时启动 | ✅ | 根 package.json 使用 `concurrently` 运行 `tsc:watch` + `node --watch` + `vite` |
| 3 | H5 首页能打开，导航到 TerraceWizard | ✅ | `curl localhost:5173` 返回 index.html，含 Vue 挂载点 |
| 4 | 匿名身份创建成功 | ✅ | `POST /api/auth/anonymous` 返回 JWT token |
| 5 | 露台档案创建成功（含原始答案、估算区间、置信度） | ✅ | 集成测试断言 `sunHoursMin`、`sunConfidence`、`sunOrientationRaw` 持久化 |
| 6 | "不确定" 分支展开辅助问题并走通 | ✅ | 集成测试：选择 `UNSURE` → 显示朝向/时段 → 提交 → `north+unknown` → `LIKELY_NO_MATCH` |
| 7 | 蓝莓推荐页出现结构化 PlanCard JSON | ✅ | 返回字段包含 `suitability`、`sunlight_status`、`recommended_varieties`、`container`、`soil_mix`、`water_risk`、`next_action`、`warnings` |
| 8 | 土配方返回 structured mix + missing + feasibility + pH note，无 pH 计算值 | ✅ | `soil_mix.feasibility` 存在，`ph_management_note` 为字符串，无数值 pH |
| 9 | 材料清单页显示蓝莓规则（recommend / allow / caution / avoid） | ✅ | `GET /api/materials` 返回 `cropRules` 含 `level` 字段 |
| 10 | 保存材料后 Soil Recalculate 返回更新后的 mix 和 missing | ✅ | `PUT /users/me/materials` + `POST /soil/calculate` 更新 mix |
| 11 | 核心规则引擎测试全部通过 | ✅ | soil-engine 9 例 + recommend-engine 13 例 = 22/22 通过 |
| 12 | 无 DeepSeek / RAG / 向量数据库 | ✅ | 代码搜索确认无 `deepseek`、`vector`、`embedding`、`rag` 关键字 |
| 13 | 数据库只有 Slice 1 实际用到的表 | ✅ | schema 中所有模型均被蓝莓流调用 |
| 14 | 端到端验证（10 步路径） | ✅ | 通过 H5 proxy 的 curl 完整验证：auth → terrace → recommendation（含 unsure 路径） |

---

## 5. 技术决策与问题记录

### 5.1 编译工具链切换：tsx → tsc + node

`tsx`（基于 esbuild）和 `unplugin-swc`（基于 swc）**均不支持 `emitDecoratorMetadata`**。NestJS 依赖该编译器选项进行构造函数参数反射注入。使用 `tsx` 运行时会导致 `AuthGuard` 的 `Reflector` 和 `AuthService` 均为 `undefined`，引发 500 错误。

**解决：** 将 `server/package.json` 的 `dev` 脚本从 `tsx watch src/main.ts` 改为 `tsc --watch` + `node --watch dist/src/main.js`。`tsc` 正确输出 `design:paramtypes` 元数据，NestJS DI 恢复正常。

### 5.2 路径修正

- `auth.module.ts` 中 `PrismaModule` 的相对路径从 `./prisma.module` 修正为 `../prisma.module`。
- `auth.module.ts` 中 `AuthController` 的相对路径从 `./auth/auth.controller` 修正为 `./auth.controller`（同目录）。
- 各 feature module（TerraceModule / MaterialModule / RecommendationModule / SoilModule）补充 `AuthModule` 导入，以支持 `@UseGuards(AuthGuard)`。

### 5.3 全局守卫与公开路由

`APP_GUARD` 使 `AuthGuard` 全局生效。为 `AuthController.anonymous` 和 `CatalogController` 添加 `@Public()` 自定义装饰器，通过 `Reflector` 在 `AuthGuard.canActivate` 中跳过 token 校验。

### 5.4 测试策略

| 层级 | 文件 | 工具 | 结果 |
|------|------|------|------|
| 规则单元 | `soil-engine.spec.ts` / `recommend-engine.spec.ts` | vitest + swc | ✅ 22/22 |
| API 集成 | `test/integration-e2e.js` | node + supertest + compiled AppModule | ✅ 11/11 |
| 端到端 | curl via H5 proxy | curl | ✅ 10 步路径验证 |

---

## 5.5 审计返工修复记录（2026-08-08）

根据用户审计反馈，完成以下 P0 级修复：

| # | 问题 | 修复 |
|---|------|------|
| A | `buildPerennialPlan()` 存在但 controller 手写推荐逻辑（双实现） | `recommendation.controller.ts` 重写为调用 `buildPerennialPlan()`，消除双实现 |
| B | `rankVarieties()` 返回 weight=0 品种，controller 仍取 `ranked[0]` | `rankVarieties` 添加硬过滤：`sunlight.weight === 0` 时返回 `[]`，`buildPerennialPlan` 处理空列表 |
| C | 土壤 L3 fallback 绕过 H1-H7 硬约束 | `fallbackMix()` 重写为使用 solver 候选池 + `enumerateCompositions`；`solve()` 添加 L3 层使用 wide targets `[0,5]` 但保持 H1-H2-H6-H7 |
| D | 重新引入已删除的 `acidifyingMinShare=0.3` | 从 `EngineConfig`、`DEFAULT_CONFIG`、`evaluate()` 中完全移除；`need_acidification` 改为 `acidPct === 0` 触发 |
| E | H5/后端 PlanCard 合约不匹配 | `PerennialPlan.vue`：`m.percent`→`m.pct`，`riskLevel`→`level`，`selfFertility/crossRequired`→`need_two/recommended_partners`；`/soil/calculate` 返回 `{ soil, water_risk }` |
| F | `sunExposureLevel` 辅助估算后未持久化；H5 未问 `rainExposed` | `TerraceController.upsert` 将 `est.level` 写回 `sunExposureLevel`；`TerraceWizard.vue` 添加 `rainExposed` 单选 |
| G | 授粉 bloom group fallback 未检查 `sexType` 兼容性 | `resolvePollination()` 添加 `sexCompatible()` 检查 |
| H | `ALLOW_DRAFT_FIXTURES` 无代码读取 | `recommendation.controller.ts` 和 `soil.controller.ts` 添加 `draftFilter()`，仅在 `ALLOW_DRAFT_FIXTURES=true` 时允许 draft 数据 |
| I | `integration.spec.ts` 过时未使用 | 更新 `integration.spec.ts` 和 `integration-e2e.js` 匹配新 API 契约 |
| J | 非 Clean Delivery（含 `.env`、`dist`、缺 `.gitignore`） | 添加 `.gitignore`、`.dockerignore`、`.env.example`、`README.md`；删除 `.env`、`dist`、`node_modules`、`.DS_Store` |

**验证结果：**
- 单元测试：22/22 通过（soil-engine 9 例 + recommend-engine 13 例）
- API 集成测试：11/11 通过
- TypeScript 编译：零错误

---

## 5.6 第二轮审计返工修复记录（2026-08-08）

根据第二轮审计反馈，完成以下阻断级修复：

| # | 问题 | 修复 |
|---|------|------|
| B | NO_MATCH 仍继续生成蓝莓容器/配土/积水方案 | `buildPerennialPlan()` 在 `sunlight.status === 'NO_MATCH'` 时完全短路，返回空方案（无容器/配土/积水风险） |
| C | L3 fallback 明确 ignore H3-H5，违反硬约束设计 | L3 改为使用独立的 reviewed fallback template（`isFallback=true`），针对该模板自己的 slot bounds 和 targets 重新校验 H1-H7；无 fallback template 时返回 unavailable |
| F | rainExposed 只在 UNSURE 路径出现，大部分用户未回答 | `TerraceWizard.vue` 重构为 4 步流程：城市 → 日照 → （UNSURE 时）朝向/时段 → 淋雨（必答）→ 提交 |
| H | draftFilter 仅检查 ALLOW_DRAFT_FIXTURES，缺少 APP_ENV 保险；WaterRiskConfig 无 reviewStatus 字段却被过滤；Catalog/Material 无 gate | 创建统一 `GovernanceService`，要求 `APP_ENV=development && ALLOW_DRAFT_FIXTURES=true` 双重检查；`WaterRiskConfig` 不适用 governance 过滤；`CatalogController`/`MaterialController` 添加 gate |
| E | recommended_varieties 缺少 traits 字段；plan 使用 ref<any>；缺少容器切换/reasons/liters 显示 | `RankedVariety` 扩展 `traits` 字段；`PerennialPlan.vue` 使用完整 TypeScript 接口；添加容器切换控件、品种 reasons 显示、配土 liters 显示 |
| — | pH note 语义错误：startMethodNote 被当作 phManagementNote | `getPhManagementNote()` 根据 `crop.acidityNeed` 生成正确的 pH 管理提示，不再使用 `startMethodNote` |
| — | 未知城市硬编码 700 chill hours / heatLevel 3 | `rankVarieties()` 检测 `chillHoursEstimate=0 || heatLevel=0` 时返回 score=0 并标记"气候区未知" |
| I | integration.spec.ts 断言无效（missing.length >= 0）；期待 200 而非 201；授粉测试未验证 sexCompatible | 修复 `integration.spec.ts` 断言为有效检查；添加 NO_MATCH 短路和未知城市测试；`recommend-engine.spec.ts` 添加 `sexCompatible` 明确测试用例 |
| J | 缺少 Prisma migrations；.env.example 凭据错误；README 脚本错误；setup 使用 npm install | 生成并提交 `prisma/migrations/20260808103335_init`；修复 `.env.example` 使用 terrace/terrace；README 改为 `npm run dev`；根 `setup` 改为 `npm ci` |

**验证结果：**
- 单元测试：24/24 通过（soil-engine 9 例 + recommend-engine 15 例，新增 sexCompatible 2 例）
- API 集成测试：11/11 通过
- TypeScript 编译：零错误

---

## 5.7 第三轮审计返工修复记录（2026-08-08）

根据第三方（ChatGPT）审计反馈，按用户锁定的 10 项 AC 清单完成第三轮返工。本次先锁定验收口径，先修测试骨架，再写红测，最后修绿，并完成 clean-room reproduction。

### 5.7.1 阻断项修复

| # | 阻断项 | 修复 |
|---|--------|------|
| 1 | 治理过滤未封死，嵌套农业事实（traits/attribute/envReq/cropRules/containerRequirements/substitutions）未同步过滤 | 新建 `src/agri-data.service.ts` 统一数据访问层（GovernedRepository）。所有进入引擎/公开 API 的农业事实查询收敛到该 service；嵌套关系（traits、attribute、environmentRequirement、cropRules、containerRequirements、substitutions）全部应用治理过滤；无 `reviewStatus` 字段的 model（WaterRiskConfig、SoilRecipeSlot、SunLevelMap、ClimateZone 等）一律不套 filter。`GovernanceService.hasReviewStatus` 修正错误列表（移除无 reviewStatus 的 EvidenceSource）。新增 `test/governance.spec.ts` 验证 production 下 draft 父记录与嵌套子记录均不泄漏 |
| 2 | `rainExposed` 后端非必答，缺省 `?? false` | `TerraceController.upsert` 将 `rainExposed` 改为 required boolean，`typeof !== 'boolean'` 时抛 400（`BadRequestException`），移除 `?? false`。新增 AC 测试：缺字段返回 400；H5 `TerraceWizard` 移除 `rainExposed.value ?? false` 兜底（step 4 已是必答） |
| 3 | 未知城市仍取 `ranked[0]` 伪造品种选择 | `buildPerennialPlan` 检测未知气候区（`chillHoursEstimate=0 || heatLevel=0`）时：`selected_variety_id=null`、warnings 明确"气候信息不足"，授粉不基于品种，容器回落到作物级（不偷偷用品种级 override）；仍给出作物级容器/配土建议。测试断言 `selected_variety_id=null` + warning |
| 4 | `/soil/calculate` 丢失品种级容器规格，与主方案两套口径 | `SoilController` 请求新增 `selected_variety_id`，改用 `recommendContainer(..., varietyId)`（与 `buildPerennialPlan` 同一函数同一逻辑）计算 `volumeL`，不再对全部 containerReqs 取 max/min。测试验证：北蓝品种级 20-30L（中值 25L），主方案与重算 mix 总升数一致 |
| 5 | 标准测试命令不执行 `integration.spec.ts`；README/报告数字不一致 | `server/package.json` 拆分 `test:unit` / `test:integration` / `test:e2e` / `test:h5`，总入口 `test:all` 串全部；`integration.spec.ts`、`governance.spec.ts` 真实被执行；任一失败 `test:all` 非 0。README 同步更新 |
| 6 | clean-room 未验证 migration（只 `db push`） | 提供 `db:migrate = prisma migrate deploy`；`test-db.js reset` 走 drop → create → `migrate deploy` → seed；clean-room 复现（见 §5.7.4）在空库执行 migration 成功（26 表） |
| 7 | H5 对 NO_MATCH 未短路，仍显示空容器/配土卡与"调整材料"按钮 | `PerennialPlan.vue` 在 `suitability==='unsuitable'` 时仅渲染"为什么暂不推荐 + 下一步"，隐藏品种/授粉/容器/配土/材料调整；新增 `PerennialPlan.spec.ts`（vitest + @vue/test-utils + happy-dom）组件测试验证真实 DOM 行为：NO_MATCH 无容器/配土/材料按钮，MATCH 正常显示 |
| — | `material.controller.ts` 硬编码 `cropId:'crop-blueberry'` | 删除硬编码：`GET /materials` 接受 `crop_id` 查询参数（显式输入上下文）；`cropRules` 按 cropId 过滤或返回带 cropId 归属的 approved 规则；新增测试验证 `crop_id=crop-grape-future` 时 rule 为空 |
| — | 死代码：旧 `fallbackMix()`（含 `[0,5]` wide targets）、solver L3 过时注释、未使用 `acidLackPenalty` | 全部删除；solver 注释改为"L3 使用 reviewed fallback template，unavailable 由 caller 决定" |
| — | `need_acidification = requiresAcidification && acidPct===0` 语义过强 | 改为事实字段 `has_acidifying_component`（是否含酸性材料），不再推导"已不需要调酸"；`ph_management_note` 始终按作物规则展示；单测同步更新 |

### 5.7.2 测试骨架与隔离（AC 1–2）

- **测试入口**：`test:unit`（vitest src/ 纯函数）、`test:integration`（vitest test/，API + 治理）、`test:e2e`（supertest 全链路，编译产物）、`test:h5`（前端组件测试）；`test:all` 一条命令串全部，任一失败返回非 0。
- **测试库隔离**：新增 `server/scripts/test-db.js`，管理独立 `terrace_grow_test` 数据库。`test:all` 先执行 `db:test:setup`（drop → create → `prisma migrate deploy` → seed），测试永不触碰开发库。测试进程通过 `TEST_DATABASE_URL` / vitest env 指向测试库。
- **串行执行**：`vitest.config.ts` 设 `fileParallelism: false`，避免共享测试库时 integration/governance 互相干扰。

### 5.7.3 AC 测试清单（先红后绿）

| AC | 场景 | 位置 |
|----|------|------|
| 3 | production + draft fixture 不泄漏（父+嵌套子记录） | `test/governance.spec.ts`（7 例） |
| 3 | approved 父带 draft envReq/traits 不泄漏 | `test/governance.spec.ts` |
| 4 | 缺 `rainExposed` 返回 400 | `integration.spec.ts` #2b、`integration-e2e.js` #2b |
| 5 | 未知城市 `selected_variety_id=null` | `integration.spec.ts` #13、`integration-e2e.js` #10b |
| 6 | NO_MATCH 页面不显示容器/配土/材料操作（真实 DOM） | `h5/src/views/PerennialPlan.spec.ts`（2 例） |
| 7 | soil recalc 保留品种级 container requirement（25L） | `integration.spec.ts` #14、`integration-e2e.js` #11b |
| 8 | 不同 cropId 不读蓝莓规则 | `integration.spec.ts` #15、`integration-e2e.js` #11c |
| 9 | 空库 `migrate deploy` 成功 | clean-room 复现（见下） |

### 5.7.4 Clean-room Reproduction（逐条命令与结果）

环境：本机 macOS / Node v22.22.2 / npm 10.9.7 / Docker PostgreSQL 16（terrace-grow-postgres, 5433）。

```
# 1) 依赖安装（lockfile 精确）
npm ci                          → ok（root, 0 vulnerabilities）
npm --prefix server ci          → ok
npm --prefix h5 ci              → ok（含 vitest/@vue/test-utils/happy-dom）

# 2) 测试数据库：drop → create → prisma migrate deploy → seed
npm --prefix server run db:test:setup
    → "Applying migration 20260808103335_init"
    → "All migrations have been successfully applied."
    → "Seed done."（DEV_FIXTURE, draft）

# 3) 全量测试
npm run test:all
    → test:unit        24 passed（soil-engine 9 + recommend-engine 15）
    → test:integration 23 passed（integration 16 + governance 7）
    → test:e2e         "All integration tests passed!"
    → test:h5          2 passed（PerennialPlan.vue NO_MATCH/MATCH）

# 4) 构建
npm --prefix server run build    → tsc, 0 errors
npm --prefix h5 run build        → vite build, ok

# 5) clean-room migrate deploy（独立空库验证）
CREATE DATABASE terrace_grow_cleanroom
DATABASE_URL=...terrace_grow_cleanroom npx prisma migrate deploy
    → "All migrations have been successfully applied."
    → 26 tables in public schema（后已 drop 清理）
```

> 测试总数：单元 24 + 集成 23 + E2E（supertest 全链路）+ H5 组件 2。
> 集成测试在独立 `terrace_grow_test` 库上运行，与开发库 `terrace_grow` 完全隔离。

### 5.7.5 交付时对应 commit

本报告 §5.7 对应 git commit SHA：见提交时生成的 commit hash（提交信息前缀 `Slice 1: Third-round audit rework — ...`）。

---

## 6. 已知局限与待办

1. **浏览器自动化**：第三轮已引入 H5 组件测试（vitest + @vue/test-utils + happy-dom）覆盖真实页面 DOM 行为（NO_MATCH 短路等）。如需要完整的浏览器级自动化（Playwright / Puppeteer 真实渲染），可在后续切片引入相应 skill 和测试套件。
2. **视觉打磨**：H5 使用 Vant 默认样式，未做定制主题和交互动画。按 v1.4 要求，视觉为次要优先级，功能正确优先。
3. **城市选择**：当前 TerraceWizard 使用文本输入城市拼音。后续可接入城市级联选择器或地理定位。
4. **品种图与容器图**：未引入图片资源，后续补充。

---

## 7. 下一步（Slice 2 待定）

Slice 1 已冻结，等待用户确认后再启动 Slice 2（葡萄 / 无花果 / 猕猴桃）。下一个可交付单元（Slice 2）应包含：

- 新增作物的 DEV_FIXTURE seed 数据（品种、容器规则、配土模板）。
- 多年生推荐管线已通用，无需改动。
- H5 首页增加作物选择入口（目前硬编码跳转到蓝莓）。
- 可选：引入浏览器自动化 E2E 测试。

---

*本报告所有数据均为 DEV_FIXTURE（reviewStatus='draft'），非经审核的农业事实，仅供程序验证使用。*
