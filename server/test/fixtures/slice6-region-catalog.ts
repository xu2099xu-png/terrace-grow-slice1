import { PrismaService } from '../../src/prisma.service';
import {
  RegionCatalog,
  validateRegionCatalog,
} from '../../scripts/check-region-catalog';

export const SLICE6_DIRECT_ADMIN_CODE = '110101';
export const SLICE6_PROXY_ADMIN_CODE = '110102';
export const SLICE6_UNSUPPORTED_ADMIN_CODE = '999999';

let cachedCatalog: RegionCatalog | null = null;

export function loadSlice6Catalog(): RegionCatalog {
  cachedCatalog ??= validateRegionCatalog();
  return cachedCatalog;
}

export async function ensureSlice6CatalogInDb(prisma: PrismaService): Promise<RegionCatalog> {
  const catalog = loadSlice6Catalog();

  await prisma.$transaction(async (tx) => {
    const db = tx as any;
    for (const row of catalog.regions) {
      await db.region.upsert({
        where: { adminCode: row.admin_code },
        create: {
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
        },
        update: {
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
        },
      });
    }

    for (const row of catalog.directMappings) {
      await db.regionClimateMapping.upsert({
        where: { adminCode: row.admin_code },
        create: {
          adminCode: row.admin_code,
          climateZoneCode: row.climate_zone_code,
          source: row.source,
          reviewStatus: row.review_status,
          confidence: row.confidence,
          version: row.version,
        },
        update: {
          climateZoneCode: row.climate_zone_code,
          source: row.source,
          reviewStatus: row.review_status,
          confidence: row.confidence,
          version: row.version,
        },
      });
    }

    for (const row of catalog.popularCities) {
      const data = {
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
      await db.popularCity.upsert({
        where: { legacyCityCode: row.legacy_city_code },
        create: data,
        update: data,
      });
    }

    for (const row of catalog.climateAnchors) {
      await db.climateAnchor.upsert({
        where: { adminCode: row.admin_code },
        create: {
          adminCode: row.admin_code,
          climateZoneCode: row.climate_zone_code,
          centroidLng: row.centroid_lng,
          centroidLat: row.centroid_lat,
          enabled: row.enabled,
          source: row.source,
          reviewStatus: row.review_status,
          confidence: row.confidence,
          version: row.version,
        },
        update: {
          climateZoneCode: row.climate_zone_code,
          centroidLng: row.centroid_lng,
          centroidLat: row.centroid_lat,
          enabled: row.enabled,
          source: row.source,
          reviewStatus: row.review_status,
          confidence: row.confidence,
          version: row.version,
        },
      });
    }
  }, { timeout: 120_000, maxWait: 20_000 });

  return catalog;
}
