# Slice 3 Acceptance Criteria v1.1 — 「这个季节种什么」

**状态：FROZEN CANDIDATE v1.1 — 修订完成后由用户冻结**

- Slice 1 = CLOSED / ACCEPTED（不得回归）
- Slice 2 = PASS / FROZEN（基线 commit `5affe3a23b2205c20e4d7e804eefd76bbc75d93d`）
- 工作流：AC Freeze → 测试骨架 → 红测 → Coding → Slice Gate → 浏览器 E2E → Clean-room → 审计 → Freeze
- 验收只按本文执行；实现中除非发现 P0 数据正确性/安全/数据损坏问题，不再临时扩大范围。
- 修订记录：
  - v1.1a：定位链路、optional auth、either 语义、天气三态、SowingCalendar 治理、deterministic 排序、状态矩阵。
  - v1.1b（本次）：SowingCalendar 多窗口、startMethod 禁 `either`、weather 两字段拆分、近 3 天天气语义冻结、复用已冻结 sunlight engine、supported-cities 契约。

---

# 1. Slice 3 产品目标

验证模型：

> 一个完全不懂种植的用户打开 H5，几乎不手动填写任何信息，系统根据地区、当前日期和近期天气，告诉他露台上「现在可以开始种什么」，以及应该「买苗」还是「直播」。

- 不追求作物数量；用少量代表作物把模型验证正确。
- 天气第一版只回答一件事：**最近是否适合开始种**。

# 2. 代表作物（模型测试数据）

| 作物 | recommended_start_method | 验证点 |
|---|---|---|
| 番茄 | `nursery_plant` | 建议买苗 |
| 胡萝卜 | `direct_seed` | 建议直播 |
| 花生 | `direct_seed` | 建议直播 |
| 生菜 | `either` | 按**当前有效窗口**决定（AC-24） |

> 这些作物首先是**模型测试数据**。全部 `reviewStatus='draft'` DEV_FIXTURE（AC-18）。
> `recommended_start_method` 是作物总体允许方式；`SowingCalendar.startMethod` 只记录具体方式（AC-27）；当前可用方式由 `available_start_methods` 表达（AC-24）。

# 3. 明确不做

本 Slice **不做**：

* 50+ 作物库、完整全国农业气候库
* AI / DeepSeek / RAG 进入推荐主链路
* 天气长期管理（每天浇水建议、下雨/台风提醒、连续高温管理）
* 种下之后的每日动态指导
* 消息推送、小程序、电商、新提醒系统、管理后台大改
* 复杂定位基础设施（省市县层级库、geocode 数据库表）
* 天气/定位相关的数据库表（WeatherHistory / WeatherForecastCache / LocationHistory / GeocodeCache）
* 一套与 Slice 1 并行的「季节性日照算法」（AC-29 禁止）
* Slice 4

# 4. P0 Acceptance Tests

以下全部为 Slice 3 blocker。

## AC-01 零输入主路径（用户零手动填写）

「零输入」定义：**用户不用手动填写**，不代表后端可以凭空知道用户位置。

完整链路必须明确：

```
用户点击「这个季节种什么」
↓
H5 请求定位权限
↓
获得 lat/lng
↓
LocationResolver（Reverse Geocode，第一版薄接口）
↓
得到规范 city_code
↓
city_code → climate_zone
↓
天气
↓
季节性推荐
```

Given：定位成功（或用户轻量选城市）→ `city_code` 已知。

When：正常情况。

Then：系统自动完成 `服务端确定日期 → 服务端获得天气 → 确定气候区 → 推荐当前可开始种植的作物`。不要求用户先建立 TerraceProfile。

**定位 ≠ city→climate_zone**：定位是「设备坐标 → 城市」，city→climate_zone 是「城市 → 气候区」，是两个独立环节，分别数据驱动。

## AC-02 定位失败必须轻量降级（含 supported-cities 契约）

定位失败时允许用户简单选择城市。**不要求**经纬度、区县、家庭地址、农业气候区。

第一版接受薄接口：

```ts
interface LocationResolver {
  resolveCity(lat: number, lng: number): Promise<{ city_code: string; city_name: string } | null>;
}
```

**手动选城市的数据来源必须是数据驱动的**，前端不得硬编码城市列表。新增轻量只读接口：

```
GET /api/location/supported-cities
→ [ { "city_code": "beijing", "city_name": "北京" }, ... ]
```

