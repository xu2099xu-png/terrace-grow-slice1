import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const DATA_VERSION = 'mca-xzqh-mainland-2026-08-09';
const DEFAULT_DATA_DIR = path.resolve(__dirname, '..', 'data', 'regions', DATA_VERSION);
const ADMIN_CODE_RE = /^\d{6}$/;
const CLIMATE_ZONE_CODES = new Set(['east_china', 'south_china', 'north_china']);
const MUNICIPALITY_CODES = new Set(['110000', '120000', '310000', '500000']);
const LEGACY_CITY_MAPPINGS: Record<string, string> = {
  beijing: '110000',
  tianjin: '120000',
  shanghai: '310000',
  hangzhou: '330100',
  nanjing: '320100',
  suzhou: '320500',
  ningbo: '330200',
  hefei: '340100',
  wuxi: '320200',
  guangzhou: '440100',
  shenzhen: '440300',
  fuzhou: '350100',
  xiamen: '350200',
  nanning: '450100',
  shijiazhuang: '130100',
  jinan: '370100',
  zhengzhou: '410100',
};

type RegionLevel = 'province' | 'city' | 'district';

export interface RegionCatalogRow {
  admin_code: string;
  name: string;
  level: RegionLevel;
  parent_admin_code: string | null;
  is_municipality: boolean;
  enabled: boolean;
  catalog_order: number;
  data_version: string;
  source: string;
  centroid_lng: number;
  centroid_lat: number;
  representative_point_source_record_id: string;
  representative_point_resolution_rule: string;
}

export interface RegionClimateMappingRow {
  admin_code: string;
  climate_zone_code: string;
  source: string;
  review_status: string;
  confidence: number;
  version: number;
}

export interface ClimateAnchorRow extends RegionClimateMappingRow {
  centroid_lng: number;
  centroid_lat: number;
  enabled: boolean;
}

export interface PopularCityRow {
  legacy_city_code: string;
  display_area_code: string;
  display_name: string;
  kind: 'city' | 'municipality';
  province_admin_code: string;
  province_name: string;
  city_admin_code: string | null;
  city_name: string | null;
  catalog_order: number;
  enabled: boolean;
  data_version: string;
  source: string;
}

export interface LegacyCityMappingRow {
  legacy_city_code: string;
  region_admin_code: string;
  needs_district_confirmation: boolean;
}

export interface RegionCatalog {
  dataDir: string;
  manifest: any;
  regions: RegionCatalogRow[];
  popularCities: PopularCityRow[];
  directMappings: RegionClimateMappingRow[];
  climateAnchors: ClimateAnchorRow[];
  legacyCityMappings: LegacyCityMappingRow[];
}

function fail(message: string): never {
  throw new Error(`[region-catalog] ${message}`);
}

function readUtf8(dataDir: string, file: string): string {
  const filename = path.join(dataDir, file);
  if (!fs.existsSync(filename)) fail(`missing file ${file}`);
  return fs.readFileSync(filename, 'utf8');
}

function readJson<T>(dataDir: string, file: string): T {
  try {
    return JSON.parse(readUtf8(dataDir, file)) as T;
  } catch (error) {
    fail(`invalid JSON in ${file}: ${(error as Error).message}`);
  }
}

function sha256(data: string | Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function assertEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) fail(`${label}: expected ${expected}, got ${actual}`);
}

function assertFiniteCoordinate(lng: unknown, lat: unknown, label: string) {
  if (
    typeof lng !== 'number'
    || typeof lat !== 'number'
    || !Number.isFinite(lng)
    || !Number.isFinite(lat)
    || lng < -180
    || lng > 180
    || lat < -90
    || lat > 90
  ) {
    fail(`${label}: invalid coordinate ${lng},${lat}`);
  }
}

function assertUnique<T>(rows: T[], keyOf: (row: T) => string, label: string) {
  const seen = new Set<string>();
  for (const row of rows) {
    const key = keyOf(row);
    if (seen.has(key)) fail(`${label}: duplicate ${key}`);
    seen.add(key);
  }
}

function checkSha(dataDir: string, manifest: any, file: string, expected: string) {
  assertEqual(sha256(readUtf8(dataDir, file)), expected, `${file} sha256`);
}

function assertPointRecord(row: any, label: string) {
  if (row?.gdm?.type !== 'multipoint') fail(`${label}: gdm.type must be multipoint`);
  if (!Array.isArray(row.gdm.coordinates) || !Array.isArray(row.gdm.coordinates[0])) {
    fail(`${label}: coordinates[0] missing`);
  }
  assertFiniteCoordinate(row.gdm.coordinates[0][0], row.gdm.coordinates[0][1], label);
  if (typeof row.area !== 'string' || !/^\d{6,}$/.test(row.area)) {
    fail(`${label}: area must be a decimal string with at least 6 digits`);
  }
}

