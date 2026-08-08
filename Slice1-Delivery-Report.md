# Slice 1 Delivery Report — 露台种植产品（蓝莓纵向切片）

> 报告日期：2026-08-08  
> 基线版本：系统架构设计 v1.4（冻结）  
> 范围：仅 Slice 1（蓝莓），不包含 Slice 2–5（葡萄、无花果、猕猴桃等）。

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

## 6. 已知局限与待办

1. **浏览器自动化**：当前 E2E 使用 `curl` 验证 H5 proxy + API。如需要真正的浏览器自动化（Playwright / Puppeteer），可在后续切片引入相应 skill 和测试套件。
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