- 直接从现有 `ClimateZone.cityCodes` 推导，**不新建 City 表**。
- 只返回系统确实有 climate mapping 的城市（AC-30）。
- 定位失败 → H5 从该接口拉取列表，用户手选 `city_code`（AC-02 降级路径）。手选结果必须与 LocationResolver 得到的同 `city_code` 推荐结果一致。

## AC-03 不允许「新手全部买苗」

必须验证：

- 番茄 → 建议买苗
- 胡萝卜 → 建议直播
- 花生 → 建议直播
- 生菜 → 见 AC-24（按当前有效窗口，不得直接输出「均可」）

「新手友好」不能凌驾于植物本身适合的开始方式。

## AC-04 SowingCalendar 必须与 start_method 绑定，且支持 0–N 窗口

推荐必须判断 `crop + climate_zone + concrete start_method + planting window`，不能只是 `crop + month`。

**同一作物 `nursery_plant` 与 `direct_seed` 允许拥有不同窗口（可同时存在）。**

**同一 `crop + climate_zone + concrete start_method` 允许存在 0–N 个独立窗口**（AC-27）：

```
生菜 / north_china / direct_seed
  窗口1（spring）：03-01 → 04-30
  窗口2（autumn）：08-20 → 09-30
```

不得把多个窗口强行合成一个连续区间（如 `03-01 → 09-30`），否则会把整个夏季错误判断为可播种。

## AC-05 天气第一版只回答一件事

天气只用于判断「**最近是否适合开始种**」，且 hard filter 必须克制。

**第一版允许的 weather hard filter（仅此两条）**：

1. 近期温度明显超出作物允许范围（`tempMin/tempMax` 越界）。
2. 霜冻风险（确定）+ 作物 `frost_sensitive`。

**禁止**：降雨量评分、风速、湿度、UV、连续阴天、土壤湿度、体感温度，以及任何「天气好 → 加分」类评分。

**天气不可用/未知时**：所有 weather hard filter 自动失效，作物**不被过滤**，仅天气数据状态降级标记。

## AC-06 WeatherProvider 必须隔离

- 有明确 `WeatherProvider` 抽象。
- 业务规则只依赖内部天气结构（最小字段）。
- 推荐引擎内不得直接调用和风天气 API。
- 更换 Provider 不应改推荐规则。
- 第一版只定义真正需要的最小字段（date / temp_min / temp_max / frost_risk）。

## AC-07 天气必须拆分「数据质量」与「作物判断」两个字段

**禁止用一个字段承担两种语义**。

### 天气数据质量（顶层，每请求一次）

```
weather_data_status = available | partial | unavailable
```

### 天气对作物的判断（item 级，每作物一次）

```
weather_assessment = suitable | cold_risk | temp_out_of_range | frost_risk | unknown
```

两者独立合法，例如：

```json
{
  "weather_data_status": "partial",
  "weather_assessment": "unknown"
}
```

**字段缺失必须用 `unknown` 表达，禁止默认值**：

```ts
// ✗ 禁止
temperature = 20
frost_risk = false
```

引擎规则：

```
天气事实确定 → 可参与 hard filter / risk 判断
天气事实未知 → 不执行依赖该事实的 hard filter → 保留候选 → weather_assessment=unknown
```

特别地：**没拿到霜冻数据 ≠ 没有霜冻**。`frost_risk='unknown'` 时不得按「无霜冻」处理。

## AC-08 city → climate_zone 必须数据驱动

不接受：

```ts
if (city === 'beijing') ...
if (city === 'shanghai') ...
```

城市与气候区映射必须是结构化数据（当前复用 `ClimateZone.cityCodes` Json 数组）。

## AC-09 未覆盖城市不得偷偷套默认地区

没有可靠气候数据的城市：
- 不得默认北京 / 上海 / 华东。
- 不得伪造推荐。
- 返回 `climate_data_status = unsupported`，且 **`recommendations = []`**（终止农业推荐）。
- 前端提示「当前地区的种植数据还在完善」。

> 城市不支持 = 终止推荐；天气数据不可用 = 继续基础推荐。两者是不同语义，不得混淆（AC-26）。

## AC-10 推荐优先级遵守产品原则（deterministic）

排序原则（时令优先）：

1. 当前时令适合（season window）
2. 新手容易（difficulty）
3. 露台适合（containerFriendly）
4. 家庭常见 / 好吃（familyUse）
5. 产量（yieldLevel）
6. 收获速度（harvestDays）
7. 占地

**排序必须 deterministic**：同输入 → 同顺序。同分必须稳定 tie-breaker：

```
score DESC
difficulty ASC
crop_id ASC
```

## AC-11 无 TerraceProfile 时不要伪造环境

