export * from "./types.js";

// Providers
export {
  AbstractProvider,
  type ProviderOptions,
  type FetchRequestOptions,
} from "./providers/base.js";
export { FlwBaseProvider } from "./providers/flwBase.js";
export { NovaProvider } from "./providers/nova.js";
export { MoviesJoyProvider } from "./providers/moviesjoy.js";
export { ZoechipProvider } from "./providers/zoechip.js";
export { HiMoviesProvider } from "./providers/himovies.js";
export { DemoProvider, DEMO_STREAMS } from "./providers/demo.js";

// Registry
export {
  ProviderRegistry,
  registry,
  type RegistryOptions,
  type CheckAvailabilityOptions,
} from "./registry.js";

// Title Matcher
export {
  normalizeTitle,
  tokenize,
  levenshteinDistance,
  levenshteinSimilarity,
  tokenSimilarity,
  calculateYearScore,
  calculateMediaTypeScore,
  matchBestSearchResult,
} from "./titleMatcher.js";

// Quality Score & Ranking
export {
  getServiceScore,
  getStreamScore,
  parseQualityString,
  getResolutionScore,
  getContainerScore,
  getLatencyScore,
  type QualityScoreOptions,
  type ServerScoringRule,
  SCORE_WEIGHT_4K,
  SCORE_WEIGHT_1080P,
  SCORE_WEIGHT_720P,
  SCORE_WEIGHT_480P,
  SCORE_WEIGHT_HLS,
  SCORE_WEIGHT_MP4,
  SCORE_WEIGHT_PROVIDER_NOVA,
  SCORE_WEIGHT_PROVIDER_DEMO,
  SCORE_WEIGHT_PROVIDER_MOVIESJOY,
  SCORE_WEIGHT_PROVIDER_ZOECHIP,
  SCORE_WEIGHT_PROVIDER_HIMOVIES,
  DEFAULT_PROVIDER_WEIGHTS,
  DEFAULT_SERVER_RULES,
} from "./qualityScore.js";

// Health Check
export { probeStreamHealth, type ProbeOptions } from "./healthCheck.js";

// Utilities
export { BoundedCache, type CacheOptions } from "./utils/cache.js";
export {
  DEFAULT_USER_AGENT,
  getDefaultHeaders,
  getRefererHeaders,
} from "./utils/headers.js";
export {
  decodeHtmlEntities,
  extractAttribute,
  stripHtml,
} from "./utils/html.js";
export { getLogger, setLogger, nullLogger } from "./utils/logger.js";
export {
  normalizeLanguageCode,
  parseSubtitles,
  type RawSubtitle,
} from "./utils/subtitles.js";
