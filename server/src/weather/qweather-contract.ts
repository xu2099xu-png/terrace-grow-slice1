export const QWEATHER_ATTRIBUTION_NAME = '和风天气/QWeather';
export const QWEATHER_ATTRIBUTION_URL = 'https://www.qweather.com';

export const QWEATHER_PROVIDER = 'qweather';
export const QWEATHER_DOCUMENTATION_SNAPSHOT_DATE = '2026-08-10';
export const QWEATHER_ENDPOINT_VERSION = 'qweather-v1-display-current-daily-warning';
export const QWEATHER_PARSER_VERSION =
  'qweather-current-v1-display-parser@1+qweather-daily-v1-agri-display-parser@1+qweather-weatheralert-v1-display-parser@2';

export const QWEATHER_CURRENT_PATH = '/weather/v1/current/{latitude}/{longitude}';
export const QWEATHER_DAILY_PATH = '/weather/v1/daily/{latitude}/{longitude}';
export const QWEATHER_WARNING_PATH = '/weatheralert/v1/current/{latitude}/{longitude}';

export const QWEATHER_CURRENT_FIXTURE = {
  file: 'qweather-current-v1-display.fixture.json',
  sha256: 'b33eb93a7e52ebdfdca0a55d10fe6d8b7b7b2b93c89a05c65b904c3d5ebab3bd',
  parser: 'qweather-current-v1-display-parser@1',
  documentationUrl: 'https://dev.qweather.com/en/docs/api/weather/weather-current/',
};

export const QWEATHER_DAILY_FIXTURE = {
  file: 'qweather-daily-v1-agri-display.fixture.json',
  sha256: '6d513171fa80d53565317cb4e4ac52077b5b7b4c5447c38d764bfe1d96ca915d',
  parser: 'qweather-daily-v1-agri-display-parser@1',
  documentationUrl: 'https://dev.qweather.com/en/docs/api/weather/weather-daily-forecast/',
};

export const QWEATHER_WARNING_FIXTURE = {
  file: 'qweather-weatheralert-v1-display.fixture.json',
  sha256: 'ad76821d0dcc423e84e530ac7c3dd3c865d685ba093db165cb386dbd68c15b2c',
  parser: 'qweather-weatheralert-v1-display-parser@2',
  documentationUrl: 'https://dev.qweather.com/en/docs/api/warning/weather-alert/',
};

export const QWEATHER_WARNING_REFER_FIXTURE = {
  file: 'qweather-weatheralert-v1-refer-compat.fixture.json',
  sha256: '353199da0154ab87096587fbd64dea6486b2ccced59552d3a27edf181e48a2f6',
  parser: 'qweather-weatheralert-v1-display-parser@2',
  documentationUrl: 'https://dev.qweather.com/en/docs/api/warning/weather-alert/',
  attributionTermsUrls: [
    'https://dev.qweather.com/en/docs/terms/attribution/',
    'https://dev.qweather.com/docs/terms/attribution/',
  ],
};

export const QWEATHER_WARNING_DOCUMENTATION_CONFLICT = {
  type: 'official_documentation_conflict',
  interface: 'qweather-weatheralert-v1-current',
  snapshot_date: QWEATHER_DOCUMENTATION_SNAPSHOT_DATE,
  schema_url: QWEATHER_WARNING_FIXTURE.documentationUrl,
  attribution_terms_urls: QWEATHER_WARNING_REFER_FIXTURE.attributionTermsUrls,
  schema_observation:
    'Weather Alert v1 response/schema documents metadata.attributions[] and alerts[].senderName for attribution/source display and does not list refer.',
  terms_observation:
    'QWeather Attribution Terms for Weather Warning require displaying all refer.sources content without modification.',
  resolution_rule:
    'Treat metadata.attributions[] and alerts[].senderName as documented normal Weather Alert v1 paths. Accept normal responses with missing refer. If an actual response includes refer.sources, validate it as string[] and pass it through exactly after metadata.attributions[] and alerts[].senderName. If refer.sources is present but malformed, fail closed for warning display and do not cache that warning/attribution. Never invent refer.sources.',
} as const;

export const QWEATHER_FORBIDDEN_HOSTS = new Set([
  'api.qweather.com',
  'devapi.qweather.com',
  'geoapi.qweather.com',
]);