function assertCatalogHierarchy(regions: RegionCatalogRow[], manifest: any) {
  assertEqual(regions.length, manifest.total_enabled_row_count, 'regions row count');
  assertUnique(regions, (row) => row.admin_code, 'regions');

  const byCode = new Map(regions.map((row) => [row.admin_code, row]));
  const levelCounts = { province: 0, city: 0, district: 0 };

  regions.forEach((row, index) => {
    if (!ADMIN_CODE_RE.test(row.admin_code)) fail(`${row.admin_code}: invalid admin_code`);
    if (!['province', 'city', 'district'].includes(row.level)) fail(`${row.admin_code}: invalid level ${row.level}`);
    if (row.catalog_order !== index + 1) fail(`${row.admin_code}: catalog_order must be hierarchy order`);
    if (row.enabled !== true) fail(`${row.admin_code}: Slice 6 initial rows must be enabled`);
    if (row.data_version !== manifest.data_version) fail(`${row.admin_code}: data_version mismatch`);
    assertFiniteCoordinate(row.centroid_lng, row.centroid_lat, row.admin_code);
    levelCounts[row.level] += 1;

    const expectedMunicipality = MUNICIPALITY_CODES.has(row.admin_code);
    if (row.is_municipality !== expectedMunicipality) fail(`${row.admin_code}: is_municipality mismatch`);

    if (row.level === 'province' && row.parent_admin_code !== null) {
      fail(`${row.admin_code}: province parent must be null`);
    }
    if (row.level !== 'province') {
      if (!row.parent_admin_code) fail(`${row.admin_code}: missing parent`);
      const parent = byCode.get(row.parent_admin_code);
      if (!parent) fail(`${row.admin_code}: unknown parent ${row.parent_admin_code}`);
      if (!parent.enabled) fail(`${row.admin_code}: disabled parent ${row.parent_admin_code}`);
      if (row.level === 'city' && parent.level !== 'province') fail(`${row.admin_code}: city parent must be province`);
      if (row.level === 'district') {
        const parentIsValid = parent.level === 'city' || parent.level === 'province';
        if (!parentIsValid) fail(`${row.admin_code}: invalid district parent ${row.parent_admin_code}`);
      }
    }
  });

  assertEqual(levelCounts.province, manifest.province_row_count, 'province row count');
  assertEqual(levelCounts.city, manifest.city_prefecture_row_count, 'city row count');
  assertEqual(levelCounts.district, manifest.district_county_row_count, 'district row count');

  for (const municipality of MUNICIPALITY_CODES) {
    const cityChildren = regions.filter((row) => row.level === 'city' && row.parent_admin_code === municipality);
    assertEqual(cityChildren.length, 0, `${municipality} fake city children`);
    const districtChildren = regions.filter((row) => row.level === 'district' && row.parent_admin_code === municipality);
    if (districtChildren.length === 0) fail(`${municipality}: missing direct district children`);
  }
}

function assertRepresentativePoints(dataDir: string, manifest: any, regions: RegionCatalogRow[]) {
  const pointManifest = manifest.representative_point_source_manifest;
  const canonical = readJson<any[]>(dataDir, pointManifest.canonical_source_artifact);
  const exceptions = readJson<any[]>(dataDir, pointManifest.representative_point_exceptions_artifact);
  const finalPoints = readJson<any[]>(dataDir, pointManifest.final_normalized_point_artifact);

  assertEqual(canonical.length, pointManifest.canonical_source_record_count, 'canonical point row count');
  canonical.forEach((row, index) => assertPointRecord(row, `canonical point ${index}`));

  assertEqual(exceptions.length, 3, 'representative point exception row count');
  exceptions.forEach((row) => assertPointRecord(row, `exception ${row.admin_code}`));
  assertEqual(exceptions.map((row) => row.admin_code).join(','), '340621,653132,659013', 'exception admin_code order');

  assertEqual(finalPoints.length, pointManifest.final_normalized_point_row_count, 'final point row count');
  const finalCodes = finalPoints.map((row) => row.admin_code);
  assertEqual(finalCodes.join(','), regions.map((row) => row.admin_code).join(','), 'final point hierarchy order');
  const counts: Record<string, number> = {};
  for (const row of finalPoints) {
    assertFiniteCoordinate(row.centroid_lng, row.centroid_lat, `final point ${row.admin_code}`);
    counts[row.resolution_rule] = (counts[row.resolution_rule] ?? 0) + 1;
  }
  for (const [rule, expected] of Object.entries(pointManifest.final_resolution_rule_counts)) {
    assertEqual(counts[rule] ?? 0, expected as number, `resolution count ${rule}`);
  }

  const duplicateWinner = finalPoints.find((row) => row.admin_code === '370705');
  assertEqual(duplicateWinner?.source_record_id, '4a652ef9985ff54f531a6e4c10995abd', '370705 duplicate winner');
  const wuning = finalPoints.find((row) => row.admin_code === '360423');
  assertEqual(wuning?.source_record_id, '9756500e08cc90e660b6a0cd4636ea47', '360423 anomaly source id');
  assertEqual(wuning?.resolution_rule, 'ancestor_name_type', '360423 anomaly rule');
}

