# Terrace Expansion Epic v0.1

> Status: DRAFT / EPIC ALIGNMENT ONLY
> Created: 2026-08-09
> Scope: future terrace planting expansion after Slice 5 PASS/FROZEN
> This is not Slice 6 Acceptance Criteria and is not approved for implementation.

This document records the confirmed product direction at epic level. It captures
the intended information architecture, data direction, governance posture, and a
possible slice route. Each future slice must still get its own acceptance
criteria, delivery evidence, and scope boundary.

## 0. Supersession Contract

This epic supersedes earlier product direction only where it explicitly names a
change to:

- information architecture,
- top-level navigation,
- route ownership,
- first-screen/home entry,
- district/county location and weather behavior,
- future long-term A/B responsibility split.

All other Slice 1-5 PASS/FROZEN contracts remain valid, including agricultural
recommendation semantics, evidence governance, draft isolation, auth, CORS, rate
limit, health, CI, migrations, AI contracts, and delivery evidence rules.

Any change not explicitly listed in this epic must not be used to justify a
broad Slice 6 rewrite. If an implementation need conflicts with an earlier
Slice 1-5 closure or with a future slice boundary, work must stop and return to
the original slice closure or a new acceptance-criteria document.

Slice 6 baseline must be frozen by Slice 6 AC after the exact Slice 5 PASS/FROZEN
SHA is established. This epic does not replace or redefine that baseline.

## 1. Product Direction

The product becomes a terrace planting tool organized around three user jobs:

1. What can I plant now?
2. Which perennial fruit should I plan for my terrace?
3. What is my terrace profile, material inventory, and current planting state?

The top-level H5 navigation is three tabs:

```text
时令种植
长期种植
我的
```

There is no separate marketing-style home tab. The first screen should be a
usable product surface.

## 2. Top-Level Information Architecture

### 2.1 时令种植

Primary job: recommend seasonal crops for the user's selected district/county
and current date.

Responsibilities:

- first-use location entry,
- district/county weather context,
- today display including Gregorian date, lunar date, and solar term,
- current seasonal recommendations,
- empty-state recovery when nothing is currently recommended,
- crop detail from a seasonal recommendation,
- weather/climate availability warnings,
- selected district change.

Recommended route shape:

```text
/seasonal
/seasonal?admin_code=<district_admin_code>
/seasonal/crops/:cropId
```

Existing `/seasons/now` may be kept as a compatibility redirect or internal API
route, but the tab should use a stable product route.

### 2.2 长期种植

Primary job: plan and manage terrace-suitable perennial fruits.

This tab contains two responsibilities that must remain distinct:

#### 长期种植 A - 方案/选种

User job: "I want to know which perennial fruit and variety fits my terrace."

Responsibilities:

- perennial fruit catalog,
- crop and fine-grained variety selection,
- taste and eating-quality description,
- expected first-fruit cycle after transplanting a 2-3 year container nursery
  plant,
- environment fit,
- pollination requirements and partner notes,
- dormancy/chilling requirements,
- transplant timing and transplant notes,
- beginner care guidance,
- FAQ,
- purchase/evidence visibility for varieties,
- "确定种植" confirmation.

长期种植 A must not include:

- container recommendation,
- aeration/water-retention container selection,
- soil mix,
- pH plan,
- basal fertilizer,
- material shopping/checklist,
- final start planting.

Recommended route shape:

```text
/perennials
/perennials/catalog
/perennials/fruits/:cropId
/perennials/fruits/:cropId/varieties/:varietyId
```

Current equivalent is closest to `/plan/:cropId`, but future A pages must be
split before container/soil/fertilizer work begins.

#### 长期种植 B - 持久化方案草稿

User job: "I have chosen a perennial fruit/variety and need to finish the exact
terrace implementation plan before I actually start planting."

长期种植 B is created only after the user confirms A with "确定种植". It is a
persisted plan draft that can later become a confirmed plan and then an ongoing
planting record.

Responsibilities:

- persisted draft generated from confirmed A choice,
- container type: aeration-oriented or water-retention-oriented, both requiring
  drainage holes,
- water-retention-oriented means low-aeration, drainage-holed plastic or glazed
  pots,
- no-drain sealed containers are excluded,
- root depth requirement,
- container diameter,
- container volume,
- soil mix,
- pH plan,
- basal fertilizer,
- material list,
- missing material list,
- confirmed implementation plan,
- final "开始种植" action.

