# Slice 3 Implementation Plan — 「这个季节种什么」

> 验收基线：`Slice3-Acceptance-Criteria-v1.0.md`（v1.1 FROZEN CANDIDATE，待用户冻结）
> Slice 1 = CLOSED，Slice 2 = PASS / FROZEN（基线 `5affe3a2`）
> 本文档为 schema / engine / API / H5 / 测试的实施草案。**未确认前不写业务代码。**

---

## 0. 范围

只做 AC v1.1 锁定的内容：

- 季节推荐模型验证（番茄/胡萝卜/花生/生菜，DEV_FIXTURE）。
- 完整链路：**定位/选城市 → city_code → climate_zone → weather → 推荐**。
- `LocationResolver` 薄接口 + `GET /api/location/supported-cities`（数据驱动城市选择）。
- `WeatherProvider` 抽象 + `weather_data_status` 三态 + `weather_assessment` 独立。
- 「近 3 天天气」聚合纯函数（温度 / frost 规则冻结）。
- city → climate_zone 数据驱动（复用 `ClimateZone.cityCodes` Json）。
- `available_start_methods` 语义（either 拆分为具体方式查询）。
- SowingCalendar 多窗口（0–N）+ startMethod 禁 `either`。
- optional auth（有 JWT 增强 TerraceProfile，复用已冻结 sunlight engine）。
- 结构化输出 + 完整候选集 + deterministic 排序。
- 天气降级 E2E + 直播型作物 E2E。

**不做**：AI/DeepSeek、天气长期管理、每日动态指导、推送、小程序、电商、新提醒系统、50+ 作物、复杂定位基础设施、天气/定位数据库表、自创季节性日照算法、Slice 4。

---

## 1. schema 是否需要变化

**需要新增 1 张表：`SowingCalendar`**（纯新增，不修改历史表），**带治理字段 + 真实关系约束 + 多窗口**（AC-25/AC-27）。

```prisma
model SowingCalendar {
  id              String   @id @default(uuid())

  cropId          String
  climateZoneCode String            // FK → ClimateZone.code（非自由字符串）

  startMethod     String            // 只允许 nursery_plant | direct_seed（AC-27，schema invariant）
  windowKey       String            // spring_1 / autumn_1 等稳定标识（0–N 窗口）
  windowStart     String            // 'MM-DD'，可跨年（如 '11-01'）
  windowEnd       String            // 'MM-DD'（含端点）

  // 治理字段（统一方案，AC-25）
  source          String   @default("manual")
  reviewStatus    String   @default("draft")
  confidence      Int      @default(1)
  version         Int      @default(1)
  updatedAt       DateTime @updatedAt

  crop        Crop        @relation(fields: [cropId], references: [id])
  climateZone ClimateZone @relation(fields: [climateZoneCode], references: [code])

  @@unique([cropId, climateZoneCode, startMethod, windowKey])   // 0–N 窗口共存
  @@index([cropId, climateZoneCode, startMethod])
}
```

- `ClimateZone` 模型补充反向关系：`sowingCalendars SowingCalendar[]`。
- **startMethod 枚举约束**：`nursery_plant | direct_seed`。`either` 只允许在 `Crop.recommended_start_method`（AC-27）。数据库层用 CHECK 约束或应用层校验 + 测试封住。
- **多窗口**：同 `crop + climate_zone + concrete start_method` 允许多条，靠 `windowKey` 区分（AC-27）。禁止合成连续区间。
- 窗口用 `MM-DD`（date-only，无年份），引擎用 **Asia/Shanghai calendar day** 判断（AC-21，复用 Slice 2 date-only helper）。
- 无需关联 LifecycleTemplate。
- **唯一新增业务表**。LocationResolver / WeatherProvider 只是接口 + adapter，不建任何定位/天气数据库表。

**不需要变化**：
- `Crop`：已有 `recommendedStartMethod`（可含 `either`）/ `difficulty` / `familyUse` / `yieldLevel` / `harvestDaysMin/Max` / `category` / `containerFriendly`。
- `EnvironmentRequirement`：已有 `tempMin/tempMax`、`frostSensitive`。
- `ClimateZone`：已有 `code / name / cityCodes(Json string[])`。

**需要新加数据访问方法（非 schema 变更）**：
- `AgriDataService.getClimateZoneByCity(cityCode)`：`cityCodes @>` Prisma `array_contains`。
- `AgriDataService.listSowingCalendars(climateZoneCode?, cropIds?, startMethod?)`：治理过滤，返回全部窗口（含 windowKey）。
- `AgriDataService.listSeasonalCrops()` / `getCropDetail(cropId)`。
- `AgriDataService.listSupportedCities()`：从 `ClimateZone.cityCodes` 推导城市列表（AC-30，无 City 表）。

