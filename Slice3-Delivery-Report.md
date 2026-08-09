# Slice 3 Delivery Report — 「这个季节种什么」

> 报告日期：2026-08-09
> 当前状态：FINAL CLOSURE CANDIDATE / AWAITING INDEPENDENT AUDIT
> 验收基线：`Slice3-Acceptance-Criteria-v1.0.md`（v1.1 FROZEN）
> Slice 1 = CLOSED / ACCEPTED；Slice 2 = PASS / FROZEN（基线 `5affe3a2`）
> 工作流：AC Freeze → 测试骨架 → 红测 → Coding → Slice Gate → 浏览器 E2E → Clean-room → Delivery Report

---

## 1. 目标

验证「这个季节种什么」模型：用户几乎不手动填写，系统根据地区 + 当前日期 + 近期天气，推荐露台上现在可种的作物，以及买苗/直播。

代表作物：番茄（nursery_plant）、胡萝卜（direct_seed）、花生（direct_seed）、生菜（either）。全部 `reviewStatus='draft'` DEV_FIXTURE。

---

## 2. 新增结构（唯一新增业务表）

**`SowingCalendar`**（migration `20260808164557_slice3_sowing_calendar`，纯新增，不修改历史表）：

- `cropId` → FK Crop；`climateZoneCode` → FK ClimateZone。
- `startMethod` ∈ {nursery_plant, direct_seed}，DB CHECK 约束禁止 `either`（AC-27）。
- `windowKey` 支持同 crop/zone/method 0–N 独立窗口（AC-27）。
- 治理字段：source / reviewStatus / confidence / version / updatedAt（AC-25）。

无定位/天气数据库表（AC-13 修订点）；LocationResolver / WeatherProvider 均为接口 + adapter。

---

## 3. AC → Implementation → Test → Result

### AC-01 零输入主路径（用户零手动填写）
- Implementation：`LocationResolver.resolveCity(lat,lng)`（mock/http adapter）→ city_code → `GET /api/seasons/now?city_code=`。
- Test：`S3-E2E-01`（Playwright geolocation mock → beijing → 推荐）。
- Result：PASS。

### AC-02 定位失败轻量降级 + supported-cities
- Implementation：`GET /api/location/supported-cities`（从 `ClimateZone.cityCodes` 推导）+ H5 城市选择弹层。
- Test：`slice3-gate`「supported-cities comes from climate mapping data」；E2E 走降级链路（Home 弹层）。
- Result：PASS。

### AC-03 不允许「新手全部买苗」
- Implementation：`available_start_methods` 由窗口命中决定（engine eligibility）。
- Test：`slice3-gate`「available_start_methods only includes methods whose window hits today」。
- Result：PASS。

### AC-04 SowingCalendar 与 start_method 绑定
- Implementation：calendar 行按 `(crop, zone, concrete start_method, windowKey)`。
- Test：`slice3-gate`「DB allows two independent windows」。
- Result：PASS。

### AC-05 天气 hard filter 克制
- Implementation：engine 仅两条 weather filter（温度越界、霜冻×frost_sensitive）。
- Test：unit（temperature/frost 相关 gate 用例）。
- Result：PASS。

### AC-06 WeatherProvider 隔离
- Implementation：`WEATHER_PROVIDER` token 抽象 + http/mock adapter；engine 只收 `DailyWeather[]`。
- Test：静态（engine 无 http 调用）+ gate。
- Result：PASS。

### AC-07 天气三态 + unknown 不默认
- Implementation：`weather_data_status`（available/partial/unavailable）+ `weather_assessment`（suitable/…/unknown）。
- Test：`slice3-gate`「weather_data_status partial + weather_assessment unknown 合法」「frost unknown 不默认 false」。
- Result：PASS。

### AC-08 city → climate_zone 数据驱动
- Implementation：`getClimateZoneByCity`（`cityCodes` Json array_contains）。
- Test：静态（无 `if(city===...)`）+ gate（beijing → north_china）。
- Result：PASS。