function haversineKm(a: RegionCatalogRow, b: ClimateAnchorRow): number {
  const radiusKm = 6371.0088;
  const toRad = (degrees: number) => degrees * Math.PI / 180;
  const dLat = toRad(b.centroid_lat - a.centroid_lat);
  const dLng = toRad(b.centroid_lng - a.centroid_lng);
  const lat1 = toRad(a.centroid_lat);
  const lat2 = toRad(b.centroid_lat);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return radiusKm * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function assertClimateMappings(
  regions: RegionCatalogRow[],
  directMappings: RegionClimateMappingRow[],
  climateAnchors: ClimateAnchorRow[],
) {
  const byCode = new Map(regions.map((row) => [row.admin_code, row]));
  const districtCodes = new Set(regions.filter((row) => row.enabled && row.level === 'district').map((row) => row.admin_code));
  assertUnique(directMappings, (row) => row.admin_code, 'direct mappings');
  assertUnique(climateAnchors, (row) => row.admin_code, 'climate anchors');

  for (const row of directMappings) {
    if (!districtCodes.has(row.admin_code)) fail(`${row.admin_code}: direct mapping must target enabled district`);
    if (!CLIMATE_ZONE_CODES.has(row.climate_zone_code)) fail(`${row.admin_code}: unknown climate_zone_code ${row.climate_zone_code}`);
    assertEqual(row.review_status, 'approved', `${row.admin_code} direct review_status`);
    if (row.confidence < 1 || row.confidence > 5) fail(`${row.admin_code}: invalid direct confidence`);
  }

  for (const row of climateAnchors) {
    const region = byCode.get(row.admin_code);
    if (!region || region.level !== 'district' || !region.enabled) fail(`${row.admin_code}: anchor must target enabled district`);
    if (!CLIMATE_ZONE_CODES.has(row.climate_zone_code)) fail(`${row.admin_code}: unknown anchor climate_zone_code ${row.climate_zone_code}`);
    assertEqual(row.review_status, 'approved', `${row.admin_code} anchor review_status`);
    assertEqual(row.enabled, true, `${row.admin_code} anchor enabled`);
    assertFiniteCoordinate(row.centroid_lng, row.centroid_lat, `anchor ${row.admin_code}`);
    assertEqual(row.centroid_lng, region.centroid_lng, `${row.admin_code} anchor centroid_lng`);
    assertEqual(row.centroid_lat, region.centroid_lat, `${row.admin_code} anchor centroid_lat`);
  }

  const approvedAnchors = climateAnchors.filter((row) => row.enabled && row.review_status === 'approved');
  if (approvedAnchors.length === 0) fail('at least one approved enabled climate anchor is required');
  const directCodes = new Set(directMappings.map((row) => row.admin_code));
  let selectedDifferentFixture = false;
  for (const district of regions.filter((row) => row.enabled && row.level === 'district')) {
    if (directCodes.has(district.admin_code)) continue;
    const nearest = [...approvedAnchors].sort((a, b) => {
      const distance = haversineKm(district, a) - haversineKm(district, b);
      if (Math.abs(distance) > 1e-9) return distance;
      return a.admin_code.localeCompare(b.admin_code);
    })[0];
    if (!nearest) fail(`${district.admin_code}: cannot resolve nearest proxy`);
    if (nearest.admin_code !== district.admin_code) selectedDifferentFixture = true;
  }
  if (!selectedDifferentFixture) fail('nearest-proxy selected_area_code != climate_area_code fixture is missing');
}

function assertPopularAndLegacy(
  regions: RegionCatalogRow[],
  popularCities: PopularCityRow[],
  legacyCityMappings: LegacyCityMappingRow[],
  manifest: any,
) {
  const byCode = new Map(regions.map((row) => [row.admin_code, row]));
  assertUnique(popularCities, (row) => row.legacy_city_code, 'popular cities');
  assertUnique(legacyCityMappings, (row) => row.legacy_city_code, 'legacy city mappings');
  assertEqual(legacyCityMappings.length, Object.keys(LEGACY_CITY_MAPPINGS).length, 'legacy mapping count');

  popularCities.forEach((row, index) => {
    if (row.catalog_order !== index + 1) fail(`${row.legacy_city_code}: invalid popular catalog_order`);
    assertEqual(row.enabled, true, `${row.legacy_city_code} popular enabled`);
    assertEqual(row.data_version, manifest.data_version, `${row.legacy_city_code} popular data_version`);
    if (typeof row.source !== 'string' || row.source.length === 0) fail(`${row.legacy_city_code}: missing popular source`);
  });

  for (const [legacy, expectedRegionCode] of Object.entries(LEGACY_CITY_MAPPINGS)) {
    const legacyMapping = legacyCityMappings.find((row) => row.legacy_city_code === legacy);
    if (!legacyMapping) fail(`${legacy}: missing legacy mapping`);
    assertEqual(legacyMapping.region_admin_code, expectedRegionCode, `${legacy} region_admin_code`);
    assertEqual(legacyMapping.needs_district_confirmation, true, `${legacy} needs_district_confirmation`);

    const popular = popularCities.find((row) => row.legacy_city_code === legacy);
    if (!popular) fail(`${legacy}: missing popular row`);
    const region = byCode.get(expectedRegionCode);
    if (!region) fail(`${legacy}: unknown popular region ${expectedRegionCode}`);
    const province = region.level === 'province'
      ? region
      : (region.parent_admin_code ? byCode.get(region.parent_admin_code) : null);
    if (!province || province.level !== 'province') fail(`${legacy}: missing popular province`);
    assertEqual(popular.province_admin_code, province.admin_code, `${legacy} province_admin_code`);
    assertEqual(popular.province_name, province.name, `${legacy} province_name`);

    if (region.is_municipality) {
      assertEqual(popular.kind, 'municipality', `${legacy} popular kind`);
      assertEqual(popular.display_area_code, region.admin_code, `${legacy} display_area_code`);
      assertEqual(popular.city_admin_code, null, `${legacy} city_admin_code`);
      assertEqual(popular.city_name, null, `${legacy} city_name`);
    } else {
      assertEqual(popular.kind, 'city', `${legacy} popular kind`);
      assertEqual(popular.display_area_code, region.admin_code, `${legacy} display_area_code`);
      assertEqual(popular.city_admin_code, region.admin_code, `${legacy} city_admin_code`);
      assertEqual(popular.city_name, region.name, `${legacy} city_name`);
    }
  }
}

export function validateRegionCatalog(dataDir = DEFAULT_DATA_DIR): RegionCatalog {
  const manifest = readJson<any>(dataDir, 'manifest.json');
  checkSha(dataDir, manifest, 'mca-xzqh-maxLevel3-2026-08-09.json', manifest.raw_source_sha256);
  checkSha(dataDir, manifest, 'mca-mainland-normalized-hierarchy-3211-2026-08-09.json', manifest.normalized_mainland_hierarchy_sha256);
  checkSha(dataDir, manifest, 'aliases-supersessions-initial-2026-08-09.json', manifest.aliases_supersessions_initial_sha256);
  checkSha(
    dataDir,
    manifest,
    manifest.representative_point_source_manifest.canonical_source_artifact,
    manifest.representative_point_source_manifest.canonical_source_sha256,
  );
  checkSha(
    dataDir,
    manifest,
    manifest.representative_point_source_manifest.representative_point_exceptions_artifact,
    manifest.representative_point_source_manifest.representative_point_exceptions_sha256,
  );
  checkSha(
    dataDir,
    manifest,
    manifest.representative_point_source_manifest.final_normalized_point_artifact,
    manifest.representative_point_source_manifest.final_normalized_point_sha256,
  );

  const regions = readJson<RegionCatalogRow[]>(dataDir, 'regions.json');
  const popularCities = readJson<PopularCityRow[]>(dataDir, 'popular-cities.json');
  const directMappings = readJson<RegionClimateMappingRow[]>(dataDir, 'climate-direct-mappings.json');
  const climateAnchors = readJson<ClimateAnchorRow[]>(dataDir, 'climate-anchors.json');
  const legacyCityMappings = readJson<LegacyCityMappingRow[]>(dataDir, 'legacy-city-region-mappings.json');

  for (const [file, details] of Object.entries<any>(manifest.generated_product_files)) {
    checkSha(dataDir, manifest, file, details.sha256);
    const rows = readJson<any[]>(dataDir, file);
    assertEqual(rows.length, details.row_count, `${file} row count`);
  }

  assertCatalogHierarchy(regions, manifest);
  assertRepresentativePoints(dataDir, manifest, regions);
  assertClimateMappings(regions, directMappings, climateAnchors);
  assertPopularAndLegacy(regions, popularCities, legacyCityMappings, manifest);

  console.log(
    `[region-catalog] PASS data_version=${manifest.data_version} regions=${regions.length} `
    + `popular=${popularCities.length} direct=${directMappings.length} anchors=${climateAnchors.length}`,
  );
  return { dataDir, manifest, regions, popularCities, directMappings, climateAnchors, legacyCityMappings };
}

if (require.main === module) {
  validateRegionCatalog(process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_DATA_DIR);
}