## 2. 是否需要 migration

**是，1 个**：`slice3_sowing_calendar`（CREATE TABLE + FK + unique + 治理列）。保证 fresh DB 全量可复现、Slice1/Slice2→Slice3 upgrade 数据保留。

## 3. 需要新增哪些 DEV_FIXTURE

全部 `reviewStatus='draft'`（AC-18）。

### 3.1 作物（Crop）

| id | name | recommendedStartMethod | 备注 |
|---|---|---|---|
| crop-tomato | 番茄 | nursery_plant | difficulty 1-2，containerFriendly true |
| crop-carrot | 胡萝卜 | direct_seed | difficulty 1 |
| crop-peanut | 花生 | direct_seed | 需松深土（warning 数据） |
| crop-lettuce | 生菜 | either | difficulty 1，收获快 |

### 3.2 环境要求（EnvironmentRequirement）

每作物一条：`minSunHours`、`tempMin/tempMax`、`optimalTemp*`、`frostSensitive`。

### 3.3 播种日历（SowingCalendar）

**startMethod 只用 `nursery_plant` / `direct_seed`，绝不出现 `either`**（AC-27）。

**生菜配置「双窗口」fixture 以验证 AC-27 / AC-24**：

```
crop-lettuce / north_china / direct_seed  / windowKey=spring : 03-01 – 04-30
crop-lettuce / north_china / direct_seed  / windowKey=autumn : 08-20 – 09-30
crop-lettuce / north_china / nursery_plant / windowKey=spring : 04-01 – 05-15
```

- 春季日期（03-20）→ 命中 spring（AC-24/AC-27 Gate 13）。
- 夏季日期（07-01）→ 不得误判 in_window（Gate 14）。
- 秋季日期（09-01）→ 命中 autumn。

番茄 / 胡萝卜 / 花生按 3 气候区各配 nursery / direct_seed 窗口（模型测试数据）。

> 窗口值仅为验证日期边界/多窗口/跨年/降级逻辑，生产不得读取（draft）。

## 4. LocationResolver（新增，AC-01/AC-02/AC-30）

新增 `server/src/location/` 模块：

```ts
interface LocationResolver {
  resolveCity(lat: number, lng: number): Promise<{ city_code: string; city_name: string } | null>;
}
```

- 第一版 `HttpLocationResolver`（reverse geocode provider，超时/错误 → null）或 `MockLocationResolver`（测试）。
- 定位失败（null）→ 前端从 `GET /api/location/supported-cities` 拉取列表，用户手选（AC-02）。
- `supported-cities` 从 `ClimateZone.cityCodes` 推导，**不新建 City 表**（AC-30）。
- **不建 geocode 缓存/历史表**。

## 5. WeatherProvider interface（AC-06/AC-07/AC-28）

新增 `server/src/weather/` 模块：

```ts
interface DailyWeather {
  date: string;        // Asia/Shanghai date
  tempMinC?: number;
  tempMaxC?: number;
  frostRisk?: boolean | 'unknown';
}

interface WeatherProvider {
  fetchRecent(cityCode: string, today: string): Promise<DailyWeather[]>;
  // 返回今天 + 未来 2 天 = 3 个本地日历日（AC-28）
}
```

- `HttpWeatherProvider`（第一版：和风天气适配器；timeout / error → 返回空数组或 `unavailable`）。
- `MockWeatherProvider`（测试用）。
- 引擎纯函数只接收 `DailyWeather[] | null`，不感知 Provider 实现（AC-06）。

**三态（AC-07）**：
- `available`：3 天全部字段确定。
- `partial`：仅部分天/部分字段确定。
- `unavailable`：完全不可用。
- 未知字段按 `unknown`，不参与依赖该字段的 hard filter。

**聚合纯函数（AC-28，独立可测）**：
- 温度：`daily_mean=(temp_min+temp_max)/2`；`three_day_mean=可用 daily_mean 平均`。1–2 天数据（partial）→ 不执行温度 hard filter，仅 warning。
- frost：覆盖 3 天都有明确数据 → 任一 true 则 true，全 false 则 false；存在 unknown → `unknown`，**永不自动变 false**。

## 6. city → climate zone 数据方案

复用现有 `ClimateZone`：

```sql
-- AgriDataService.getClimateZoneByCity(cityCode)
WHERE cityCodes @> ARRAY[cityCode]::jsonb
```

