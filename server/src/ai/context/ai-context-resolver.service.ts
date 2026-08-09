import { Injectable } from '@nestjs/common';
import { RecommendationDataService } from '../../recommendations/recommendation-data.service';
import { SeasonsService } from '../../seasons/seasons.service';
import { PlantingsService } from '../../plantings/plantings.service';
import type { AskAiDto } from '../dto/ask-ai.dto';
import { AiContextResolveResult, AiGroundedContext } from './ai-context.types';
import { makeFact, stableStringify, sha256 } from './ai-facts';

function nonEmpty<T>(items: Array<T | null>): T[] {
  return items.filter((item): item is T => item !== null);
}

function textList(value: unknown): string {
  return Array.isArray(value) ? value.filter(Boolean).join('、') : String(value ?? '');
}

@Injectable()
export class AiContextResolverService {
  constructor(
    private readonly recommendations: RecommendationDataService,
    private readonly seasons: SeasonsService,
    private readonly plantings: PlantingsService,
  ) {}

  async resolve(userId: string, dto: AskAiDto): Promise<AiContextResolveResult> {
    switch (dto.context_type) {
      case 'perennial_plan':
        return this.resolvePerennialPlan(userId, dto);
      case 'seasonal_item':
        return this.resolveSeasonalItem(userId, dto);
      case 'planting_now':
        return this.resolvePlantingNow(userId, dto);
    }
  }

  private async resolvePerennialPlan(userId: string, dto: AskAiDto): Promise<AiContextResolveResult> {
    const plan = await this.recommendations.build(userId, dto.crop_id!, {
      selected_container_type_id: dto.selected_container_type_id,
      selected_variety_id: dto.selected_variety_id,
    });
    if (!plan) return insufficient();

    const selectedContainer = plan.container
      ? [...plan.container.preferredTypes, ...plan.container.acceptableTypes]
          .find((type) => type.id === plan.container?.selected_type_id)
      : null;
    const partners = plan.pollination.recommended_partners.map((partner) => partner.name);
    const mixNames = plan.soil_mix?.mix.map((mix) => mix.material) ?? [];
    const missingNames = plan.missing_materials.map((missing) => missing.material);

    const facts = nonEmpty([
      makeFact('perennial.suitability', '适合度', plan.suitability),
      makeFact('perennial.sunlight_status', '日照判定', plan.sunlight_status.status),
      makeFact('perennial.sun_hours_min', '最少日照', plan.sunlight_status.hours_range[0], 'h'),
      makeFact('perennial.sun_hours_max', '最多日照', plan.sunlight_status.hours_range[1], 'h'),
      makeFact('perennial.selected_variety_id', '选中品种', plan.selected_variety_id, null,
        plan.recommended_varieties.map((v) => v.name)),
      makeFact('perennial.recommended_varieties', '推荐品种', plan.recommended_varieties.map((v) => v.name).join('、')),
      makeFact('perennial.pollination_need_two', '是否需要两株授粉', plan.pollination.need_two),
      makeFact('perennial.pollination_partners', '授粉搭档', partners.join('、'), null, partners),
      makeFact('perennial.container_type', '容器类型', selectedContainer?.name, null, selectedContainer ? [selectedContainer.id] : []),
      makeFact('perennial.container_volume', '建议容积', plan.container ? plan.container.volumeRange.join('-') : null, 'L'),
      makeFact('perennial.water_risk', '积水风险', plan.water_risk?.level),
      makeFact('perennial.soil_mix', '配土材料', mixNames.join('、'), null, mixNames),
      makeFact('perennial.missing_materials', '缺少材料', missingNames.join('、'), null, missingNames),
      makeFact('perennial.next_action', '下一步', plan.next_action),
      makeFact('perennial.reasons', '推荐理由', plan.reasons.slice(0, 3).join('；')),
    ]);
    if (facts.length === 0) return insufficient();
    return grounded('perennial_plan', {
      crop_id: dto.crop_id!,
      selected_container_type_id: dto.selected_container_type_id ?? '',
      selected_variety_id: dto.selected_variety_id ?? '',
    }, facts, plan.warnings, plan);
  }

