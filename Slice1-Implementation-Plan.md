# Slice 1 Implementation Plan — 蓝莓纵向切片

> 基线：`露台种植产品-系统架构设计-v1.4.md`（冻结）+ v1.3（被引用细节）。
> 结论：**未发现架构阻塞问题**，可直接按冻结方案编码。

---

## 0. 架构符合性确认

v1.4 通读结论：

- 主链路（H5 → NestJS → 推荐/配土引擎 → PostgreSQL）可实现，无冲突。
- 未发现需要微服务 / Redis / MQ / ES / 向量库 / K8s 的点。
- **一处小的实现层补充（非架构修改，先披露）**：v1.3 H3–H5 需要排水/透气/保水的"目标区间" [D_min, D_max] 等，但 v1.4 §3.14 的 `SoilRecipeTemplate` 未声明该字段存放位置。最小处理：在 `SoilRecipeTemplate` 上增加一个 `target_properties jsonb` 列（`{drainage:[min,max], aeration:[min,max], retention:[min,max]}`），作为**数据**录入，不改任何引擎逻辑。这不改变任何实体关系、不影响其他模块。若你不同意，可改为引擎内置常量，但会违背"规则存数据不存代码"的原则。
- **范围收窄（按你本次指令）**：v1.4 §11 的 Slice 1 包含 `PlantingRecord` 生命周期与 `/plantings/:id/now`，但你本次定义的开发路径**到方案卡为止**。本次不实现 PlantingRecord / LifecycleTemplate / PlantingEvent，列入"本次不实现"。

## 1. 项目目录结构

```
2026-08-08-12-56-04/                     （workspace root）
├── docker-compose.yml                   （postgres:16，单容器）
├── package.json                         （root scripts: dev/seed/test，一条命令启动）
├── Slice1-Implementation-Plan.md        （本文件）
├── server/                              （NestJS 单体）
│   ├── prisma/
│   │   ├── schema.prisma                （Slice 1 实体）
│   │   └── seed.ts                      （蓝莓 DEV_FIXTURE）
│   ├── src/
│   │   ├── main.ts / app.module.ts / prisma.service.ts
│   │   ├── engines/                     （纯函数库，无 NestJS 依赖）
│   │   │   ├── soil-engine/             （types/candidates/solver/fallback/index + spec）
│   │   │   └── recommend-engine/        （sunlight/container/water-risk/varieties/plan + spec）
│   │   └── modules/
│   │       ├── auth/                    （匿名身份 + JWT）
│   │       ├── terrace/                 （档案 upsert + 日照辅助估算）
│   │       ├── catalog/                 （crops / varieties 只读）
│   │       ├── material/                （材料列表 + 用户材料勾选）
│   │       ├── recommendation/          （POST /recommendations/perennial 管线组装）
│   │       └── soil/                    （POST /soil/calculate）
│   └── test/                            （API 级 supertest）
└── h5/                                  （Vue3 + Vite + Vant + TS）
    └── src/
        ├── api.ts / router.ts / main.ts
        └── views/ Home / TerraceWizard / PerennialPlan / Mine
```

## 2. Slice 1 数据库实体（Prisma）

按指令清单实现，只建本切片用到的表：

| 实体 | 用途 | 备注 |
|---|---|---|
| User / UserIdentity | 匿名身份 | provider='anonymous_device' |
| TerraceProfile | 日照四元组 + 原始回答 + 淋雨 | 严格按 §3.9 |
| SunLevelMap | level → hours 区间 | 配置数据表 |
| SunEstimateRule | (orientation × time_obs) → 区间+置信度 | 配置数据表，含 unknown 组合 |
| ClimateZone | 分区 → 冬季需冷估值 / 夏季热度等级 | 最小实现（品种匹配需要） |
| Crop | 蓝莓 | requires_acidification=true |
| Variety | 3 个测试品种 | 无 is_default |
| AttributeDefinition / VarietyTrait | chill_hours_min / heat_tolerance / shade_tolerance | key 受治理 |
| PollinationProfile / PollinationCompatibility | 授粉自身属性 + 品种间关系 | v1.4 拆分版 |
| EnvironmentRequirement | min_sun_hours=6 等 | crop 级 |
| ContainerType / ContainerModifier | 3 种容器 + 修正规则 | |
| ContainerRequirement | 蓝莓 crop 级 + 1 条 variety 级覆盖 | v1.4 新增实体 |
| SubstrateMaterial | 8 种基质 | |
| MaterialCropRule | recommended/allowed/caution/avoid | |
| MaterialSubstitution | 无 ratio_factor | v1.4 修正版 |
| SoilRecipeTemplate / SoilRecipeSlot | 蓝莓配方模板 | + target_properties（见 §0 披露） |
| WaterRiskConfig | 积水风险查表 | 种子程序按规则批量生成档位行 |
| UserMaterialInventory | 用户勾选已有材料 | |
| EvidenceSource / FactEvidence | 覆盖 chill_hours、容器推荐字段 | source_type 如实标注 |