- 结构化数据（AC-08），无 `if (city === ...)`。
- 未覆盖城市 → null → `climate_data_status:'unsupported'`、`recommendations=[]`（AC-09/AC-26）。
- 零 schema 变更（用户确认，见修订点 14）。
- **LocationResolver（定位）与 city→climate_zone（映射）是两个独立环节**。

## 7. recommendation-engine 如何扩展

新增**独立纯函数引擎** `server/src/engines/seasonal-engine/index.ts`，**不改动**现有 `buildPerennialPlan`。

```ts
interface SeasonalInput {
  date: Date;                            // Asia/Shanghai calendar day
  climateZone: { code: string } | null;
  dailyWeather: DailyWeather[] | null;   // 近 3 天（AC-28）
  crops: SeasonalCropRow[];
  calendars: SowingCalendarRow[];        // 含 windowKey，0–N 窗口
  terrace?: { sunHoursMin; sunHoursMax; sunConfidence; rainExposed } | null;
}

interface SeasonalRecommendation {
  crop_id: string; crop_name: string;
  start_method: string;                  // 展示用首选方式
  available_start_methods: string[];     // 当前窗口命中的具体方式（AC-24）
  season_status: 'in_window' | 'too_early' | 'too_late' | 'no_data';
  weather_data_status: 'available' | 'partial' | 'unavailable';  // 顶层一次
  weather_assessment: 'suitable' | 'cold_risk' | 'temp_out_of_range' | 'frost_risk' | 'unknown';
  score: number; rank: number;
  tags: string[]; warnings: string[]; reasons: string[];
}

interface SeasonalResult {
  date: string;
  city_code: string;
  location_status: 'ok' | 'unavailable';
  climate_zone_code: string | null;
  climate_data_status: 'supported' | 'unsupported';
  weather_data_status: 'available' | 'partial' | 'unavailable';  // 顶层，AC-07
  has_profile: boolean;
  items: SeasonalRecommendation[];       // 完整候选集（AC-13）
  warnings: string[];
}
```

流程（纯函数）：

1. `climateZone == null` → 返回 `climate_data_status:'unsupported'`、`items=[]`（AC-09/AC-26）。天气不可用不在此列。

2. **资格判断（AC-16/AC-24/AC-27）**：
   - 对每个作物，按 `startMethod`（若 `either` → 拆成 `nursery_plant` + `direct_seed` 两批查询，AC-27）逐个判断窗口：
     - 对每个 calendar row：`windowStart..windowEnd` 是否含当前 date（Asia/Shanghai，跨年支持）。
     - `available_start_methods` = 命中了至少一个窗口的具体 startMethod 集合。
     - `season_status`：有任一命中 → `in_window`；全早 → `too_early`；全晚 → `too_late`；无日历 → `no_data`。
     - 只有 `in_window` 且 `available_start_methods` 非空的作物进入候选集。
   - 多窗口：同一 `crop/zone/method` 的 spring+autumn 各自独立判断（Gate 13/14）。

3. **天气（AC-05/AC-07/AC-28，克制 hard filter）**：
   - 顶层 `weather_data_status`：由 `dailyWeather` 完整度决定（available/partial/unavailable）。
   - item 级 `weather_assessment`：
     - 3 天温度完整 → `three_day_mean` 越界 → `temp_out_of_range`。
     - frost 覆盖 3 天明确：有 true + frost_sensitive → `frost_risk`；`frostRisk==='unknown'` → 不执行 filter，`weather_assessment='unknown'`（部分数据时）。
     - 温度 partial（1–2 天）→ 不执行温度 filter，仅 warning。
     - `dailyWeather==null` → 所有 weather filter 失效，`weather_data_status='unavailable'`，候选仍保留。

4. **排序（AC-10，deterministic）**：
   - 主序：`season_status`（in_window 优先）→ `score`。
   - `score` 由 difficulty / containerFriendly / familyUse / yieldLevel / harvestDays 加权。
   - tie-breaker：`score DESC, difficulty ASC, crop_id ASC`。
   - 有 TerraceProfile → 复用 `assessSunlight()`（AC-29）：MATCH 正常、BORDERLINE 降权、LIKELY_NO_MATCH 强降权 + 风险提示、NO_MATCH 按可信度规则处理（只影响排序权重，不改变候选资格）。
   - 无 TerraceProfile → 不运行日照判断，中性排序（AC-11/AC-29）。

5. **资格与排序分离**（AC-16）：`season_status` + `available_start_methods` 回答资格；`rank` + `score` + `reasons[]` 回答排序。