- 季节性入口默认不需要建档。
- 无档案时不得假设南向 / 6 小时太阳 / 不淋雨。
- 环境适配只能采用「中性 / 未知」。
- **无档案时不运行日照判断**（AC-29），使用中性排序因素。

## AC-12 有 TerraceProfile 时必须复用已冻结的 sunlight engine（optional auth）

**Public 推荐与档案增强的矛盾，采用最小方案解决：**

```
无 JWT / 未登录
→ 只用 city_code + date + weather 生成基础推荐（无日照判断）

有合法 JWT
→ 可选读取当前 TerraceProfile
→ 复用 Slice 1 已冻结的 sunlight assessment 增强
```

- 有 JWT 是**增强条件**，不是推荐入口条件。
- 实现采用 **optional auth**（守卫「放行所有请求，但附带解析出的 userId 或 null」），**不重构认证体系**。
- 已有建档复用 sun range / sun confidence / rain exposure。

## AC-13 返回「现在能种什么」完整候选集

后端返回当前符合条件的**完整候选集**再排序。前端可重点突出前几个。不得人为只返回「3 个 AI 推荐」。

## AC-14 推荐卡必须短

列表页第一层只展示：

```
作物名
现在是否适合
怎么开始（买苗/直播，按当前有效窗口）
难度
关键风险
```

完整教程进入详情再看。

## AC-15 作物详情继续使用统一 Catalog

不得复制一套 `SeasonalCropDetail`。Crop / Variety / 指南继续来自统一 catalog（现有 `Crop` 模型 + catalog API，扩展 `GET /crops/:id` 详情接口）。

## AC-16 推荐结果必须结构化：候选资格与排序分离

后端输出至少考虑：

```
crop_id, crop_name
start_method            // 展示用首选方式
available_start_methods // 当前日期下真正有效的方式（AC-24）
season_status           // in_window | too_early | too_late | no_data
weather_data_status     // available | partial | unavailable（顶层）
weather_assessment      // suitable | cold_risk | temp_out_of_range | frost_risk | unknown（item 级）
score, rank
tags[], warnings[], reasons[]
```

结果必须同时回答两个问题，**不得混成一个黑盒 score**：

- 为什么能进入列表 → `season_status`、`available_start_methods`（资格）
- 为什么排在这个位置 → `rank`、`score`、`reasons[]`（排序）

## AC-17 Slice 3 禁止 DeepSeek 进入推荐主链路

不实现 AI 排名 / AI 判断天气 / AI 决定现在种什么 / AI 作物筛选。DeepSeek 不成为核心功能依赖。

## AC-18 DEV_FIXTURE 与 APPROVED 继续分离

番茄、胡萝卜、花生、生菜当前仅用于开发验证 → 明确 `reviewStatus='draft'`。不得为通过生产治理 gate 把开发者随手数据改成 `approved`。Production gate 继续有效。

## AC-19 不允许跨作物规则污染

必须自动测试：

- 番茄只读取番茄 calendar / rules
- 胡萝卜不会读取番茄 nursery window
- 花生不会因为其他作物存在 nursery calendar 而被错误判成建议买苗

> 新作物主要增加数据，不增加大量 crop-specific if/else。

## AC-20 WeatherProvider 必须测试失败降级（含 unknown）

自动验证：正常响应 / timeout / throw error / 缺字段（partial）→ 全部不得造成季节推荐接口 500。

- timeout / error → `weather_data_status='unavailable'`，基础推荐仍在。
- 缺字段 → `weather_data_status='partial'`，缺失字段按 `unknown` 处理，不默认、不过滤。
- **frost_risk 缺失 → 不得默认 `false`**（必须测试）。
- 温度缺失 → 不得默认 20℃；`temp_out_of_range` filter 不执行。

## AC-21 日期窗口必须测试边界（Asia/Shanghai 口径）

至少：窗口第一天 / 最后一天 / 前一天 / 后一天 / 跨年窗口。

**必须复用 Slice 2 已建立的 Asia/Shanghai calendar-day 口径**（同一 date-only helper），不得另建一套日期语义。

> 8月1日 00:10 北京时间已属于 8 月 1 日窗口。Lifecycle 与 Seasonal 必须是同一天。

## AC-22 真实浏览器 E2E

### Golden Path A
首页 → 这个季节种什么 → 推荐结果列表 → 找到直播型作物 → 页面明确显示「建议直播」→ 打开作物详情。

### Golden Path B
天气 Provider 失败 → 页面仍正常打开 → 推荐仍存在 → 页面明确显示天气降级提示。

不允许用 curl 代替真实 H5 验证。

