-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "nickname" TEXT,
    "avatar" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "mergedIntoUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserIdentity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerUid" TEXT NOT NULL,
    "unionid" TEXT,
    "credentialMeta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TerraceProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '我的露台',
    "cityCode" TEXT NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "sunExposureLevel" TEXT NOT NULL,
    "sunHoursMin" DOUBLE PRECISION NOT NULL,
    "sunHoursMax" DOUBLE PRECISION NOT NULL,
    "sunSource" TEXT NOT NULL,
    "sunConfidence" TEXT NOT NULL,
    "sunOrientationRaw" TEXT,
    "sunTimeObsRaw" TEXT,
    "orientation" TEXT,
    "rainExposed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TerraceProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SunLevelMap" (
    "level" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "hoursMin" DOUBLE PRECISION NOT NULL,
    "hoursMax" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "SunLevelMap_pkey" PRIMARY KEY ("level")
);

-- CreateTable
CREATE TABLE "SunEstimateRule" (
    "id" TEXT NOT NULL,
    "orientation" TEXT NOT NULL,
    "timeObs" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "hoursMin" DOUBLE PRECISION NOT NULL,
    "hoursMax" DOUBLE PRECISION NOT NULL,
    "confidence" TEXT NOT NULL,

    CONSTRAINT "SunEstimateRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClimateZone" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cityCodes" JSONB NOT NULL,
    "chillHoursEstimate" INTEGER NOT NULL,
    "heatLevel" INTEGER NOT NULL,

    CONSTRAINT "ClimateZone_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "Crop" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "latinName" TEXT,
    "lifeType" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "difficulty" INTEGER NOT NULL,
    "familyUse" INTEGER NOT NULL,
    "yieldLevel" INTEGER NOT NULL,
    "harvestDaysMin" INTEGER,
    "harvestDaysMax" INTEGER,
    "containerFriendly" BOOLEAN NOT NULL DEFAULT true,
    "recommendedStartMethod" TEXT NOT NULL DEFAULT 'nursery_plant',
    "startMethodNote" TEXT,
    "waterloggingSensitivity" INTEGER NOT NULL,
    "acidityNeed" TEXT NOT NULL,
    "requiresAcidification" BOOLEAN NOT NULL DEFAULT false,
    "coverImage" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "reviewStatus" TEXT NOT NULL DEFAULT 'draft',
    "confidence" INTEGER NOT NULL DEFAULT 1,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Crop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Variety" (
    "id" TEXT NOT NULL,
    "cropId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "maturePeriod" TEXT,
    "plantHabit" TEXT,
    "containerFit" INTEGER,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "reviewStatus" TEXT NOT NULL DEFAULT 'draft',
    "confidence" INTEGER NOT NULL DEFAULT 1,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Variety_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttributeDefinition" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "valueType" TEXT NOT NULL,
    "unit" TEXT,
    "enumOptions" JSONB,
    "appliesToCropIds" JSONB,
    "usedIn" JSONB NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "reviewStatus" TEXT NOT NULL DEFAULT 'draft',
    "confidence" INTEGER NOT NULL DEFAULT 1,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "AttributeDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VarietyTrait" (
    "id" TEXT NOT NULL,
    "varietyId" TEXT NOT NULL,
    "attributeId" TEXT NOT NULL,
    "valueNumber" DOUBLE PRECISION,
    "valueMin" DOUBLE PRECISION,
    "valueMax" DOUBLE PRECISION,
    "valueEnum" TEXT,
    "valueBool" BOOLEAN,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "reviewStatus" TEXT NOT NULL DEFAULT 'draft',
    "confidence" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "VarietyTrait_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PollinationProfile" (
    "id" TEXT NOT NULL,
    "varietyId" TEXT NOT NULL,
    "sexType" TEXT NOT NULL,
    "selfFertility" TEXT NOT NULL,
    "crossRequired" BOOLEAN NOT NULL DEFAULT false,
    "bloomGroup" TEXT,
    "notes" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "reviewStatus" TEXT NOT NULL DEFAULT 'draft',
    "confidence" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "PollinationProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PollinationCompatibility" (
    "id" TEXT NOT NULL,
    "varietyId" TEXT NOT NULL,
    "partnerVarietyId" TEXT NOT NULL,
    "compatibility" TEXT NOT NULL,
    "reason" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "reviewStatus" TEXT NOT NULL DEFAULT 'draft',
    "confidence" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "PollinationCompatibility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnvironmentRequirement" (
    "id" TEXT NOT NULL,
    "ownerType" TEXT NOT NULL DEFAULT 'crop',
    "ownerId" TEXT NOT NULL,
    "minSunHours" DOUBLE PRECISION NOT NULL,
    "tempMin" DOUBLE PRECISION,
    "tempMax" DOUBLE PRECISION,
    "optimalTempMin" DOUBLE PRECISION,
    "optimalTempMax" DOUBLE PRECISION,
    "frostSensitive" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "reviewStatus" TEXT NOT NULL DEFAULT 'draft',
    "confidence" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "EnvironmentRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContainerType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "drainage" INTEGER NOT NULL,
    "aeration" INTEGER NOT NULL,
    "waterRetention" INTEGER NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "reviewStatus" TEXT NOT NULL DEFAULT 'draft',
    "confidence" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ContainerType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContainerModifier" (
    "id" TEXT NOT NULL,
    "containerTypeId" TEXT NOT NULL,
    "adjustTarget" TEXT NOT NULL,
    "delta" DOUBLE PRECISION NOT NULL,
    "directionHint" JSONB,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "reviewStatus" TEXT NOT NULL DEFAULT 'draft',
    "confidence" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ContainerModifier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContainerRequirement" (
    "id" TEXT NOT NULL,
    "cropId" TEXT NOT NULL,
    "varietyId" TEXT,
    "minVolumeL" DOUBLE PRECISION NOT NULL,
    "preferredVolumeMinL" DOUBLE PRECISION NOT NULL,
    "preferredVolumeMaxL" DOUBLE PRECISION NOT NULL,
    "minDepthCm" DOUBLE PRECISION,
    "minWidthCm" DOUBLE PRECISION,
    "minDrainageLevel" INTEGER NOT NULL DEFAULT 1,
    "minAerationLevel" INTEGER NOT NULL DEFAULT 1,
    "preferredContainerTypeIds" JSONB,
    "avoidContainerTypeIds" JSONB,
    "supportRequired" BOOLEAN NOT NULL DEFAULT false,
    "repotYears" INTEGER,
    "reason" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "reviewStatus" TEXT NOT NULL DEFAULT 'draft',
    "confidence" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ContainerRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubstrateMaterial" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "waterRetention" INTEGER NOT NULL,
    "drainage" INTEGER NOT NULL,
    "aeration" INTEGER NOT NULL,
    "organicMatter" INTEGER NOT NULL,
    "nutrient" INTEGER NOT NULL,
    "acidifying" BOOLEAN NOT NULL DEFAULT false,
    "functionGroup" TEXT NOT NULL,
    "costLevel" INTEGER NOT NULL,
    "commonality" INTEGER NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "reviewStatus" TEXT NOT NULL DEFAULT 'draft',
    "confidence" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "SubstrateMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialCropRule" (
    "id" TEXT NOT NULL,
    "cropId" TEXT,
    "materialId" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "reason" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "reviewStatus" TEXT NOT NULL DEFAULT 'draft',
    "confidence" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "MaterialCropRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialSubstitution" (
    "id" TEXT NOT NULL,
    "materialFromId" TEXT NOT NULL,
    "materialToId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "compatibility" INTEGER NOT NULL,
    "penalty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "conditions" TEXT,
    "confidence" INTEGER NOT NULL DEFAULT 3,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "reviewStatus" TEXT NOT NULL DEFAULT 'draft',

    CONSTRAINT "MaterialSubstitution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SoilRecipeTemplate" (
    "id" TEXT NOT NULL,
    "cropId" TEXT,
    "varietyId" TEXT,
    "baseVolumeL" DOUBLE PRECISION NOT NULL DEFAULT 30,
    "targetProperties" JSONB,
    "isFallback" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "reviewStatus" TEXT NOT NULL DEFAULT 'draft',
    "confidence" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "SoilRecipeTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SoilRecipeSlot" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "functionGroup" TEXT NOT NULL,
    "minPct" DOUBLE PRECISION NOT NULL,
    "maxPct" DOUBLE PRECISION NOT NULL,
    "preferredMaterials" JSONB,
    "required" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "SoilRecipeSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaterRiskConfig" (
    "id" TEXT NOT NULL,
    "sensitivityBand" TEXT NOT NULL,
    "containerDrainageBand" TEXT NOT NULL,
    "mixDrainageBand" TEXT NOT NULL,
    "rainExposed" BOOLEAN NOT NULL,
    "riskLevel" TEXT NOT NULL,
    "mitigation" JSONB,

    CONSTRAINT "WaterRiskConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserMaterialInventory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'enough',

    CONSTRAINT "UserMaterialInventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvidenceSource" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "organization" TEXT,
    "url" TEXT,
    "citation" TEXT,
    "sourceType" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "EvidenceSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FactEvidence" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "fieldName" TEXT NOT NULL,
    "evidenceSourceId" TEXT NOT NULL,
    "note" TEXT,
    "reviewStatus" TEXT NOT NULL DEFAULT 'draft',

    CONSTRAINT "FactEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserIdentity_provider_providerUid_key" ON "UserIdentity"("provider", "providerUid");

-- CreateIndex
CREATE UNIQUE INDEX "SunEstimateRule_orientation_timeObs_key" ON "SunEstimateRule"("orientation", "timeObs");

-- CreateIndex
CREATE UNIQUE INDEX "AttributeDefinition_key_key" ON "AttributeDefinition"("key");

-- CreateIndex
CREATE INDEX "VarietyTrait_attributeId_valueNumber_idx" ON "VarietyTrait"("attributeId", "valueNumber");

-- CreateIndex
CREATE UNIQUE INDEX "VarietyTrait_varietyId_attributeId_key" ON "VarietyTrait"("varietyId", "attributeId");

-- CreateIndex
CREATE UNIQUE INDEX "PollinationProfile_varietyId_key" ON "PollinationProfile"("varietyId");

-- CreateIndex
CREATE UNIQUE INDEX "PollinationCompatibility_varietyId_partnerVarietyId_key" ON "PollinationCompatibility"("varietyId", "partnerVarietyId");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialCropRule_cropId_materialId_key" ON "MaterialCropRule"("cropId", "materialId");

-- CreateIndex
CREATE UNIQUE INDEX "WaterRiskConfig_sensitivityBand_containerDrainageBand_mixDr_key" ON "WaterRiskConfig"("sensitivityBand", "containerDrainageBand", "mixDrainageBand", "rainExposed");

-- CreateIndex
CREATE UNIQUE INDEX "UserMaterialInventory_userId_materialId_key" ON "UserMaterialInventory"("userId", "materialId");

-- AddForeignKey
ALTER TABLE "UserIdentity" ADD CONSTRAINT "UserIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TerraceProfile" ADD CONSTRAINT "TerraceProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Variety" ADD CONSTRAINT "Variety_cropId_fkey" FOREIGN KEY ("cropId") REFERENCES "Crop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VarietyTrait" ADD CONSTRAINT "VarietyTrait_varietyId_fkey" FOREIGN KEY ("varietyId") REFERENCES "Variety"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VarietyTrait" ADD CONSTRAINT "VarietyTrait_attributeId_fkey" FOREIGN KEY ("attributeId") REFERENCES "AttributeDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollinationProfile" ADD CONSTRAINT "PollinationProfile_varietyId_fkey" FOREIGN KEY ("varietyId") REFERENCES "Variety"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollinationCompatibility" ADD CONSTRAINT "PollinationCompatibility_varietyId_fkey" FOREIGN KEY ("varietyId") REFERENCES "Variety"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollinationCompatibility" ADD CONSTRAINT "PollinationCompatibility_partnerVarietyId_fkey" FOREIGN KEY ("partnerVarietyId") REFERENCES "Variety"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnvironmentRequirement" ADD CONSTRAINT "EnvironmentRequirement_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Crop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContainerModifier" ADD CONSTRAINT "ContainerModifier_containerTypeId_fkey" FOREIGN KEY ("containerTypeId") REFERENCES "ContainerType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContainerRequirement" ADD CONSTRAINT "ContainerRequirement_cropId_fkey" FOREIGN KEY ("cropId") REFERENCES "Crop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContainerRequirement" ADD CONSTRAINT "ContainerRequirement_varietyId_fkey" FOREIGN KEY ("varietyId") REFERENCES "Variety"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialCropRule" ADD CONSTRAINT "MaterialCropRule_cropId_fkey" FOREIGN KEY ("cropId") REFERENCES "Crop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialCropRule" ADD CONSTRAINT "MaterialCropRule_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "SubstrateMaterial"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialSubstitution" ADD CONSTRAINT "MaterialSubstitution_materialFromId_fkey" FOREIGN KEY ("materialFromId") REFERENCES "SubstrateMaterial"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialSubstitution" ADD CONSTRAINT "MaterialSubstitution_materialToId_fkey" FOREIGN KEY ("materialToId") REFERENCES "SubstrateMaterial"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoilRecipeTemplate" ADD CONSTRAINT "SoilRecipeTemplate_cropId_fkey" FOREIGN KEY ("cropId") REFERENCES "Crop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoilRecipeSlot" ADD CONSTRAINT "SoilRecipeSlot_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "SoilRecipeTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserMaterialInventory" ADD CONSTRAINT "UserMaterialInventory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserMaterialInventory" ADD CONSTRAINT "UserMaterialInventory_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "SubstrateMaterial"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FactEvidence" ADD CONSTRAINT "FactEvidence_evidenceSourceId_fkey" FOREIGN KEY ("evidenceSourceId") REFERENCES "EvidenceSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