静态约束（AC-19/AC-08）：无作物字面量、无 `if (city === ...)`、无自创日照评分（AC-29）。

## 8. API contract

### 8.1 Optional auth（AC-12 最小方案）

- 季节推荐接口**默认放行**。
- optional auth 守卫：解析 `Authorization: Bearer <token>` 成功 → 附带 `userId`；失败/缺失 → `userId=null`。**不重构认证体系**。
- `userId=null` → 基础推荐；`userId!=null` → 可选读 TerraceProfile 增强（无档案等同无档案，不阻塞）。

### 8.2 季节推荐接口

```
GET /api/seasons/now?city_code=beijing
```

```jsonc
{
  "date": "2026-08-09",                 // Asia/Shanghai
  "city_code": "beijing",
  "location_status": "ok",
  "climate_zone_code": "north_china",
  "climate_data_status": "supported",   // unsupported → items=[]
  "weather_data_status": "available",   // available | partial | unavailable（顶层，AC-07）
  "has_profile": false,
  "items": [{
    "crop_id": "crop-carrot",
    "crop_name": "胡萝卜",
    "start_method": "direct_seed",
    "available_start_methods": ["direct_seed"],
    "season_status": "in_window",
    "weather_assessment": "suitable",   // 独立于 weather_data_status（AC-07）
    "score": 92, "rank": 1,
    "tags": [], "warnings": [], "reasons": []
  }],
  "warnings": []
}
```

### 8.3 Location 接口（薄）

```
POST /api/location/resolve
{ "lat": 39.9, "lng": 116.4 }
→ { "city_code": "beijing", "city_name": "北京" }   // null → 前端手动选城市

GET /api/location/supported-cities
→ [ { "city_code": "beijing", "city_name": "北京" }, ... ]   // 数据驱动，AC-30
```

### 8.4 Catalog 详情（AC-15，统一 catalog）

```
GET /api/crops/:id
```

返回 crop 基础字段 + envRequirement + 该作物播种日历（按 startMethod/windowKey 分组展示）。**不新建 SeasonalCropDetail 模型。**

## 9. H5 页面改动

- `Home.vue`：新增「这个季节种什么」入口卡。
  - 点击 → 请求定位 → `POST /api/location/resolve` → 成功跳 `/seasons/now?city_code=xxx`；失败 → `GET /api/location/supported-cities` 拉列表 → 城市选择弹层（AC-02/AC-30）。
- `SeasonalNow.vue`（新路由 `/seasons/now`）：
  - 短卡按 AC-14：作物名 / 现在是否适合 / 怎么开始（按 `available_start_methods`）/ 难度 / 关键风险。
  - 顶部：`weather_data_status != available` → 「暂未结合近期天气」；`climate_data_status == unsupported` → 「当前地区的种植数据还在完善」。
  - 点击卡片 → 详情。
- `CropDetail.vue`（新路由 `/crops/:id`）：复用统一 catalog（AC-15）。
- 不重写现有 PerennialPlan / Planting 流程。

## 10. Playwright Golden Path

### Golden Path A（AC-22）
首页 → 季节入口（mock 定位 beijing）→ 列表 → 找到直播型作物（胡萝卜/花生）→ 页面显示「建议直播」→ 打开详情。

### Golden Path B（AC-22）
WeatherProvider 注入失败 mock → 页面仍正常 → 推荐存在 → 页面显示天气降级提示。

两条均为真实浏览器 DOM 操作（不 waiver）。

## 11. Slice 3 Gate 如何组成

新增 script：`test:slice3-gate`（root + server）。

```bash
# server/package.json
"test:slice3-gate": "vitest run test/slice3-gate.spec.ts"
# root/package.json
"test:slice3-gate": "npm --prefix server run test:slice3-gate"
```

**Gate 测试清单（21 项契约，允许一条测试覆盖多个 invariant）**：