## AC-23 Slice 1 / Slice 2 不允许回归

Slice 3 最终必须通过 `npm run test:all`，并继续包含：

```
Slice 1 gate (governance / integration)
Slice 2 gate (plantings.spec + slice2-gate.spec)
Slice 3 gate (seasonal-engine + seasons API)
API integration
H5 component tests
Playwright
build
```

---

## 5. 新增/强化 AC

## AC-24 `either` 的语义：available_start_methods

`Crop.recommended_start_method` **不得**直接等于「当前可用方式」。

`either` 不是 SowingCalendar 的一个值（AC-27）。引擎对 `either` 作物**分别查询 `nursery_plant` 与 `direct_seed` 的 calendar rows**，再根据当天命中情况计算：

```
available_start_methods[] =
  只有 direct_seed 命中   → ["direct_seed"]       → 「建议直播」
  只有 nursery_plant 命中 → ["nursery_plant"]     → 「建议买苗」
  两者都命中              → ["direct_seed","nursery_plant"] → 「买苗 / 直播均可」
  都不命中                → 不进入当前可种候选集
```

示例（生菜，8 月 15 日，只有 `direct_seed` 窗口 8/1–9/30 有效，`nursery_plant` 窗口 9/1–10/30 未开始）：

```
available_start_methods = ['direct_seed']
前端文案 = 「建议直播」（不得显示「买苗/直播均可」）
```

自动化测试：AC-24-1（只有 direct_seed 在窗口）、AC-24-2（两窗口同时有效）、AC-24-3（都不命中 → 不进候选）。

## AC-25 SowingCalendar 是受治理的农业事实 + 关系约束

**治理**：`SowingCalendar` 直接决定用户能否开始种，必须纳入统一治理体系，复用 GovernanceService 方案：

```
reviewStatus  (draft | ai_generated | cross_reviewed | approved)
source
confidence
version
updatedAt
```

- Production：draft SowingCalendar 永远不能进入推荐。
- Development：仍遵守 `APP_ENV=development && ALLOW_DRAFT_FIXTURES=true` 双重 gate。
- 自动测试：production 下 draft SowingCalendar 不得泄漏（AC-25-1）。

**关系约束**：不得使用自由字符串：

```prisma
cropId          String  // 真实 Crop relation（FK）
climateZoneCode String  // 真实 ClimateZone relation（FK）
```

错误数据尽可能在数据库层就进不来。

## AC-26 unknown / unsupported 必须贯穿完整链路

以下全部**不是 500**，也不得偷偷使用默认数据：

| 情况 | 结构化语义 | 行为 |
|---|---|---|
| 定位失败 | `location_status = unavailable` | 前端引导手动选城市（AC-02） |
| 城市无法解析 | `location_status = unavailable` | 同上 |
| 城市无 climate mapping | `climate_data_status = unsupported` | **终止推荐**，`recommendations = []` |
| 天气数据不可用 | `weather_data_status = unavailable` | **继续基础推荐**，`recommendations = [...]` |
| 天气部分字段缺失 | `weather_data_status = partial` | 缺失字段按 unknown，保留候选 |
| 无 TerraceProfile | `has_profile = false` | 中性环境，不伪造 |

**城市不支持 ≠ 天气不可用**，两者不得混为一谈。

## AC-27 SowingCalendar：多窗口 + startMethod 禁 `either`（schema invariant）

### 多窗口（0–N）

**同一个 `crop + climate_zone + concrete start_method` 允许存在 0–N 个独立窗口**，每条窗口独立命名：

```
windowKey   // spring_1 / autumn_1 等稳定标识
windowStart // 'MM-DD'
windowEnd   // 'MM-DD'
```

唯一约束为：

```
@@unique([cropId, climateZoneCode, startMethod, windowKey])
```

**禁止**将多个窗口合成为一个连续区间（如 `03-01 → 09-30` 覆盖整个夏季）。

### startMethod 不允许 `either`

```
SowingCalendar.startMethod ∈ { nursery_plant, direct_seed }   // schema invariant
```

`either` 只允许出现在 `Crop.recommended_start_method`（作物总体允许方式）。Calendar 只描述「某一种具体开始方式什么时候可用」。

引擎遇到 `Crop.recommended_start_method = either` 时分别查询 nursery / direct_seed 日历行（AC-24）。

### Gate 测试

- 同 crop/zone/method 两个独立窗口可以共存。
- 春秋双窗口中，夏季日期不得被误判 `in_window`。
- `SowingCalendar.startMethod` 不允许 `either`（插入校验 / 数据检查）。