### AC-09 未覆盖城市 unsupported
- Implementation：zone 为 null → `climate_data_status:'unsupported'`、`items=[]`。
- Test：`slice3-gate`「unknown city → unsupported, items=[]」。
- Result：PASS。

### AC-10 deterministic 排序
- Implementation：`score DESC, difficulty ASC, crop_id ASC`。
- Test：`slice3-gate`「equal-score crops keep stable order」。
- Result：PASS。

### AC-11 无 TerraceProfile 不伪造环境
- Implementation：无档案不运行日照判断，中性排序。
- Test：`slice3-gate`「no terrace → has_profile=false, no fabricated sunlight」。
- Result：PASS。

### AC-12 有 TerraceProfile 增强（optional auth）
- Implementation：`OptionalAuthGuard`（JWT 可选）；有 userId 读 TerraceProfile 增强。
- Test：`slice3-gate`「terrace enhances ranking」。
- Result：PASS。

### AC-13 完整候选集
- Implementation：engine 返回所有 in_window 作物（不截断 Top3）。
- Test：`slice3-gate` 多作物断言。
- Result：PASS。

### AC-14 推荐卡短
- Implementation：`SeasonalNow.vue` 短卡（作物名/适合/怎么开始/难度/关键风险）。
- Test：`S3-E2E-01` 断言卡片字段。
- Result：PASS。

### AC-15 统一 Catalog 详情
- Implementation：`GET /api/crops/:id`（复用 Crop 模型），`CropDetail.vue`。
- Test：`S3-E2E-01` 详情断言。
- Result：PASS。

### AC-16 结构化输出 + 资格/排序分离
- Implementation：`season_status`/`available_start_methods`（资格）与 `rank`/`score`/`reasons[]`（排序）分离。
- Test：gate unit 断言。
- Result：PASS。

### AC-17 禁 DeepSeek
- Implementation：无 AI 依赖。
- Test：静态 + 架构。
- Result：PASS（NOT a runtime test — 由实现保证）。

### AC-18 DEV_FIXTURE 分离
- Implementation：4 作物 + calendars 全部 draft。
- Test：`slice3-gate`「production: draft seasonal crops are not served」。
- Result：PASS。

### AC-19 跨作物规则不污染
- Implementation：按 cropId 数据查询；静态检查无作物字面量。
- Test：静态 grep + gate。
- Result：PASS。

### AC-20 WeatherProvider 失败降级
- Implementation：timeout/error → `[]` → `weather_data_status:'unavailable'`。
- Test：`S3-E2E-02`（真实 http provider 无 key → unavailable → 推荐仍在 + 降级提示）。
- Result：PASS。

### AC-21 日期窗口边界 + Asia/Shanghai
- Implementation：`windowHits`（含跨年）+ 复用 `toShanghaiDate`。
- Test：`slice3-gate`「Asia/Shanghai 00:10 is next day」「year-crossing window」。
- Result：PASS。

### AC-22 真实浏览器 E2E
- Implementation：`e2e/seasonal.spec.ts`（S3-E2E-01/02）。
- Test：Playwright 4 条（含 Slice 2 回归 2 条）。
- Result：PASS。

### AC-23 Slice 1/2 不回归
- Test：`npm run test:all`（unit 33 + integration 67 + h5 2 + browser 4）。
- Result：PASS。

### AC-24 either 语义（available_start_methods）
- Implementation：either → 分别查 direct_seed/nursery_plant 日历行。
- Test：`slice3-gate`「available_start_methods only includes methods whose window hits today」。
- Result：PASS。

### AC-25 SowingCalendar 治理 + 关系
- Implementation：治理字段 + FK + CHECK。
- Test：`slice3-gate`「DB rejects startMethod=either」「DB allows two windows」「duplicate windowKey rejected」「production 不泄漏」。
- Result：PASS。