1. 用户零手动输入，但系统有解析后的 `city_code`。
2. unknown city → `climate_data_status='unsupported'`、`recommendations=[]`。
3. weather unavailable → 不 500、recommendations 仍存在。
4. frost data unknown → 不得默认 `frost_risk=false`。
5. `recommended_start_method=either` + 只有 direct_seed 命中 → `available_start_methods=['direct_seed']`、「建议直播」。
6. either + 两方式同时命中 → 均可。
7. draft SowingCalendar → production 不得泄漏。
8. 两个同分作物 → 多次请求排序一致（deterministic）。
9. 无 TerraceProfile → 不伪造 sunlight。
10. 有 TerraceProfile → 环境信息参与增强排序。
11. 跨年窗口。
12. Asia/Shanghai 日期边界（00:10 北京时间已属新一天）。
13. 同 crop/zone/method 两个独立窗口可以共存。
14. 春秋双窗口中，夏季日期不得被误判 `in_window`。
15. `SowingCalendar.startMethod` 不允许 `either`。
16. `weather_data_status` 与 `weather_assessment` 分离（如 `partial` + `unknown` 合法组合）。
17. 三天天气完整 → 温度规则正常生效。
18. 温度数据 partial → 不做温度 hard filter。
19. frost 有 unknown → 不得推导为 false。
20. Seasonal 使用已有 sunlight engine，同一 TerraceProfile 的 sunlight 状态与多年生判定一致。
21. supported-cities 来自数据，不允许 H5 城市硬编码。

`npm run test:all` 串联（沿用现有链 + `test:browser`）：

```
db reset → migrate deploy → seed → test:unit → test:integration(含 gate) → test:e2e → test:h5 → test:browser
```

## 12. 实施顺序

```
AC v1.1 FROZEN（用户确认）
→ 测试骨架（test:slice3-gate + test:all 接入）
→ AC 红测（先写失败测试，含 §11 21 项）
→ migration slice3_sowing_calendar（多窗口 + startMethod CHECK）
→ seasonal-engine 纯函数（资格/排序分离 + either 拆分 + 多窗口 + 三天聚合 + 复用 assessSunlight）
→ LocationResolver + WeatherProvider（接口 + adapter + mock）
→ seasons API（optional auth）+ supported-cities + catalog detail
→ seed：4 作物 + sowing calendars（含生菜双窗口）
→ H5：入口 + SeasonalNow + CropDetail
→ Playwright 2 golden paths
→ test:all 全绿
→ clean-room + upgrade 复现
→ Delivery Report（AC → 实现位置 → 测试 → 结果）
→ 审计 → FREEZE
```

---

# Architecture Conflict 检查

| # | 阻塞点 | 结论 | 说明 |
|---|---|---|---|
| 1 | 城市→气候区映射 | ✅ 无冲突 | `ClimateZone.cityCodes` Json 数组数据驱动，零 schema 变更。 |
| 2 | 定位链路 + supported-cities | ✅ 无冲突 | `LocationResolver` + `GET /api/location/supported-cities` 独立薄接口，从 `ClimateZone.cityCodes` 推导，不建 City 表。 |
| 3 | Public 推荐 + TerraceProfile 增强 | ✅ 无冲突 | optional auth（守卫解析 JWT，失败给 null），不重构认证体系。 |
| 4 | `either` 语义 | ✅ 无冲突 | SowingCalendar 只存具体方式（nursery_plant/direct_seed），either 在引擎层拆分查询；不改 Crop 模型。 |
| 5 | SowingCalendar 多窗口 | ✅ 无冲突 | 纯新增表设计（windowKey + 0–N 窗口），不触碰冻结结构。 |
| 6 | 天气 Provider | ✅ 无冲突 | 新增独立 `weather/` 模块 + 三天聚合纯函数 + 两字段拆分；不建天气数据库表。 |
| 7 | 日照增强 | ✅ 无冲突 | **复用已冻结 `assessSunlight()`**，Seasonal 不新建日照算法（AC-29），天然与多年生判定一致。 |
| 8 | 季节推荐需要容器/土壤吗 | ✅ 无冲突 | Slice 3 只给 crop + start_method + 时令 + 风险，不进入容器/配土流程。 |
| 9 | 作物详情 | ✅ 无冲突 | 复用统一 `Crop` 模型 + `GET /crops/:id`。 |
| 10 | 播种窗口与 lifecycle | ✅ 无冲突 | SowingCalendar（何时开始）与 LifecycleTemplate（种下后阶段）语义独立，不建关联。 |
| 11 | 日期口径 | ✅ 无冲突 | 复用 Slice 2 的 Asia/Shanghai date-only helper。 |
| 12 | Crop 字段 | ✅ 无冲突 | `recommendedStartMethod` / `difficulty` 等已存在。 |

**结论：无 Architecture Conflict。**

唯一结构变更：新增 `SowingCalendar` 表（纯新增 migration，治理字段 + 真实 FK 到 Crop / ClimateZone + windowKey 多窗口 + startMethod 枚举约束），不修改历史表，升级路径与 Slice 2 一致。

---

*本计划为草案 v1.1。待用户冻结 AC v1.1 后再进入 Coding。*