## AC-28 「近 3 天天气」语义冻结

### 窗口定义

```
今天 + 未来 2 天 = 3 个本地日历日（Asia/Shanghai）
```

### WeatherProvider 最小结构

```ts
interface DailyWeather {
  date: string;        // Asia/Shanghai date
  tempMinC?: number;
  tempMaxC?: number;
  frostRisk?: boolean | 'unknown';
}
```

### 温度聚合（pure function，可测试）

```
daily_mean = (temp_min + temp_max) / 2
three_day_mean = 可用 daily_mean 的平均值（缺失天不计入）
```

- 3 天数据完整 → 执行温度 hard filter（`three_day_mean` 超出 `tempMin/tempMax` → `weather_assessment=temp_out_of_range`）。
- 只有 1–2 天温度数据（partial）→ **不执行温度 hard filter**，仅输出「天气信息不完整」warning，`weather_assessment=unknown`。
- 0 天温度数据 → `weather_data_status=unavailable`，所有 weather filter 失效。

### frost 聚合（pure function，可测试）

```
覆盖的 3 个日历日都有明确 frost 数据：
  任一天 true  → frost_risk = true
  全部 false  → frost_risk = false
存在 unknown / 缺数据：
  → frost_risk = unknown
```

**unknown 永远不能自动变成 false。**

## AC-29 有 TerraceProfile 时必须复用已冻结 sunlight engine

**禁止自创一套「季节性日照评分」（如 seasonalSunScore / 日照 5 分制）。**

Seasonal Engine 必须**复用 Slice 1 已冻结的 `assessSunlight()`**（MATCH / BORDERLINE / LIKELY_NO_MATCH / NO_MATCH + source / confidence 全套规则）。

有 TerraceProfile：

```
MATCH            → 正常
BORDERLINE       → 保留 + 降权
LIKELY_NO_MATCH  → 保留 + 强降权 / 风险提示
NO_MATCH         → 按已有可信度规则处理（Seasonal 只做增强，不决定候选资格）
```

无 TerraceProfile：

```
→ 不运行日照判断
→ 使用中性排序因素
→ 绝不构造假的 4–6h
```

**目标**：同一个露台，蓝莓页面说 BORDERLINE，季节推荐页面不得因为另一套算法说「日照非常适合」。

Gate 测试：同一 TerraceProfile 的 sunlight 状态与多年生判定一致。

## AC-30 supported-cities 数据驱动契约

`GET /api/location/supported-cities` 返回系统确实有 climate mapping 的城市列表（从 `ClimateZone.cityCodes` 推导）。前端**不得硬编码城市列表**。

自动测试：

- supported list 只包含有 climate mapping 的城市。
- 用户手选 `city_code` 与 LocationResolver 得到的同 `city_code` → 推荐结果一致。

---

# 6. Delivery Gate

Slice 3 最终交付时，Delivery Report 必须给出：

```text
final main HEAD SHA
npm ci
fresh DB: migrate deploy + seed
Slice1/Slice2-upgrade DB: migrate deploy + data-preservation check
test:slice2-gate
test:slice3-gate
test:unit
test:integration
test:e2e
test:h5
test:browser
test:all
server build
h5 build
```

同时证明 ZIP/repository 不含 `.env`、node_modules、dist、`.DS_Store`、secrets、本机绝对路径。

每条核心 AC 必须在 Delivery Report 中对应：

```text
AC → 实现位置 → 自动化测试 → 测试结果
```

没有自动化测试的明确写 `NOT AUTOMATED`，不得默认算通过。

# 7. Definition of Done

只有同时满足才可 FREEZE：

A. 番茄/胡萝卜/花生/生菜是数据驱动作物（无 crop-specific if/else）。
B. 完整链路（定位/选城市 → city_code → climate_zone → weather → 推荐）结构化可用。
C. 天气 Provider 隔离，`weather_data_status` 三态正确，`weather_assessment` 独立，失败可降级。
D. 未覆盖城市明确 `unsupported` 且 `recommendations=[]`，不伪造推荐。
E. `either` 语义正确（available_start_methods 由 calendar 命中决定），SowingCalendar 无 `either`。
F. SowingCalendar 支持 0–N 窗口，夏季不被误判，治理与 FK 正确。
G. 有 TerraceProfile 时复用已冻结 sunlight engine（与多年生判定一致）。
H. 排序 deterministic，资格与排序分离表达。
I. Slice 1 / Slice 2 全部回归保持通过。
J. 两条真实 Playwright 路径通过。

全部满足：**Slice 3 = ACCEPTED**，否则不进入 Slice 4。