### AC-26 unknown/unsupported 状态矩阵
- Implementation：location/climate/weather 三组状态分离。
- Test：gate「unknown city」「weather unavailable」。
- Result：PASS。

### AC-27 SowingCalendar 多窗口 + 禁 either
- Implementation：`windowKey` + 0–N + DB CHECK。
- Test：gate（DB 层 3 项 + engine）。
- Result：PASS。

### AC-28 近 3 天天气语义
- Implementation：`aggregateWeather`（daily_mean、three_day_mean、frost 聚合）。
- Test：`slice3-gate`「three-day complete weather: temp out of range」「within range」「partial temperature 不 filter」「frost unknown」。
- Result：PASS。

### AC-29 复用已冻结 sunlight engine
- Implementation：`sunlightWeight` 调用 `assessSunlight()`，无第二套日照算法。
- Test：`slice3-gate`「sunlightWeight matches frozen assessSunlight semantics」。
- Result：PASS。

### AC-30 supported-cities 数据驱动
- Implementation：`listSupportedCities()` 从 `ClimateZone.cityCodes` 推导。
- Test：`slice3-gate`「supported-cities comes from climate mapping data」。
- Result：PASS。

---

## 4. 测试结果（实际执行）

```
test:slice3-gate   22 passed  (engine 16 + API 3 + DB invariants 3)
test:slice2-gate    8 passed
test:unit          33 passed
test:integration   67 passed  (integration 16 + governance 10 + plantings 11 + slice2-gate 8 + slice3-gate 22)
test:e2e            passed
test:h5             2 passed
test:browser        4 passed  (S2-E2E-01/02 + S3-E2E-01/02)
test:all            EXIT=0    全绿
server build        EXIT=0
h5 build            EXIT=0
```

## 5. Migration / Clean-room

```
fresh DB:   migrate deploy PASS（31 表）
Slice2→Slice3 upgrade: migrate deploy PASS（30→31 表）
  - Slice2 用户数据保留（TerraceProfile 存在）
  - SowingCalendar 新表创建
  - 历史 migration 未修改
clean-room: /tmp/terrace-s3-clean（rsync 副本 → npm ci → migrate deploy → seed → server/h5 build → slice3-gate 22 / slice2-gate 8 / unit 33 全部 PASS）
```

## 6. 静态检查

```
server/src 无 'crop-tomato'/'crop-carrot'/'crop-peanut'/'crop-lettuce' 字面量（seed/test 除外）
server/src 无 `if (city === 'beijing'/'shanghai')` 硬编码
Seasonal 复用 assessSunlight()，无季节性日照自创算法
```

## 7. 已知局限 / 备注

- `SEASON_DATE` 环境变量为 E2E 确定性注入（测试专用，生产不使用）。
- HttpWeatherProvider / HttpLocationResolver 为真实 provider 骨架，无 key 时优雅降级（AC-20）。
- 所有季节性作物与播种日历均为 draft DEV_FIXTURE，production 不读取。

## 8. 交付 commit

本报告对应 git commit SHA：见最终 main HEAD（提交信息前缀 `Slice 3: seasonal recommendation — ...`）。

---

*本报告每条核心 AC 均以「AC → Implementation → Test → Result」对应，无 NOT AUTOMATED 项。*

---

## 9. Closure 修复（2026-08-09，第二 commit）

审计复核发现 6 个与冻结 AC 冲突的实现问题，全部修复，不新增功能：

