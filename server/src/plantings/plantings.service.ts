import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AgriDataService } from '../agri-data.service';
import { RecommendationDataService } from '../recommendations/recommendation-data.service';
import { resolveLifecycle } from '../engines/lifecycle-engine';

const START_METHOD = 'nursery_plant';

@Injectable()
export class PlantingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly agri: AgriDataService,
    private readonly recommendationData: RecommendationDataService,
  ) {}

  /** Resolve a planting owned by the current user, else 404 (S2-AC-19 unified). */
  private async getOwnedPlanting(userId: string, plantingId: string) {
    const planting = await this.prisma.plantingRecord.findUnique({
      where: { id: plantingId },
      include: { events: true },
    });
    if (!planting || planting.userId !== userId) {
      throw new NotFoundException('Planting not found');
    }
    return planting;
  }

  /**
   * Create a planting record. Validates governance + recommendation state so
   * a NO_MATCH or arbitrary crop cannot produce a fake-looking planting.
   */
  async create(userId: string, body: {
    terrace_id: string;
    crop_id: string;
    variety_id?: string | null;
    container_type_id: string;
    start_date: string;
    client_request_id?: string;
  }) {
    const { crop_id: cropId, container_type_id: containerTypeId, variety_id, start_date } = body;

    // Idempotency (S2-AC-05): same user + client_request_id -> return existing.
    if (body.client_request_id) {
      const existing = await this.prisma.plantingRecord.findUnique({
        where: { userId_clientRequestId: { userId, clientRequestId: body.client_request_id } },
      });
      if (existing) {
        return { planting: existing, created: false };
      }
    }

    const terrace = await this.prisma.terraceProfile.findFirst({
      where: { id: body.terrace_id, userId },
    });
    if (!terrace) throw new BadRequestException('Invalid terrace');

    const crop = await this.agri.getCrop(cropId);
    if (!crop) throw new BadRequestException('Crop not found or not approved');

    const startDate = new Date(start_date + 'T00:00:00.000Z');
    if (Number.isNaN(startDate.getTime())) {
      throw new BadRequestException('Invalid start_date');
    }

    // Re-run recommendation to verify the plan is not NO_MATCH (S2-AC-06).
    const recommendation = await this.recommendationData.build(userId, cropId, {
      selected_container_type_id: containerTypeId,
      selected_variety_id: variety_id ?? null,
    });
    if (!recommendation || recommendation.suitability === 'unsuitable') {
      throw new BadRequestException('Cannot start planting: sunlight is not suitable');
    }

    // Variety validation: if given, must belong to the crop (governed list).
    let varietyId: string | null = variety_id ?? null;
    if (varietyId) {
      const varieties = await this.agri.listVarieties(cropId);
      const ok = varieties.some((v) => v.id === varietyId);
      if (!ok) throw new BadRequestException('Variety not part of this crop');
    }

    // Lifecycle: variety-level > crop-level (S2-AC-07). If none -> unavailable.
    const lifecycle = await this.agri.getLifecycleTemplate(cropId, varietyId, START_METHOD);
    if (!lifecycle || lifecycle.stages.length === 0) {
      // Still create a record so the user sees a clear unavailable state?
      // S2-AC-07/14 require explicit lifecycle_unavailable instead of fabricating.
      // We create the record with status=lifecycle_unavailable.
      const planting = await this.prisma.plantingRecord.create({
        data: {
          userId,
          terraceId: terrace.id,
          cropId,
          varietyId,
          containerTypeId,
          startMethod: START_METHOD,
          startDate,
          status: 'lifecycle_unavailable',
          lifecycleTemplateId: lifecycle?.id ?? 'none',
          lifecycleVersion: lifecycle?.version ?? 0,
          clientRequestId: body.client_request_id || null,
        },
      });
      return { planting, created: true };
    }

    // Pin the lifecycle version at creation (S2-AC-15).
    const planting = await this.prisma.plantingRecord.create({
      data: {
        userId,
        terraceId: terrace.id,
        cropId,
        varietyId,
        containerTypeId,
        startMethod: START_METHOD,
        startDate,
        status: 'active',
        lifecycleTemplateId: lifecycle.id,
        lifecycleVersion: lifecycle.version,
        clientRequestId: body.client_request_id || null,
      },
    });
    return { planting, created: true };
  }

  /** GET /plantings/:id — basic detail (owner only). */
  async getOne(userId: string, plantingId: string) {
    const planting = await this.getOwnedPlanting(userId, plantingId);
    return planting;
  }

  /** GET /plantings/:id/now — backend is the single source of truth. */
  async now(userId: string, plantingId: string) {
    const planting = await this.getOwnedPlanting(userId, plantingId);

    // Resolve pinned lifecycle (governance: approved or dev+draft allowed).
    const lifecycle = await this.agri.getLifecycleTemplateByIdAndVersion(
      planting.lifecycleTemplateId,
      planting.lifecycleVersion,
    );

    const asOf = new Date();
    if (!lifecycle || lifecycle.stages.length === 0) {
      return {
        planting_id: planting.id,
        status: 'lifecycle_unavailable',
        as_of_date: asOf.toISOString().slice(0, 10),
        current_stage: null,
        actions: [],
        completed_action_keys: [],
        next_stage: null,
        lifecycle_template_id: planting.lifecycleTemplateId,
        lifecycle_version: planting.lifecycleVersion,
        warnings: ['lifecycle_unavailable'],
      };
    }

    const res = resolveLifecycle(
      {
        id: lifecycle.id,
        version: lifecycle.version,
        startMethod: lifecycle.startMethod,
        stages: lifecycle.stages.map((s) => ({
          stageKey: s.stageKey,
          stageName: s.stageName,
          order: s.order,
          startOffset: s.startOffset,
          endOffset: s.endOffset,
          actions: (s.actions as string[]) || [],
          explanation: s.explanation,
        })),
      },
      planting.startDate,
      asOf,
      planting.events.map((e) => ({ actionKey: e.actionKey })),
    );

    return {
      planting_id: planting.id,
      status: res.status,
      as_of_date: asOf.toISOString().slice(0, 10),
      current_stage: toStageContract(res.current_stage),
      actions: res.current_stage?.actions ?? [],
      completed_action_keys: res.completed_action_keys,
      next_stage: toStageContract(res.next_stage),
      lifecycle_template_id: lifecycle.id,
      lifecycle_version: lifecycle.version,
      warnings: res.warnings,
    };
  }

  /** POST /plantings/:id/events — record a completed action (idempotent). */
  async completeAction(userId: string, plantingId: string, body: {
    action_key: string;
    client_event_id?: string;
    note?: string;
  }) {
    const planting = await this.getOwnedPlanting(userId, plantingId);

    // Idempotency (S2-AC-17): same planting + client_event_id -> return existing.
    if (body.client_event_id) {
      const existing = await this.prisma.plantingEvent.findUnique({
        where: { plantingId_clientEventId: { plantingId, clientEventId: body.client_event_id } },
      });
      if (existing) {
        return { event: existing, created: false };
      }
    }

    // The action must exist in the PINNED lifecycle (S2-AC-18).
    const lifecycle = await this.agri.getLifecycleTemplateByIdAndVersion(
      planting.lifecycleTemplateId,
      planting.lifecycleVersion,
    );
    const knownActions = new Set<string>();
    for (const s of lifecycle?.stages ?? []) {
      for (const a of (s.actions as string[]) || []) knownActions.add(a);
    }
    if (!knownActions.has(body.action_key)) {
      throw new BadRequestException(`Unknown action: ${body.action_key}`);
    }

    const event = await this.prisma.plantingEvent.create({
      data: {
        plantingId,
        actionKey: body.action_key,
        eventType: 'action_completed',
        note: body.note || null,
        clientEventId: body.client_event_id || null,
      },
    });
    return { event, created: true };
  }

  /** GET /users/me/plantings */
  async listMine(userId: string) {
    return this.prisma.plantingRecord.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }
}

/** Map engine camelCase stage to the snake_case API contract (S2-AC-13). */
function toStageContract(s: {
  stageKey: string;
  stageName: string;
  order: number;
  startOffset: number;
  endOffset: number;
  actions: string[];
  explanation?: string | null;
} | null) {
  if (!s) return null;
  return {
    stage_key: s.stageKey,
    stage_name: s.stageName,
    order: s.order,
    start_offset: s.startOffset,
    end_offset: s.endOffset,
    actions: s.actions,
    explanation: s.explanation ?? null,
  };
}