**不建**：SowingCalendar、LifecycleTemplate/Stage、PlantingRecord/Event、Reminder、ContentReviewLog（治理字段本身保留在各表上）。

### 治理字段与 DEV_FIXTURE 标记

所有农业事实表带 `source / review_status / confidence / version / updated_at`。
本次种子数据**全部**为：

```
review_status = 'draft'        -- 不是 APPROVED_CONTENT
source        = 'manual'
confidence    = 1..2           -- 开发者估计值，非农业事实
```

引擎服务层查询规则：`review_status='approved'` 或（`APP_ENV=development` 且显式开启 `ALLOW_DRAFT_FIXTURES=true`）。**默认开发配置允许 draft fixture 进入引擎，仅用于程序验证**；`.env` 与种子输出中明确打印 "DEV_FIXTURE, NOT APPROVED CONTENT"。生产构建不含此开关。

## 3. Slice 1 API

```
POST /api/auth/anonymous            → {token}        首次访问自动建 User+Identity
POST /api/terraces                  → upsert 档案（含日照四元组+原始回答）
GET  /api/terraces/mine             → 我的档案
GET  /api/crops?life_type=perennial → 作物列表（蓝莓）
GET  /api/crops/:id/varieties       → 品种+Trait
GET  /api/materials                 → 全部基质材料（勾选列表用）
GET  /api/users/me/materials        → 我已勾选
PUT  /api/users/me/materials        → 保存勾选 {material_ids:[]}
POST /api/recommendations/perennial → 完整方案管线（日照四态→品种排序→容器→配土→积水→方案卡 JSON）
POST /api/soil/calculate            → 换容器/换材料后重算配土+积水风险
```

不做：`/api/recommendations/seasonal`、`/api/plantings/*`、`/api/ai/ask`。

## 4. H5 页面

1. **Home**：顶条（城市选择）+ 大卡 A「多年生露台方案」（蓝莓入口）。大卡 B 占位显示"即将上线"，不可点。
2. **TerraceWizard**（最少 2 问最多 4 问）：
   - Q1「每天大概能晒多久太阳？」4 个生活化选项 + 「我不确定」；
   - Q2（仅"不确定"展开）：朝向（南/东/西/北/不知道）+ 晒太阳时段（上午/中午后/全天/不知道）；
   - Q3：是否直接淋雨；
   - 保存原始回答 + source + confidence + 区间。
3. **PerennialPlan**（方案卡，结构化渲染，无大段文章）：
   - 适不适合（四态横幅 + 一句提示）
   - 推荐品种（排序卡 + reasons）
   - 用什么盆（可切换容器 → 触发重算）
   - 怎么配土（比例条 + 升数）
   - 还缺什么（missing 清单）
   - 积水风险（等级 + 缓解措施）
   - 下一步（next_action）
   - 材料勾选（PopupChecklist，勾选即重算）
4. **Mine**：我的档案（可改日照 → 方案自动更新）、我的材料。

## 5. 推荐引擎函数（`server/src/engines/recommend-engine/`，纯函数）

```ts
estimateSunlight(orientation, timeObs, rules)          → {level, hoursMin, hoursMax, confidence}
levelToHours(level, levelMap)                          → {hoursMin, hoursMax}
assessSunlight({hoursMin, hoursMax, confidence}, minSunRequired, weights)
                                                     → {status: MATCH|BORDERLINE|NO_MATCH|LIKELY_NO_MATCH, weight, message}
rankVarieties(varietiesWithTraits, climateZone, sunlightStatus)
                                                     → [{varietyId, score, reasons[]}]
recommendContainer(requirements[], containerTypes)     → {volumeRange, preferredTypes[], avoidTypes[], supportRequired, repotNote, reason}
assessWaterRisk(sensitivity, containerDrainage, mixDrainage, rainExposed, riskConfig)
                                                     → {level: low|mid|high, mitigation[]}
resolvePollination(profile, compatibilities, allVarieties)
                                                     → {needTwo, recommendedPartners[], note}
buildPerennialPlan(input)                              → PlanCard JSON（Step 1–7 管线组装）
```

## 6. 配土引擎函数（`server/src/engines/soil-engine/`，纯函数）

