-- CreateTable
CREATE TABLE "LifecycleTemplate" (
    "id" TEXT NOT NULL,
    "cropId" TEXT NOT NULL,
    "varietyId" TEXT,
    "startMethod" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "reviewStatus" TEXT NOT NULL DEFAULT 'draft',
    "confidence" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "LifecycleTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LifecycleStage" (
    "id" TEXT NOT NULL,
    "lifecycleTemplateId" TEXT NOT NULL,
    "stageKey" TEXT NOT NULL,
    "stageName" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "startOffset" INTEGER NOT NULL,
    "endOffset" INTEGER NOT NULL,
    "actions" JSONB NOT NULL,
    "explanation" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "reviewStatus" TEXT NOT NULL DEFAULT 'draft',
    "confidence" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "LifecycleStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlantingRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "terraceId" TEXT NOT NULL,
    "cropId" TEXT NOT NULL,
    "varietyId" TEXT,
    "containerTypeId" TEXT NOT NULL,
    "startMethod" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "lifecycleTemplateId" TEXT NOT NULL,
    "lifecycleVersion" INTEGER NOT NULL,
    "clientRequestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlantingRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlantingEvent" (
    "id" TEXT NOT NULL,
    "plantingId" TEXT NOT NULL,
    "actionKey" TEXT NOT NULL,
    "eventType" TEXT NOT NULL DEFAULT 'action_completed',
    "happenedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "clientEventId" TEXT,

    CONSTRAINT "PlantingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LifecycleTemplate_cropId_varietyId_startMethod_idx" ON "LifecycleTemplate"("cropId", "varietyId", "startMethod");

-- CreateIndex
CREATE UNIQUE INDEX "LifecycleTemplate_cropId_varietyId_startMethod_version_key" ON "LifecycleTemplate"("cropId", "varietyId", "startMethod", "version");

-- CreateIndex
CREATE INDEX "LifecycleStage_lifecycleTemplateId_order_idx" ON "LifecycleStage"("lifecycleTemplateId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "LifecycleStage_lifecycleTemplateId_stageKey_key" ON "LifecycleStage"("lifecycleTemplateId", "stageKey");

-- CreateIndex
CREATE INDEX "PlantingRecord_userId_idx" ON "PlantingRecord"("userId");

-- CreateIndex
CREATE INDEX "PlantingRecord_cropId_idx" ON "PlantingRecord"("cropId");

-- CreateIndex
CREATE UNIQUE INDEX "PlantingRecord_userId_clientRequestId_key" ON "PlantingRecord"("userId", "clientRequestId");

-- CreateIndex
CREATE INDEX "PlantingEvent_plantingId_idx" ON "PlantingEvent"("plantingId");

-- CreateIndex
CREATE UNIQUE INDEX "PlantingEvent_plantingId_clientEventId_key" ON "PlantingEvent"("plantingId", "clientEventId");

-- AddForeignKey
ALTER TABLE "LifecycleTemplate" ADD CONSTRAINT "LifecycleTemplate_cropId_fkey" FOREIGN KEY ("cropId") REFERENCES "Crop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LifecycleTemplate" ADD CONSTRAINT "LifecycleTemplate_varietyId_fkey" FOREIGN KEY ("varietyId") REFERENCES "Variety"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LifecycleStage" ADD CONSTRAINT "LifecycleStage_lifecycleTemplateId_fkey" FOREIGN KEY ("lifecycleTemplateId") REFERENCES "LifecycleTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlantingRecord" ADD CONSTRAINT "PlantingRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlantingRecord" ADD CONSTRAINT "PlantingRecord_terraceId_fkey" FOREIGN KEY ("terraceId") REFERENCES "TerraceProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlantingRecord" ADD CONSTRAINT "PlantingRecord_varietyId_fkey" FOREIGN KEY ("varietyId") REFERENCES "Variety"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlantingEvent" ADD CONSTRAINT "PlantingEvent_plantingId_fkey" FOREIGN KEY ("plantingId") REFERENCES "PlantingRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