| # | 问题 | 修复 | 测试 |
|---|---|---|---|
| 1 | AC-05 weather hard filter 未执行（只加 warning） | engine `isWeatherHardFiltered`：full weather + temp_out_of_range / frost_risk+frostSensitive → 真正移除出 items；partial/unknown → 保留 | gate「temp out of range hard-filtered」「frost_risk+frostSensitive hard-filtered」「partial/unknown kept」 |
| 2 | 真实 QWeather adapter 不工作（location=beijing、temp 是 string、缺失 frost 假 false） | location 用坐标（`lng,lat`，来自 CITY_METADATA）；`parseTemp` 安全解析 string/number；缺失 → undefined/'unknown'，frost 绝不假 false | adapter contract：官方 string 响应 `{"tempMin":"-1","tempMax":"12"}` → -1/12 + frost true；缺失 tempMin → unknown |
| 3 | 真实 LocationResolver 返回第三方行政区字符串 | AMap province/city/district → `findCityByPlaceName` 规范化 → canonical code；北京直辖市区县正确归一 | contract：北京/海淀区 → `{beijing, 北京}`；杭州 → `{hangzhou, 杭州}` |
| 4 | supported-cities `city_name` 返回 code（beijing/beijing） | 新增服务端 `CITY_METADATA`（code→中文名+坐标），`listSupportedCities` 用中文名 | gate「beijing → 北京」 |
| 5 | SeasonsService 伪造环境（默认 6h/false） | 默认全部 `null`；无可靠 minSunHours → 不运行 sunlight；无 temp/frost → 不执行对应 filter | gate「null env facts → neutral, no fake 6h/false」 |
| 6 | Crop Detail 展示所有气候区窗口 | `GET /crops/:id?city_code=` 按 climate zone 过滤；SeasonalNow 跳转带 city_code；无 city context 不写"本气候区" | gate「crop detail + beijing → 仅 north_china calendars」 |

## 10. Final contract closure candidate（独立终审反馈）

独立终审确认 `d7b2d8a` 仍有 Slice 3 阻断项，因此该 SHA 不再视为
Slice 3 PASS/FROZEN 基线。本轮只修复 Slice 3 已冻结的天气、Provider、定位和
H5 契约，不包含任何 Slice 4 生产基础设施实现。

### 10.1 阻断项修复

| # | 审计问题 | 修复 | 精确自动化证据 |
|---|---|---|---|
| 1 | 顶层 `weather_data_status=partial` 会同时禁用温度与霜冻 hard filter | `aggregateWeather` 分别输出 `temperatureComplete` / `frostComplete`；温度和霜冻只依赖各自三日事实，顶层 partial 不再屏蔽已确定事实 | `complete temperature still hard-filters when frost facts are partial`; `complete frost facts still hard-filter when temperature facts are partial` |
| 2 | 部分霜冻数据中出现 `true` 会覆盖同窗口的 unknown | 只有三个不同本地日历日全部提供明确 boolean 时才聚合 frost；任一 unknown/缺失均为 `unknown` | `any unknown frost day makes aggregate frostRisk unknown`; `duplicate calendar days do not count as complete three-day weather` |
| 3 | 任意 WeatherProvider throw/永久 pending 可导致 API 500/挂起 | Provider 边界新增 `fetchWeatherSafely`，同步 throw、异步 reject、非法返回和超时统一降级为 `[]` | API gate `provider throw degrades to unavailable without a 500`; `provider timeout degrades to unavailable without hanging the endpoint`; `provider partial fields remain partial` |
| 4 | QWeather 使用将逐步停用的公共 Host、把 key 放 URL、忽略 `fxDate` 并按数组下标伪造日期 | 改用 `QWEATHER_API_HOST` 专属 Host + `X-QW-Api-Key`；只接收响应中明确属于 today/today+1/today+2 的 `fxDate`，缺日不补造 | adapter gate `QWeather string temp response...`; `QWeather uses fxDate and never fabricates missing calendar days` |
| 5 | 高德直辖市缺失 `city` 的真实 payload 可能是 `[]`，字符串方法会抛错并错误降级 | 行政字段按 `unknown` 输入解析，非字符串安全跳过；同时校验 provider `status='1'`，timeout timer 在 finally 清理 | adapter gate `AMap 北京/海淀区 shape...` 使用 `city: []`；杭州非直辖市回归 |
| 6 | 季节卡的当前 `available_start_methods` 在 Crop Detail 丢失，`either` 作物可能从“建议直播”变回“均可” | SeasonalNow 跳转携带 `start_methods` 上下文；CropDetail 优先展示当前推荐上下文，城市过滤仍保留 | Playwright `S3-E2E-01`：生菜只有 direct_seed 命中，卡片与详情均断言“建议直播” |

