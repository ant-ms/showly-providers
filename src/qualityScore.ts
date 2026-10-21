import type { AvailableService, StreamSource } from "./types.js";

/**
 * Reliability, speed, and quality weights for ranking available stream servers and sources.
 *
 * Benchmark & scoring weights:
 * - Resolution: 4K (+16), 1080p (+10), 720p (+5), 480p (+2).
 * - Container: HLS (+8, adaptive bitrate streaming), MP4 (+4).
 * - Provider reliability: NovaHD (+12), Demo (+10), MoviesJoy (+8), Zoechip (+8), HiMovies (+6).
 * - Preferred CDN servers: Falcon (+6), MegaCloud (+5), UpCloud (+5), VidFast (+4), VixCloud (+3).
 * - Latency: <100ms (+6), <300ms (+4), <800ms (+2), >2000ms (-4).
 */
export const SCORE_WEIGHT_4K = 16;
export const SCORE_WEIGHT_1080P = 10;
export const SCORE_WEIGHT_720P = 5;
export const SCORE_WEIGHT_480P = 2;

export const SCORE_WEIGHT_HLS = 8;
export const SCORE_WEIGHT_MP4 = 4;

export const SCORE_WEIGHT_PROVIDER_NOVA = 12;
export const SCORE_WEIGHT_PROVIDER_DEMO = 10;
export const SCORE_WEIGHT_PROVIDER_MOVIESJOY = 8;
export const SCORE_WEIGHT_PROVIDER_ZOECHIP = 8;
export const SCORE_WEIGHT_PROVIDER_HIMOVIES = 6;

export const DEFAULT_PROVIDER_WEIGHTS: Record<string, number> = {
  novahd: SCORE_WEIGHT_PROVIDER_NOVA,
  nova: SCORE_WEIGHT_PROVIDER_NOVA,
  demo: SCORE_WEIGHT_PROVIDER_DEMO,
  moviesjoy: SCORE_WEIGHT_PROVIDER_MOVIESJOY,
  zoechip: SCORE_WEIGHT_PROVIDER_ZOECHIP,
  himovies: SCORE_WEIGHT_PROVIDER_HIMOVIES,
};

export interface ServerScoringRule {
  match: (serverName: string, serverId: string) => boolean;
  weight: number;
}

export const DEFAULT_SERVER_RULES: ServerScoringRule[] = [
  {
    match: (name, id) => name.includes("falcon") || id === "falcon",
    weight: 6,
  },
  {
    match: (name, id) =>
      name.includes("megacloud") ||
      name.includes("mega") ||
      id.includes("mega"),
    weight: 5,
  },
  {
    match: (name, id) => name.includes("upcloud") || id.includes("upcloud"),
    weight: 5,
  },
  {
    match: (name, id) => name.includes("vidfast") || id.includes("vidfast"),
    weight: 4,
  },
  {
    match: (name, id) => name.includes("vixcloud") || id.includes("vixsrc"),
    weight: 3,
  },
];

export interface QualityScoreOptions {
  providerWeights?: Record<string, number>;
  serverRules?: ServerScoringRule[];
}

export function parseQualityString(quality?: string): number {
  if (!quality) return 0;
  const q = quality.toLowerCase().trim();
  if (q.includes("4k") || q.includes("2160")) return 2160;
  if (q.includes("1080")) return 1080;
  if (q.includes("720")) return 720;
  if (q.includes("480")) return 480;
  if (q.includes("360")) return 360;
  if (q.includes("hd") || q.includes("hq")) return 1080;
  return 0;
}

export function getResolutionScore(resOrQuality?: number | string): number {
  const res =
    typeof resOrQuality === "number"
      ? resOrQuality
      : parseQualityString(resOrQuality);

  if (res >= 2160) return SCORE_WEIGHT_4K;
  if (res >= 1080) return SCORE_WEIGHT_1080P;
  if (res >= 720) return SCORE_WEIGHT_720P;
  if (res >= 480) return SCORE_WEIGHT_480P;
  return 0;
}

export function getContainerScore(
  container?: "hls" | "mp4" | string,
  url?: string,
): number {
  const c = (container || "").toLowerCase();
  const u = (url || "").toLowerCase();

  if (c === "hls" || u.includes(".m3u8")) return SCORE_WEIGHT_HLS;
  if (c === "mp4" || u.includes(".mp4")) return SCORE_WEIGHT_MP4;
  return 0;
}

export function getLatencyScore(latencyMs?: number): number {
  if (latencyMs === undefined || latencyMs === null || latencyMs < 0) return 0;
  if (latencyMs < 100) return 6;
  if (latencyMs < 300) return 4;
  if (latencyMs < 800) return 2;
  if (latencyMs > 2000) return -4;
  return 0;
}

/**
 * Computes an overall score for an available streaming server service.
 */
export function getServiceScore(
  service: AvailableService,
  options?: QualityScoreOptions,
): number {
  if (!service) return 0;
  let score = service.scoreBonus ?? 0;

  const providerWeights = options?.providerWeights ?? DEFAULT_PROVIDER_WEIGHTS;
  const pId = (service.providerId || "").toLowerCase();
  const pName = (service.providerName || service.providerId || "").toLowerCase();
  score += providerWeights[pId] ?? providerWeights[pName] ?? 0;

  const serverName = (service.serverName || "").toLowerCase();
  const serverId = (service.serverId || "").toLowerCase();
  const serverRules = options?.serverRules ?? DEFAULT_SERVER_RULES;

  for (const rule of serverRules) {
    if (rule.match(serverName, serverId)) {
      score += rule.weight;
      if (rule.weight > 0) break;
    }
  }

  if (service.quality) {
    score += getResolutionScore(service.quality);
  }

  return score;
}

/**
 * Computes a score for a resolved stream source based on resolution, container, latency, and subtitles.
 */
export function getStreamScore(
  stream: StreamSource,
  latencyMs?: number,
  providerBonus: number = 0,
): number {
  if (!stream) return 0;
  let score = providerBonus;

  // Resolution score
  const res = stream.resolution ?? stream.quality;
  score += getResolutionScore(res);

  // Container score
  score += getContainerScore(stream.container, stream.url);

  // Latency score
  score += getLatencyScore(latencyMs);

  // Subtitle bonus
  if (stream.subtitles && stream.subtitles.length > 0) {
    score += 2;
  }

  return score;
}
