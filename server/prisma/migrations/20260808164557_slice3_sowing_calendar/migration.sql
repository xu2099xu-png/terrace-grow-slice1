-- CreateTable
CREATE TABLE "SowingCalendar" (
    "id" TEXT NOT NULL,
    "cropId" TEXT NOT NULL,
    "climateZoneCode" TEXT NOT NULL,
    "startMethod" TEXT NOT NULL,
    "windowKey" TEXT NOT NULL,
    "windowStart" TEXT NOT NULL,
    "windowEnd" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "reviewStatus" TEXT NOT NULL DEFAULT 'draft',
    "confidence" INTEGER NOT NULL DEFAULT 1,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SowingCalendar_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SowingCalendar_cropId_climateZoneCode_startMethod_idx" ON "SowingCalendar"("cropId", "climateZoneCode", "startMethod");

-- CreateIndex
CREATE UNIQUE INDEX "SowingCalendar_cropId_climateZoneCode_startMethod_windowKey_key" ON "SowingCalendar"("cropId", "climateZoneCode", "startMethod", "windowKey");

-- AddForeignKey
ALTER TABLE "PlantingRecord" ADD CONSTRAINT "PlantingRecord_cropId_fkey" FOREIGN KEY ("cropId") REFERENCES "Crop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SowingCalendar" ADD CONSTRAINT "SowingCalendar_cropId_fkey" FOREIGN KEY ("cropId") REFERENCES "Crop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SowingCalendar" ADD CONSTRAINT "SowingCalendar_climateZoneCode_fkey" FOREIGN KEY ("climateZoneCode") REFERENCES "ClimateZone"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AC-27: startMethod is a concrete method only — 'either' never allowed.
ALTER TABLE "SowingCalendar" ADD CONSTRAINT "SowingCalendar_startMethod_check" CHECK ("startMethod" IN ('nursery_plant', 'direct_seed'));