### 10.2 Weather partial 语义（最终实现矩阵）

| 三日温度事实 | 三日 frost 事实 | 顶层状态 | 温度 filter | frost filter |
|---|---|---|---|---|
| 3 日完整 | 3 日明确 boolean | available | 可执行 | 可执行 |
| 3 日完整 | 任一 unknown/缺失 | partial | 可执行 | 禁用 |
| 1–2 日 | 3 日明确 boolean | partial | 禁用 | 可执行 |
| 1–2 日 | 任一 unknown/缺失 | partial | 禁用 | 禁用 |
| 0 日 | 任意 | unavailable | 禁用 | 禁用 |

`weather_assessment` 仍与顶层质量状态分离。只有某项事实自身完整时才允许它触发
hard filter；未被过滤但仍缺少作物判断所需事实的 item 返回 `unknown`。

### 10.3 Provider contract

- QWeather API Host 必须通过 `QWEATHER_API_HOST` 提供，格式为控制台分配的
  hostname（例如 `abc.qweatherapi.com`）。
- API key 通过 `X-QW-Api-Key` 请求头发送，不写入 URL 或日志。
- QWeather v7 `daily[].fxDate/tempMin/tempMax` 是 adapter 输入；对外引擎仍只依赖
  `DailyWeather { date, tempMinC?, tempMaxC?, frostRisk? }`。
- Provider 边界默认 3500ms 降级；测试通过 `WEATHER_PROVIDER_TIMEOUT_MS` 使用短窗口
  确定性覆盖永久 pending 场景。

### 10.4 实际验证结果

本轮在同一工作树实际执行：

```text
server build             EXIT=0
h5 build                 EXIT=0
test:slice3-gate         41 passed
test:unit                33 passed
test:integration         86 passed
  slice3-gate            41 passed
  plantings              11 passed
  integration            16 passed
  governance             10 passed
  slice2-gate             8 passed
API full-chain E2E       PASS
h5 component              2 passed
Playwright Chromium       4 passed
npm run test:all         EXIT=0
```

### 10.5 Migration gate

- Fresh test DB：4 个历史 migration 从空库依次部署，PASS。
- Slice 2 frozen DB → current：先仅部署前三个 migration，写入代表性 User 和
  TerraceProfile，再运行当前 `prisma migrate deploy`。
- 结果：User=`1`、TerraceProfile=`1` 均保留；SowingCalendar 表=`1`；已完成
  migration=`4`。PASS。
- 本轮未修改 Prisma schema、历史 migration 或 seed 农业事实。

### 10.6 状态与 commit

本节是供独立审查的 closure candidate，不自行宣告 Slice 3 PASS/FROZEN。
代码候选 commit SHA：**`85a25b40de7d119fd12accb5f550098743352888`**。
只有独立终审通过后，该 SHA 才能成为 Slice 4 的 frozen baseline。
| - | 缺 city_code 的 date 用 UTC | 复用 `toShanghaiDateString()` | gate「missing city_code → Asia/Shanghai date」 |

测试结果（closure 后）：
```
test:slice3-gate   33 passed（engine 21 + API 8 + DB 3 + real-adapter contract 4）
test:all           EXIT=0（unit 33 + integration 78 + h5 2 + browser 4）
server/h5 build    EXIT=0
```

Closure commit SHA：见最终 main HEAD（提交信息前缀 `Slice 3: closure — real provider contracts + hard filters`）。
