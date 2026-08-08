# Slice 3 Delivery Report — 「这个季节种什么」

> 报告日期：2026-08-09
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