```ts
generateCandidates(input)        → 候选材料集（模板 ∪ 已有 ∪ 替代 − avoid）
enumerateCompositions(materials) → 5% 粒度组合枚举（≤4 种非零材料）
checkHardConstraints(x, ctx)     → H1–H7（含 ContainerModifier 修正后的槽位界）
scoreQuality(x, ctx)             → Layer 2：与目标中心欧氏距离 + caution 惩罚
solve(input)                     → 分层筛选：L2 Top20 → L3 已有材料最大化 → L4 缺料最少 → L5 配方最简
solveWithFallback(input)         → 无解降级 L1→L2→L3→L4，feasibility 正确标注
```

输出：`{mix[], missing[], substitutions_applied[], need_acidification, ph_management_note, feasibility, reasons[]}`。

## 7. 初始蓝莓测试数据（全部 DEV_FIXTURE / draft）

- **Crop**：蓝莓（acid_required, requires_acidification=true, waterlogging_sensitivity=4, min_sun 6h）
- **Variety ×3**：奥尼尔（低需冷/耐热/早熟）、薄雾（低需冷/中熟）、北蓝（高需冷/耐寒/晚熟/紧凑）
- **AttributeDefinition**：chill_hours_min、heat_tolerance、shade_tolerance
- **ContainerType ×3**：塑料盆（保水强排水弱）/ 陶土盆 / 无纺布美植袋（排水透气强保水弱）+ ContainerModifier
- **SubstrateMaterial ×8**：泥炭、椰糠、珍珠岩、松鳞、蛭石、松针土、粗沙(caution)、园土(avoid)
- **MaterialCropRule**：蓝莓 × 上述材料分级
- **MaterialSubstitution**：椰糠↔泥炭（base）、蛭石→珍珠岩（drainage）等，无 ratio_factor
- **SoilRecipeTemplate**：base 40–60 / drainage 20–35 / organic 10–25 / retention 0–15，base_volume 30L
- **WaterRiskConfig**：按敏感度×容器排水×配方排水×淋雨 档位批量生成
- **SunLevelMap / SunEstimateRule**：LOW 0–2 / SHORT 2–4 / MEDIUM 4–6 / LONG 6–9；unknown+unknown → 2–6 low（对应验收 V4）；北向 → 0–2 low（对应 V3）
- **ClimateZone ×3**（华东/华南/华北 最小集，城市下拉用）
- **EvidenceSource ×2（source_type='ai_synthesis'，如实标注）+ FactEvidence** 覆盖 chill_hours 与容器 min_volume

## 8. 自动化测试范围

**soil-engine（Vitest，纯函数）** — 对应你的 Case 1–7：
1. 材料齐全 → feasibility='optimal'，missing 为空
2. 部分材料 → 有解，missing 正确
3. 已有材料含 caution → 有解但 reasons/惩罚体现，且优先避开 caution
4. 已有材料含 avoid → 该材料被硬排除，不进配方
5. 替代材料成案 → feasibility='substituted'，substitutions_applied 正确
6. 无可行方案 → L1→L2→L3 降级链，feasibility='fallback'
7. 换容器（塑料密封盆 vs 无纺布袋）→ 配方保水/排水比例正确变化（对应 V6）

**recommend-engine（Vitest）**：
- 直答 4–6h vs 需求 6h → BORDERLINE（V1）；6–8h → MATCH（V2）
- 北向低置信 → LIKELY_NO_MATCH（V3）；两问不知 → 2–6h BORDERLINE+"建议先观察"（V4）
- 不同品种因 chill_hours/heat_tolerance 在不同分区排序不同，reasons 可解释
- cross_required=true → need_two=true + 搭档（V11 逻辑）
- ContainerRequirement：variety 级覆盖优先于 crop 级

**API 测试（supertest + 临时库）**：匿名身份→建档→推荐→换材料重算全链路；改档案日照后判定更新（V12）。

## 9. 实施顺序

```
Schema → migrate → Seed(fixture) → soil-engine + 单测 → recommend-engine + 单测
→ API 模块 → API 测试 → H5 页面 → 浏览器端到端 → Delivery Report
```

## 10. 本次不实现（防范围膨胀）

- DeepSeek / AI 问答 / 解释 / Multi-Agent / RAG / Embedding（Slice 5）
- 微信小程序、订阅消息、推送调度器
- 季节性快速推荐、首页大卡 B 功能（Slice 3）
- PlantingRecord / 生命周期 / `/plantings/:id/now`（v1.4 原属 Slice 1，按你本次路径定义推迟，随 Slice 4 做）
- SowingCalendar、ContentReviewLog 表
- 自动定位（用城市下拉替代）、天气 API
- 电商 / SKU、账号合并界面、绑定手机
- pH 测量与校正
- 视觉精修（动效/插画/渐变）
