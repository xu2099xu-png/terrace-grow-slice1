-- Slice 6 governed administrative-region catalog, climate-region mapping,
-- weather/calendar caches, and legacy TerraceProfile region backfill.

ALTER TABLE "TerraceProfile"
  ADD COLUMN "regionAdminCode" TEXT,
  ADD COLUMN "needsDistrictConfirmation" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "Region" (
  "adminCode" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "level" TEXT NOT NULL,
  "parentAdminCode" TEXT,
  "isMunicipality" BOOLEAN NOT NULL,
  "enabled" BOOLEAN NOT NULL,
  "catalogOrder" INTEGER NOT NULL,
  "dataVersion" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "centroidLng" DOUBLE PRECISION NOT NULL,
  "centroidLat" DOUBLE PRECISION NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Region_pkey" PRIMARY KEY ("adminCode")
);

CREATE TABLE "RegionClimateMapping" (
  "id" TEXT NOT NULL,
  "adminCode" TEXT NOT NULL,
  "climateZoneCode" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "reviewStatus" TEXT NOT NULL,
  "confidence" INTEGER NOT NULL,
  "version" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "RegionClimateMapping_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PopularCity" (
  "id" TEXT NOT NULL,
  "legacyCityCode" TEXT NOT NULL,
  "displayAreaCode" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "provinceAdminCode" TEXT NOT NULL,
  "provinceName" TEXT NOT NULL,
  "cityAdminCode" TEXT,
  "cityName" TEXT,
  "catalogOrder" INTEGER NOT NULL,
  "enabled" BOOLEAN NOT NULL,
  "dataVersion" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PopularCity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ClimateAnchor" (
  "id" TEXT NOT NULL,
  "adminCode" TEXT NOT NULL,
  "climateZoneCode" TEXT NOT NULL,
  "centroidLng" DOUBLE PRECISION NOT NULL,
  "centroidLat" DOUBLE PRECISION NOT NULL,
  "enabled" BOOLEAN NOT NULL,
  "source" TEXT NOT NULL,
  "reviewStatus" TEXT NOT NULL,
  "confidence" INTEGER NOT NULL,
  "version" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ClimateAnchor_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WeatherCache" (
  "id" TEXT NOT NULL,
  "cacheKeyHash" TEXT NOT NULL,
  "selectedAreaCode" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "providerEndpointVersion" TEXT NOT NULL,
  "parserVersion" TEXT NOT NULL,
  "bucket" TEXT NOT NULL,
  "publicWeather" JSONB NOT NULL,
  "dailyWeather" JSONB NOT NULL,
  "attribution" JSONB NOT NULL,
  "status" TEXT NOT NULL,
  "observedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "WeatherCache_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CalendarContextCache" (
  "id" TEXT NOT NULL,
  "date" TEXT NOT NULL,
  "timezone" TEXT NOT NULL,
  "algorithmVersion" TEXT NOT NULL,
  "contextJson" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3),

  CONSTRAINT "CalendarContextCache_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Region_level_parentAdminCode_enabled_catalogOrder_idx" ON "Region"("level", "parentAdminCode", "enabled", "catalogOrder");
CREATE INDEX "Region_enabled_level_idx" ON "Region"("enabled", "level");
CREATE UNIQUE INDEX "PopularCity_legacyCityCode_key" ON "PopularCity"("legacyCityCode");
CREATE INDEX "PopularCity_enabled_kind_catalogOrder_idx" ON "PopularCity"("enabled", "kind", "catalogOrder");
CREATE INDEX "PopularCity_displayAreaCode_idx" ON "PopularCity"("displayAreaCode");
CREATE UNIQUE INDEX "RegionClimateMapping_adminCode_key" ON "RegionClimateMapping"("adminCode");
CREATE INDEX "RegionClimateMapping_climateZoneCode_idx" ON "RegionClimateMapping"("climateZoneCode");
CREATE INDEX "RegionClimateMapping_reviewStatus_version_idx" ON "RegionClimateMapping"("reviewStatus", "version");
CREATE UNIQUE INDEX "ClimateAnchor_adminCode_key" ON "ClimateAnchor"("adminCode");
CREATE INDEX "ClimateAnchor_enabled_reviewStatus_climateZoneCode_idx" ON "ClimateAnchor"("enabled", "reviewStatus", "climateZoneCode");
CREATE UNIQUE INDEX "WeatherCache_cacheKeyHash_key" ON "WeatherCache"("cacheKeyHash");
CREATE UNIQUE INDEX "WeatherCache_selected_area_unique"
  ON "WeatherCache"("selectedAreaCode", "provider", "providerEndpointVersion", "bucket", "parserVersion");
CREATE INDEX "WeatherCache_selectedAreaCode_idx" ON "WeatherCache"("selectedAreaCode");
CREATE INDEX "WeatherCache_expiresAt_idx" ON "WeatherCache"("expiresAt");
CREATE UNIQUE INDEX "CalendarContextCache_date_timezone_algorithmVersion_key" ON "CalendarContextCache"("date", "timezone", "algorithmVersion");
CREATE INDEX "CalendarContextCache_expiresAt_idx" ON "CalendarContextCache"("expiresAt");

ALTER TABLE "Region"
  ADD CONSTRAINT "Region_level_check"
  CHECK ("level" IN ('province', 'city', 'district'));

ALTER TABLE "Region"
  ADD CONSTRAINT "Region_centroid_check"
  CHECK (
    "centroidLng" >= -180 AND "centroidLng" <= 180
    AND "centroidLat" >= -90 AND "centroidLat" <= 90
  );

ALTER TABLE "RegionClimateMapping"
  ADD CONSTRAINT "RegionClimateMapping_reviewStatus_check"
  CHECK ("reviewStatus" IN ('draft', 'ai_generated', 'cross_reviewed', 'approved'));

ALTER TABLE "PopularCity"
  ADD CONSTRAINT "PopularCity_kind_check"
  CHECK ("kind" IN ('city', 'municipality'));

ALTER TABLE "PopularCity"
  ADD CONSTRAINT "PopularCity_city_code_check"
  CHECK (
    ("kind" = 'municipality' AND "cityAdminCode" IS NULL)
    OR ("kind" = 'city' AND "cityAdminCode" IS NOT NULL)
  );

ALTER TABLE "RegionClimateMapping"
  ADD CONSTRAINT "RegionClimateMapping_confidence_check"
  CHECK ("confidence" >= 1 AND "confidence" <= 5);

ALTER TABLE "ClimateAnchor"
  ADD CONSTRAINT "ClimateAnchor_reviewStatus_check"
  CHECK ("reviewStatus" IN ('draft', 'ai_generated', 'cross_reviewed', 'approved'));

ALTER TABLE "ClimateAnchor"
  ADD CONSTRAINT "ClimateAnchor_confidence_check"
  CHECK ("confidence" >= 1 AND "confidence" <= 5);

ALTER TABLE "ClimateAnchor"
  ADD CONSTRAINT "ClimateAnchor_centroid_check"
  CHECK (
    "centroidLng" >= -180 AND "centroidLng" <= 180
    AND "centroidLat" >= -90 AND "centroidLat" <= 90
  );

UPDATE "TerraceProfile"
SET
  "regionAdminCode" = CASE "cityCode"
    WHEN 'beijing' THEN '110000'
    WHEN 'tianjin' THEN '120000'
    WHEN 'shanghai' THEN '310000'
    WHEN 'hangzhou' THEN '330100'
    WHEN 'nanjing' THEN '320100'
    WHEN 'suzhou' THEN '320500'
    WHEN 'ningbo' THEN '330200'
    WHEN 'hefei' THEN '340100'
    WHEN 'wuxi' THEN '320200'
    WHEN 'guangzhou' THEN '440100'
    WHEN 'shenzhen' THEN '440300'
    WHEN 'fuzhou' THEN '350100'
    WHEN 'xiamen' THEN '350200'
    WHEN 'nanning' THEN '450100'
    WHEN 'shijiazhuang' THEN '130100'
    WHEN 'jinan' THEN '370100'
    WHEN 'zhengzhou' THEN '410100'
    ELSE "regionAdminCode"
  END,
  "needsDistrictConfirmation" = true
WHERE "cityCode" IN (
  'beijing', 'tianjin', 'shanghai', 'hangzhou', 'nanjing',
  'suzhou', 'ningbo', 'hefei', 'wuxi', 'guangzhou', 'shenzhen', 'fuzhou',
  'xiamen', 'nanning', 'shijiazhuang', 'jinan', 'zhengzhou'
);