B does not define lifecycle/current-stage management. After final start
planting, lifecycle in-progress management may exist as a separate My-owned
planting detail surface.

Recommended route shape:

```text
/mine/perennial-drafts/:draftId
/mine/perennial-plans/:planId
/mine/plantings/:plantingId
```

Current equivalents are split across `/planting-start` and `/plantings/:id`.
Future slices should preserve redirects while making B a persisted draft/plan
surface rather than an in-memory transition page.

### 2.3 我的

Primary job: manage the user's terrace profile, materials, and local identity
state.

Responsibilities:

- profile create/edit,
- selected region/district,
- terrace environment attributes,
- material checkbox selection and save,
- material inventory status,
- B plan drafts,
- B confirmed plans,
- ongoing planting entry points,
- anonymous identity recovery surface if needed,
- basic settings and diagnostics.

Recommended route shape:

```text
/mine
/mine/terrace
/mine/materials
/mine/perennial-drafts/:draftId
/mine/perennial-plans/:planId
/mine/plantings/:plantingId
```

The 我的 tab is the owner of profile, terrace, materials, B plan drafts,
confirmed B plans, and ongoing planting entry points. Lifecycle in-progress
management may be a My-owned detail page, but it is not the definition of
长期种植 B.

## 3. Location, Weather, and Calendar

### 3.1 First-Use Location

First use should support:

- browser/device location when the user grants permission,
- clear fallback to popular cities,
- district selection after the user chooses a popular city,
- manual province -> city/prefecture -> district selection for ordinary regions,
- municipality -> district selection for direct-controlled municipalities, without
  emitting a fake city code,
- later change from 时令种植 and 我的.

The product must not dead-end when permission is denied or unavailable.

### 3.2 District/County Weather

The weather identity shown to users must always remain the district/county they
selected. The product must not silently replace that identity with a broader
administrative area.

Weather lookup always targets the selected district via the selected district's
`admin_code`, centroid, or provider location mapping. Weather lookup must never
use a climate proxy, broader city fallback, legacy city fallback, or
representative district.

Climate direct/nearest_proxy status belongs only to agricultural climate context
and can be disclosed separately from weather.

The weather context is used for recommendations and explanation context only
through governed server paths. H5 must not invent weather facts.

### 3.3 Small Climate-Zone Set With Nearest Proxy

The product should use a small number of governed climate zones rather than a
large unreviewed climate taxonomy.

Every enabled district without a direct agricultural-climate mapping MUST use a
deterministic nearest proxy when all of the following are true:

- the proxy rule is deterministic,
- the proxy target is stored,
- the response exposes a clear warning,
- downstream recommendation code can distinguish exact climate data from proxy
  climate data,
- the proxy can be audited and later replaced by governed local data.

`unsupported` is reserved for well-formed unknown or disabled `admin_code`
values. Syntactically invalid `admin_code` is a validation error and must return
400. `unsupported` must not be used for enabled districts that lack direct
mapping.

### 3.4 Today, Lunar Date, and Solar Term

The seasonal surface should show "today" as:

```text
Gregorian date + lunar date + solar term when available
```

Solar term and lunar display are product context. They must not silently become
agricultural decision facts unless governed evidence and rules explicitly use
them.

## 4. Terrace Profile Expansion

Terrace profile should expand from minimal city/sun/rain to a practical terrace
growing context.

Candidate fields:

- admin_code at selected district/county granularity,
- display region name,
- weather provider/location-mapping source,
- balcony/terrace type,
- floor height band,
- orientation,
- sun exposure level and confidence,
- observed sun time window,
- rain exposure,
- wind exposure,
- enclosure or glazing,
- available area,
- user-selected space and maximum container preference,
- water access,
- drainage constraints,
- trellis/support availability,
- existing containers,
- child/pet safety constraints if fertilizer or toxic plant guidance later needs
  it.

建档 district selection should auto-advance to the next step after the user
selects a district. It should not require a redundant "下一步" after an
unambiguous district selection.

The product must not decide whether a balcony or terrace is structurally safe.
Future B surfaces may display estimated filled-container weight and a clear prompt
for the user to verify building load limits before final planting.

## 5. Perennial Fruit Catalog Direction

The long-term catalog target is all terrace-suitable perennial fruits within the
Mainland China purchasable evidence context, captured as an auditable snapshot.