  private async resolveSeasonalItem(userId: string, dto: AskAiDto): Promise<AiContextResolveResult> {
    const result = await this.seasons.now(dto.city_code!, userId);
    if (result.climate_data_status === 'unsupported') return insufficient();
    const item = result.items?.find((candidate: any) => candidate.crop_id === dto.crop_id);
    if (!item) return insufficient(result.warnings ?? []);
    const facts = nonEmpty([
      makeFact('seasonal.date', '日期', result.date),
      makeFact('seasonal.city_code', '城市', result.city_code),
      makeFact('seasonal.weather_data_status', '天气数据状态', result.weather_data_status),
      makeFact('seasonal.crop_name', '作物', item.crop_name),
      makeFact('seasonal.start_method', '建议开始方式', item.start_method),
      makeFact('seasonal.available_start_methods', '当前可用开始方式', textList(item.available_start_methods), null, item.available_start_methods ?? []),
      makeFact('seasonal.season_status', '季节窗口', item.season_status),
      makeFact('seasonal.weather_assessment', '天气判断', item.weather_assessment),
      makeFact('seasonal.difficulty', '难度', item.difficulty),
      makeFact('seasonal.rank', '排序', item.rank),
      makeFact('seasonal.reasons', '排序理由', textList((item.reasons ?? []).slice(0, 3))),
    ]);
    if (facts.length === 0) return insufficient(result.warnings ?? []);
    return grounded('seasonal_item', {
      city_code: dto.city_code!,
      crop_id: dto.crop_id!,
    }, facts, [...(result.warnings ?? []), ...(item.warnings ?? [])], item);
  }

  private async resolvePlantingNow(userId: string, dto: AskAiDto): Promise<AiContextResolveResult> {
    const now = await this.plantings.now(userId, dto.planting_id!);
    if (now.status === 'lifecycle_unavailable') return insufficient(now.warnings ?? []);
    const actions = now.actions ?? [];
    const completed = now.completed_action_keys ?? [];
    const facts = nonEmpty([
      makeFact('planting.status', '种植状态', now.status),
      makeFact('planting.as_of_date', '当前日期', now.as_of_date),
      makeFact('planting.current_stage', '当前阶段', now.current_stage?.stage_name, null, now.current_stage ? [now.current_stage.stage_key] : []),
      makeFact('planting.actions', '当前操作', actions.join('、'), null, actions),
      makeFact('planting.completed_actions', '已完成操作', completed.join('、'), null, completed),
      makeFact('planting.next_stage', '下一阶段', now.next_stage?.stage_name, null, now.next_stage ? [now.next_stage.stage_key] : []),
    ]);
    if (facts.length === 0) return insufficient(now.warnings ?? []);
    return grounded('planting_now', { planting_id: dto.planting_id! }, facts, now.warnings ?? [], now);
  }
}

function insufficient(warnings: string[] = []): AiContextResolveResult {
  return { grounded: false, warnings };
}

function grounded(
  contextType: AiGroundedContext['contextType'],
  contextRefs: Record<string, string>,
  facts: AiGroundedContext['facts'],
  warnings: string[],
  source: unknown,
): AiContextResolveResult {
  const canonicalMaterial = {
    contextType,
    contextRefs,
    facts: facts.map((fact) => ({
      fact_id: fact.fact_id,
      label: fact.label,
      value: fact.value,
      unit: fact.unit,
      allowed_terms: [...fact.allowed_terms].sort(),
    })),
    source_hash: sha256(stableStringify(source)),
  };
  return {
    grounded: true,
    context: { contextType, contextRefs, facts, warnings, canonicalMaterial },
    warnings,
  };
}
