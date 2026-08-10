import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import {
  ClimateAnchorRow,
  PopularCityRow,
  RegionCatalogRow,
  RegionClimateMappingRow,
  validateRegionCatalog,
} from './check-region-catalog';

function toRegionCreate(row: RegionCatalogRow) {
  return {
    adminCode: row.admin_code,
    name: row.name,
    level: row.level,
    parentAdminCode: row.parent_admin_code,
    isMunicipality: row.is_municipality,
    enabled: row.enabled,
    catalogOrder: row.catalog_order,
    dataVersion: row.data_version,
    source: row.source,
    centroidLng: row.centroid_lng,
    centroidLat: row.centroid_lat,
  };
}

function toDirectMappingCreate(row: RegionClimateMappingRow) {
  return {
    adminCode: row.admin_code,
    climateZoneCode: row.climate_zone_code,
    source: row.source,
    reviewStatus: row.review_status,
    confidence: row.confidence,
    version: row.version,
  };
}

function toPopularCityCreate(row: PopularCityRow) {
  return {
    legacyCityCode: row.legacy_city_code,
    displayAreaCode: row.display_area_code,
    displayName: row.display_name,
    kind: row.kind,
    provinceAdminCode: row.province_admin_code,
    provinceName: row.province_name,
    cityAdminCode: row.city_admin_code,
    cityName: row.city_name,
    catalogOrder: row.catalog_order,
    enabled: row.enabled,
    dataVersion: row.data_version,
    source: row.source,
  };
}

function toClimateAnchorCreate(row: ClimateAnchorRow) {
  return {
    adminCode: row.admin_code,
    climateZoneCode: row.climate_zone_code,
    centroidLng: row.centroid_lng,
    centroidLat: row.centroid_lat,
    enabled: row.enabled,
    source: row.source,
    reviewStatus: row.review_status,
    confidence: row.confidence,
    version: row.version,
  };
}

async function main() {
  const dataDir = process.argv[2] ? path.resolve(process.argv[2]) : undefined;
  const catalog = validateRegionCatalog(dataDir);
  const prisma = new PrismaClient();

  try {
    await prisma.$transaction(async (tx) => {
      for (const row of catalog.regions) {
        const data = toRegionCreate(row);
        await tx.region.upsert({
          where: { adminCode: row.admin_code },
          create: data,
          update: data,
        });
      }

      for (const row of catalog.directMappings) {
        const data = toDirectMappingCreate(row);
        await tx.regionClimateMapping.upsert({
          where: { adminCode: row.admin_code },
          create: data,
          update: data,
        });
      }

      for (const row of catalog.popularCities) {
        const data = toPopularCityCreate(row);
        await tx.popularCity.upsert({
          where: { legacyCityCode: row.legacy_city_code },
          create: data,
          update: data,
        });
      }

      for (const row of catalog.climateAnchors) {
        const data = toClimateAnchorCreate(row);
        await tx.climateAnchor.upsert({
          where: { adminCode: row.admin_code },
          create: data,
          update: data,
        });
      }
    }, { timeout: 120_000, maxWait: 20_000 });

    console.log(
      `[region-catalog] IMPORT PASS data_version=${catalog.manifest.data_version} `
      + `regions=${catalog.regions.length} popular=${catalog.popularCities.length} `
      + `direct=${catalog.directMappings.length} anchors=${catalog.climateAnchors.length}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