"All" does not mean an unknowable global complete set. In this epic, "all" means:

```text
all terrace-suitable perennial fruit items with Mainland purchasable evidence
context from named source lists and source queries as of the snapshot cutoff date
```

Every catalog expansion slice must record:

- source list names,
- query terms,
- platform or publication source,
- crawl/review date,
- cutoff date,
- inclusion rules,
- exclusion rules,
- reviewer or process identifier,
- source confidence,
- review status.

The first snapshot cutoff date for this epic direction is `2026-08-09` unless a
future slice explicitly supersedes it.

## 6. Mainland Ecommerce Evidence

Variety availability must be supported by Mainland China purchase evidence.
Accepted evidence channels:

- 淘宝 / Taobao,
- 天猫 / Tmall,
- 京东 / JD,
- 拼多多 / Pinduoduo,
- 抖音 / Douyin,
- 正规苗企,
- formal seedling/苗企 catalog pages,
- other explicitly reviewed Mainland channels added by a future slice.

Ecommerce evidence is used to decide whether a variety is realistically
available to users. It is not an ecommerce transaction feature. The product does
not need cart, checkout, affiliate links, price comparison, or order tracking in
this epic.

Evidence records should capture, at minimum:

- platform,
- seller or nursery name,
- item title,
- variety name as listed,
- listing URL or archived reference,
- observation date,
- availability signal,
- region/shipping limitation when visible,
- ambiguity notes,
- reviewer status.

## 7. Variety Publish State and Availability Gate

Perennial varieties should have separate agricultural review status and purchase
availability status.

Suggested publish states:

```text
draft
evidence_collecting
agri_reviewed
available_to_users
limited_availability
not_currently_available
rejected
retired
```

User-facing recommendation must only use varieties that satisfy both:

1. agricultural evidence governance for recommendation facts, and
2. purchase availability gate for Mainland users.

Initial availability gate:

- one official/formal nursery/正规苗企 evidence record, or
- two independent ordinary ecommerce seller evidence records.

The UI must distinguish:

- recommended and readily purchasable,
- suitable but limited availability,
- known variety but not currently recommended because purchase evidence is weak.

## 8. Agricultural Evidence Governance

The product remains evidence-governed.

Principles:

- AI-generated text is never an agricultural fact.
- Marketplace listing text is purchase evidence, not agricultural truth.
- Agricultural facts require governed source evidence and review status.
- Recommendation facts and ecommerce availability facts must be modeled
  separately.
- Draft-only content must not silently enter production recommendation output.
- Every "why" explanation must cite server-owned facts or return insufficient
  context.

Evidence types should include:

- agricultural production guidance,
- cultivar/variety traits,
- climate and chilling requirement evidence,
- terrace/container suitability,
- substrate and fertilizer guidance,
- ecommerce availability evidence,
- nursery catalog evidence,
- internal review notes.

## 9. Soil Mix and Basal Fertilizer Rework

配土 and 底肥 need a redesign before the expanded perennial catalog can be
credible.

Future soil/fertilizer work should cover:

- crop-level substrate requirements,
- variety-specific overrides only when evidence supports them,
- container effect on drainage/aeration/water retention,
- material availability from the user's inventory,
- missing material list,
- substitutions with penalties,
- pH management,
- organic amendment safety,
- basal fertilizer type and amount bands,
- fertilizer burn risk,
- slow-release vs organic basal fertilizer distinction,
- "do not add basal fertilizer" cases,
- beginner-safe warnings.

Soil and basal fertilizer rules must remain deterministic and evidence-governed.
They should not depend on AI prose.

## 10. Route and Navigation Transition

Target navigation after this epic:

```text
Tab 1: 时令种植 -> /seasonal
Tab 2: 长期种植 -> /perennials
Tab 3: 我的     -> /mine
```

Nested flows:

```text
/seasonal
/seasonal/crops/:cropId

/perennials
/perennials/catalog
/perennials/fruits/:cropId
/perennials/fruits/:cropId/varieties/:varietyId

/mine
/mine/terrace
/mine/materials
/mine/perennial-drafts/:draftId
/mine/perennial-plans/:planId
/mine/plantings/:plantingId
```

Compatibility redirects may preserve current routes:

```text
/ -> /seasonal
/seasons/now -> /seasonal
/plan/:cropId -> /perennials/fruits/:cropId
/planting-start -> /mine/perennial-drafts/:draftId when a draft exists
/plantings/:id -> /mine/plantings/:id
/terrace -> /mine/terrace or shared terrace wizard route
```

## 11. Candidate Slice Route

This is a roadmap, not Slice 6 AC.

### Slice 6 - Region-first Seasonal Home and Three-Tab IA

- Replace two-tab navigation with three-tab IA.
- Introduce product routes and redirects.
- Default `/` to `/seasonal`.
- Add nationwide district/county selection using `admin_code`.
- First-use location with permission and fallback to popular cities.
- Popular city selection still requires district selection.
- Manual selection must support ordinary province -> city/prefecture -> district
  and direct-controlled municipality -> district paths without fake city codes.
- District selection auto-advances in terrace/profile setup.
- Today's Gregorian/lunar/solar-term context display.
- District/county weather lookup must target the selected district by
  `admin_code`, centroid, or provider location mapping.
- Weather lookup must never use agricultural climate proxy, broader city
  fallback, legacy city fallback, or representative district.
- Small governed climate-zone set.
- Every enabled district without direct agricultural-climate mapping MUST use
  deterministic nearest proxy rules, warnings, and auditability.
- Unsupported status is only for well-formed unknown or disabled `admin_code`.
- Syntactically invalid `admin_code` must be a 400 validation error.
- Seasonal empty-state and proxy recovery behavior.

Slice 6 must stay limited to region, weather, calendar, three-tab navigation,
and Wizard changes. Long-term A/B flow, perennial catalog expansion, ecommerce
evidence, and soil/fertilizer work remain Future Slice 7-11 scope and must not
be pulled forward into Slice 6.

### Future Slice 7 - Long-Term A/B Data and Flow Skeleton

- Long-term A contains only crop/variety/taste/first-fruit/environment/
  pollination/dormancy/transplant/care/FAQ/confirmation.
- Long-term B is created only after A confirmation as a persisted draft.
- B contains container, root depth, diameter, capacity, soil, pH, basal
  fertilizer, materials, confirmed plan, and final start planting.
- Mine lists B drafts, confirmed B plans, and ongoing planting entry points.
- Lifecycle in-progress detail remains separate from the definition of B.

### Future Slice 8 - Perennial Catalog Snapshot

- Define source lists and cutoff date.
- Collect terrace-suitable perennial fruit candidates within the Mainland
  purchasable evidence context.
- Record inclusion/exclusion rules.
- Establish catalog review workflow.
- Keep "all" tied to auditable source snapshot, not an open-ended claim.

### Future Slice 9 - Variety Availability and Ecommerce Evidence

- Add ecommerce evidence model.
- Add formal nursery evidence model.
- Add variety publish states and availability gate.
- Apply the confirmed availability gate: one official/formal nursery record is
  enough; ordinary ecommerce requires two independent sellers.
- Expose availability status in long-term A.

### Future Slice 10 - Agricultural Evidence Governance Expansion

- Separate agricultural facts, marketplace availability facts, and review notes.
- Add governance views or scripts required for evidence review.
- Strengthen production draft isolation for expanded data.

### Future Slice 11 - Soil Mix and Basal Fertilizer Rework

- Redesign substrate and fertilizer models.
- Add deterministic rule engine changes.
- Add material inventory integration.
- Add beginner-safe warnings and missing-material outputs.
- Keep all soil/fertilizer output inside B, not A.

## 12. Non-Goals for This Epic

- No checkout, order placement, affiliate system, or ecommerce transaction flow.
- No automated scraping commitment without a future slice-level legal/ops review.
- No AI-generated agricultural facts.
- No open-domain crop chatbot.
- No image diagnosis.
- No mini-program or push notification commitment.
- No claim that the catalog is globally complete beyond the named source
  snapshot and cutoff date.

## 13. Epic Completion Definition

The epic is complete when future slices have produced:

- three-tab H5 navigation,
- district/county location and weather context,
- governed climate proxy behavior,
- lunar/solar-term display,
- expanded terrace profile,
- auditable perennial fruit catalog snapshot,
- variety availability gates with Mainland ecommerce/nursery evidence,
- evidence-governed agricultural facts,
- reworked soil and basal fertilizer recommendations,
- separated long-term A/B flows,
- Mine owning profile, terrace, materials, B drafts, confirmed B plans, and
  ongoing planting entry points,
- delivery reports and hosted CI evidence for each implemented slice.
